/**
 * Phase D — commission / ledger / payout integration on refund completion.
 * Invoked when admin marks a return request refund as completed.
 */

const mongoose = require("mongoose");
const Commission = require("../models/Commission");
const Payout = require("../models/Payout");
const SellerLedger = require("../models/SellerLedger");
const ReturnRequest = require("../models/ReturnRequest");
const Order = require("../models/Order");
const { RETURN_REFUND_FINANCIAL_POLICY: POLICY } = require("../config/returnRefundFinancialPolicy");
const { validateSellerLedgerIntegrity } = require("../utils/financialIntegrityValidator");

const REVERSIBLE_STATUSES = ["approved", "locked", "paid", "disputed", "pending"];

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function calcSellerNet(commission) {
  return roundMoney(commission.orderAmount - commission.commissionAmount);
}

function emptySummary() {
  return {
    commissionsCancelled: 0,
    commissionsClawedBack: 0,
    ledgerReversalAmount: 0,
    pendingPayoutsRejected: 0,
    payoutsNeedingReview: [],
    skippedNoCommission: false,
  };
}

async function getLatestLedgerBalance(sellerId, session = null) {
  let query = SellerLedger.findOne({ seller: sellerId }).sort({ createdAt: -1 });
  if (session) query = query.session(session);
  const lastEntry = await query.lean();
  return lastEntry ? lastEntry.balanceAfter : 0;
}

async function appendLedgerEntry({
  sellerId,
  type,
  amount,
  balanceAfter,
  reference,
  description,
  createdAt,
  session = null,
}) {
  const payload = {
    seller: sellerId,
    type,
    amount,
    balanceAfter,
    reference,
    description,
    createdAt: createdAt || new Date(),
  };
  if (session) {
    await SellerLedger.create([payload], { session });
  } else {
    await SellerLedger.create(payload);
  }
}

async function rejectPendingPayout(payout, returnRequestId, session = null) {
  if (payout.status !== "pending") {
    return false;
  }

  payout.status = "rejected";
  payout.rejectionReason = `Auto-rejected: order refund completed (Return #${returnRequestId})`;
  await payout.save(session ? { session } : {});

  await Commission.updateMany(
    { lockedBy: payout._id },
    { $set: { status: "approved", lockedBy: null } },
    session ? { session } : {}
  );

  const currentBalance = await getLatestLedgerBalance(payout.seller, session);
  await appendLedgerEntry({
    sellerId: payout.seller,
    type: "payout_rejected",
    amount: payout.amount,
    balanceAfter: roundMoney(currentBalance + payout.amount),
    reference: { model: "Payout", id: payout._id },
    description: `Payout #${payout._id} auto-rejected due to order refund completion`,
    session,
  });

  return true;
}

async function unlockCommission(commission, session = null) {
  if (commission.status !== "locked") {
    return commission;
  }

  commission.status = "approved";
  commission.lockedBy = null;
  await commission.save(session ? { session } : {});
  return commission;
}

async function cancelCommission(commission, session = null) {
  let doc = commission;
  if (commission._id) {
    let query = Commission.findById(commission._id);
    if (session) query = query.session(session);
    doc = await query;
  }

  if (!doc || doc.status === "cancelled" || doc.status === "paid") {
    return doc;
  }

  if (doc.status === "locked") {
    doc.status = "approved";
    doc.lockedBy = null;
    await doc.save(session ? { session } : {});
  }

  if (["approved", "pending", "disputed"].includes(doc.status)) {
    doc.status = "cancelled";
    await doc.save(session ? { session } : {});
  }

  return doc;
}

async function reverseCommissionFinancials({
  commission,
  returnRequestId,
  orderLabel,
  summary,
  ledgerTimeOffsetMs,
  rejectedPayoutIds,
  session = null,
}) {
  const sellerNet = calcSellerNet(commission);
  if (sellerNet <= 0) {
    return;
  }

  const wasPaid = commission.status === "paid";

  if (commission.status === "locked") {
    const payoutId = commission.lockedBy;
    if (payoutId) {
      let payoutQuery = Payout.findById(payoutId);
      if (session) payoutQuery = payoutQuery.session(session);
      const payout = await payoutQuery;

      if (payout) {
        if (payout.status === "pending" && POLICY.pendingPayoutBehavior === "auto_reject") {
          const payoutKey = String(payout._id);
          if (!rejectedPayoutIds.has(payoutKey)) {
            const rejected = await rejectPendingPayout(payout, returnRequestId, session);
            if (rejected) {
              rejectedPayoutIds.add(payoutKey);
              summary.pendingPayoutsRejected += 1;
            }
          }
        } else if (
          payout.status === "approved" &&
          POLICY.approvedPayoutBehavior === "unlock_and_warn"
        ) {
          const payoutKey = String(payout._id);
          if (!summary.payoutsNeedingReview.includes(payoutKey)) {
            summary.payoutsNeedingReview.push(payoutKey);
          }
        }
      }
    }

    await unlockCommission(commission, session);
  }

  let freshQuery = Commission.findById(commission._id);
  if (session) freshQuery = freshQuery.session(session);
  const freshCommission = await freshQuery;
  if (freshCommission) {
    commission.status = freshCommission.status;
    commission.lockedBy = freshCommission.lockedBy;
  }

  if (freshCommission?.status === "disputed" && POLICY.disputedCommissionBehavior === "cancel") {
    await cancelCommission(freshCommission, session);
    summary.commissionsCancelled += 1;
  } else if (
    freshCommission &&
    (freshCommission.status === "approved" || freshCommission.status === "pending")
  ) {
    await cancelCommission(freshCommission, session);
    summary.commissionsCancelled += 1;
  } else if (wasPaid && POLICY.paidCommissionBehavior === "ledger_clawback_only") {
    summary.commissionsClawedBack += 1;
  }

  const existingReversal = await SellerLedger.findOne({
    seller: commission.seller,
    type: "commission_reversed",
    "reference.model": "Commission",
    "reference.id": commission._id,
    description: { $regex: String(returnRequestId) },
  })
    .session(session || null)
    .lean();

  if (existingReversal) {
    return;
  }

  const currentBalance = await getLatestLedgerBalance(commission.seller, session);
  const reversalAmount = -sellerNet;
  let balanceAfter = roundMoney(currentBalance + reversalAmount);

  if (!POLICY.allowNegativeSellerBalance && balanceAfter < 0) {
    throw new Error(
      `Seller ledger clawback would exceed available balance for commission ${commission._id}`
    );
  }

  await appendLedgerEntry({
    sellerId: commission.seller,
    type: "commission_reversed",
    amount: reversalAmount,
    balanceAfter,
    reference: { model: "Commission", id: commission._id },
    description: `Commission reversed for Order #${orderLabel} (Return #${returnRequestId})`,
    createdAt: new Date(Date.now() + ledgerTimeOffsetMs),
    session,
  });

  summary.ledgerReversalAmount = roundMoney(summary.ledgerReversalAmount + Math.abs(reversalAmount));
}

/**
 * Process seller financial reversal for all commissions on an order.
 * Idempotent per return request.
 */
async function processRefundFinancialReversal({ returnRequestId, orderId, session = null }) {
  if (!mongoose.isValidObjectId(returnRequestId) || !mongoose.isValidObjectId(orderId)) {
    return { invalid: true, message: "Invalid return request or order reference" };
  }

  let requestQuery = ReturnRequest.findById(returnRequestId);
  if (session) requestQuery = requestQuery.session(session);
  const returnRequest = await requestQuery;

  if (!returnRequest) {
    return { notFound: true, message: "Return request not found" };
  }

  if (returnRequest.financialReversalProcessedAt) {
    return {
      skipped: true,
      summary: returnRequest.financialReversalSummary || emptySummary(),
    };
  }

  let orderQuery = Order.findById(orderId).select("invoiceNumber");
  if (session) orderQuery = orderQuery.session(session);
  const order = await orderQuery;

  if (!order) {
    return { notFound: true, message: "Linked order not found" };
  }

  let commissionQuery = Commission.find({
    order: orderId,
    status: { $in: REVERSIBLE_STATUSES },
  }).sort({ createdAt: 1 });
  if (session) commissionQuery = commissionQuery.session(session);
  const commissions = await commissionQuery;

  const summary = emptySummary();

  if (commissions.length === 0) {
    if (POLICY.noCommissionBehavior === "skip_seller_reversal") {
      summary.skippedNoCommission = true;
      return { summary, persistMarker: true };
    }
  }

  const orderLabel = order.invoiceNumber || String(order._id);
  const rejectedPayoutIds = new Set();
  let offset = 0;

  for (const commission of commissions) {
    await reverseCommissionFinancials({
      commission,
      returnRequestId,
      orderLabel,
      summary,
      ledgerTimeOffsetMs: offset,
      rejectedPayoutIds,
      session,
    });
    offset += 1;
  }

  return { summary, persistMarker: true };
}

async function markFinancialReversalProcessed(returnRequestId, summary, session = null) {
  const update = {
    financialReversalProcessedAt: new Date(),
    financialReversalSummary: summary,
  };
  const options = { new: true };
  if (session) options.session = session;
  await ReturnRequest.findByIdAndUpdate(returnRequestId, update, options);
}

/**
 * Run refund financial reversal with transaction when MongoDB supports it.
 */
async function runRefundFinancialReversal(returnRequestId, orderId) {
  const run = async (session) => {
    const result = await processRefundFinancialReversal({
      returnRequestId,
      orderId,
      session,
    });

    if (result?.persistMarker && !result?.skipped) {
      await markFinancialReversalProcessed(returnRequestId, result.summary, session);
      const commissions = await Commission.find({ order: orderId })
        .session(session || null)
        .select("seller")
        .lean();
      const sellerIds = [...new Set(commissions.map((c) => String(c.seller)))];
      for (const sellerId of sellerIds) {
        validateSellerLedgerIntegrity(sellerId).catch(() => {});
      }
    }

    return result;
  };

  try {
    const session = await mongoose.startSession();
    let result;
    await session.withTransaction(async () => {
      result = await run(session);
    });
    await session.endSession();
    return result;
  } catch (txErr) {
    const isStandalone = /replica set|transaction numbers|only allowed on a replica set member or mongos/i.test(
      txErr.message || ""
    );
    if (isStandalone) {
      return run(null);
    }
    throw txErr;
  }
}

module.exports = {
  calcSellerNet,
  emptySummary,
  processRefundFinancialReversal,
  runRefundFinancialReversal,
  markFinancialReversalProcessed,
  rejectPendingPayout,
};
