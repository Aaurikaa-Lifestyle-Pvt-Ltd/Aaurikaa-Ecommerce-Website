/**
 * Phase 4 — After-Sales Refund orchestration.
 * Trigger: (receipt confirmed OR return-not-required) AND Resolution = Refund
 * → wallet credit + seller commission/ledger reversal (single flow, idempotent).
 */

const mongoose = require("mongoose");
const ReturnRequest = require("../models/ReturnRequest");
const Order = require("../models/Order");
const {
  processRefundFinancialReversal,
  markFinancialReversalProcessed,
} = require("./returnRefundFinancialService");
const { creditRefundToWallet, roundMoney } = require("./shopperWalletService");
const { buildOrderFinancialSnapshot } = require("../utils/orderFinancialSnapshot");

/**
 * Whether automated refund processing can run for this after-sales case.
 */
function canAutomateAfterSalesRefund(returnRequest) {
  if (!returnRequest || returnRequest.caseFlow !== "after_sales") {
    return false;
  }
  if (returnRequest.resolution !== "refund") {
    return false;
  }
  if (returnRequest.walletCreditProcessedAt || returnRequest.refundCompletedAt) {
    return false;
  }
  if (returnRequest.returnRequired === true) {
    return !!returnRequest.receiptConfirmedAt;
  }
  if (returnRequest.returnRequired === false) {
    return true;
  }
  return false;
}

/**
 * MVP full-order refundable amount = payable order total from the financial snapshot.
 * Policy: RETURN_REFUND_FINANCIAL_POLICY.reversalScope = "full_order" (not item-level).
 * Uses buildOrderFinancialSnapshot().total (canonical payable total), not ad-hoc fields.
 */
function resolveRefundAmount(order) {
  const snapshot = buildOrderFinancialSnapshot(order);
  const payable = roundMoney(snapshot.total);
  if (payable > 0) {
    return payable;
  }
  return roundMoney(order?.totalAmount);
}

/**
 * Run wallet credit + seller financial reversal for an eligible after-sales Refund resolution.
 */
async function processAfterSalesRefund({ returnRequestId, session = null }) {
  if (!mongoose.isValidObjectId(returnRequestId)) {
    return { invalid: true, message: "Invalid return request reference" };
  }

  let requestQuery = ReturnRequest.findById(returnRequestId);
  if (session) requestQuery = requestQuery.session(session);
  const returnRequest = await requestQuery;

  if (!returnRequest) {
    return { notFound: true, message: "Return request not found" };
  }

  if (returnRequest.walletCreditProcessedAt) {
    return {
      skipped: true,
      alreadyProcessed: true,
      amount: returnRequest.walletCreditAmount || null,
    };
  }

  if (!canAutomateAfterSalesRefund(returnRequest)) {
    return { skipped: true, notEligible: true };
  }

  let orderQuery = Order.findById(returnRequest.order).select(
    "totalAmount invoiceNumber buyer shippingCharge coupon bulkDiscountSummary tax items"
  );
  if (session) orderQuery = orderQuery.session(session);
  const order = await orderQuery;

  if (!order) {
    return { notFound: true, message: "Linked order not found" };
  }

  const amount = resolveRefundAmount(order);
  if (amount <= 0) {
    return { invalid: true, message: "Refund amount must be positive" };
  }

  const financialResult = await processRefundFinancialReversal({
    returnRequestId,
    orderId: returnRequest.order,
    session,
  });

  if (financialResult?.invalid || financialResult?.notFound) {
    return {
      financialFailed: true,
      message: financialResult.message || "Financial reversal could not be processed",
    };
  }

  if (financialResult?.persistMarker && !financialResult?.skipped) {
    await markFinancialReversalProcessed(returnRequestId, financialResult.summary, session);
  }

  const orderLabel = order.invoiceNumber || String(order._id);
  const walletResult = await creditRefundToWallet({
    shopperId: returnRequest.buyer,
    amount,
    returnRequestId,
    orderId: order._id,
    orderLabel,
    session,
  });

  if (walletResult?.invalid) {
    return {
      walletFailed: true,
      message: walletResult.message || "Wallet credit failed",
    };
  }

  const now = new Date();
  const update = {
    refundCompletedAt: now,
    walletCreditProcessedAt: now,
    walletCreditAmount: amount,
  };
  const options = { new: true };
  if (session) options.session = session;
  await ReturnRequest.findByIdAndUpdate(returnRequestId, update, options);

  return {
    processed: true,
    amount,
    walletCredit: walletResult,
    financialReversal: financialResult.summary || null,
  };
}

/**
 * Attempt after-sales refund orchestration (with Mongo transaction when supported).
 */
async function runAfterSalesRefundOrchestration(returnRequestId) {
  const run = async (session) => processAfterSalesRefund({ returnRequestId, session });

  try {
    const session = await mongoose.startSession();
    let result;
    await session.withTransaction(async () => {
      result = await run(session);
      if (result?.financialFailed || result?.walletFailed) {
        throw new Error(result.message || "After-sales refund orchestration failed");
      }
    });
    await session.endSession();
    return result;
  } catch (txErr) {
    const isStandalone = /replica set|transaction numbers|only allowed on a replica set member or mongos/i.test(
      txErr.message || ""
    );
    if (isStandalone) {
      const result = await run(null);
      if (result?.financialFailed || result?.walletFailed) {
        throw new Error(result.message || "After-sales refund orchestration failed");
      }
      return result;
    }
    if (txErr.message && !/After-sales refund orchestration failed/i.test(txErr.message)) {
      throw txErr;
    }
    return {
      financialFailed: true,
      message: txErr.message || "After-sales refund orchestration failed",
    };
  }
}

/**
 * Invoke orchestration when seller records Refund resolution (non-blocking errors logged).
 */
async function tryAfterSalesRefundOnResolution({ requestId, resolution }) {
  if (String(resolution || "").toLowerCase() !== "refund") {
    return null;
  }
  try {
    return await runAfterSalesRefundOrchestration(requestId);
  } catch (err) {
    console.error("After-sales refund orchestration error:", err.message || err);
    return {
      orchestrationFailed: true,
      message: err.message || "Refund orchestration failed",
    };
  }
}

module.exports = {
  canAutomateAfterSalesRefund,
  resolveRefundAmount,
  processAfterSalesRefund,
  runAfterSalesRefundOrchestration,
  tryAfterSalesRefundOnResolution,
};
