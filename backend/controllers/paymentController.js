// backend/controllers/paymentController.js
const Order = require("../models/Order");
const orderFulfillmentService = require("../services/orderFulfillmentService");
const phonePeService = require("../services/phonePeService");
const paymentVisibilityService = require("../services/paymentVisibilityService");
const {
  onPaymentSucceeded,
  onPaymentFailed,
  onPaymentRetry,
} = require("../services/orderCommerceIntegrityService");
const { asyncHandler, sendErrorResponse, sendSuccessResponse, ERROR_CODES, HTTP_STATUS } = require("../utils/errorHandler");

/**
 * Extract paid amount in paisa from PhonePe V2 order-status payloads.
 * Returns null when no usable amount is present (caller may skip bind).
 */
function extractPhonePeAmountPaisa(statusResponse) {
  if (!statusResponse || typeof statusResponse !== "object") return null;

  const paymentDetails =
    statusResponse.paymentDetails ||
    statusResponse.data?.paymentDetails ||
    statusResponse.payment_details ||
    statusResponse.data?.payment_details ||
    null;

  let completedDetailAmount = null;
  if (Array.isArray(paymentDetails)) {
    const completed = paymentDetails.find(
      (d) => String(d?.state || "").toUpperCase() === "COMPLETED" && d?.amount != null
    );
    const firstWithAmount = paymentDetails.find((d) => d?.amount != null);
    const detail = completed || firstWithAmount;
    if (detail?.amount != null) completedDetailAmount = detail.amount;
  }

  const candidates = [
    statusResponse.amount,
    statusResponse.data?.amount,
    completedDetailAmount,
    statusResponse.amountInPaisa,
    statusResponse.data?.amountInPaisa,
    statusResponse.amount_paisa,
    statusResponse.data?.amount_paisa,
  ];

  for (const raw of candidates) {
    if (raw == null || raw === "") continue;
    const n = typeof raw === "number" ? raw : Number(String(raw).trim());
    if (Number.isFinite(n) && n >= 0) return Math.round(n);
  }

  return null;
}

function orderAmountPaisa(order) {
  return Math.round(Number(order.totalAmount) * 100);
}

/**
 * Apply PhonePe order-status state to a local order.
 * SEC-040: when COMPLETED payload includes an amount, it must match order.totalAmount (paisa).
 */
async function applyPhonePeStateToOrder(order, statusResponse) {
  const state = String(
    statusResponse?.state || statusResponse?.data?.state || ""
  ).toUpperCase();

  if (state === "COMPLETED") {
    const paidPaisa = extractPhonePeAmountPaisa(statusResponse);
    const expectedPaisa = orderAmountPaisa(order);

    if (paidPaisa != null && paidPaisa !== expectedPaisa) {
      console.error(
        `PhonePe amount mismatch (SEC-040): order=${order._id} paidPaisa=${paidPaisa} expectedPaisa=${expectedPaisa} — not marking paid`
      );
      // Failed-safe: do not mark paid, do not commit commerce integrity success
      order.paymentStatus = "pending";
      order.status = "pending_verification";
      await paymentVisibilityService.normalizeAndPersist(order, {
        phonePePayload: statusResponse,
      });
      return state;
    }

    order.paymentStatus = "success";
    order.status = "paid";
    try {
      await onPaymentSucceeded(order);
    } catch (err) {
      console.error("commerce integrity on PhonePe success failed:", err.message);
    }
    await paymentVisibilityService.normalizeAndPersist(order, {
      phonePePayload: statusResponse,
      paidAt: new Date(),
    });
  } else if (state === "FAILED") {
    order.paymentStatus = "failed";
    order.status = "cancelled";
    try {
      await onPaymentFailed(order);
    } catch (err) {
      console.error("commerce integrity on PhonePe failure failed:", err.message);
    }
    await paymentVisibilityService.normalizeAndPersist(order, {
      phonePePayload: statusResponse,
    });
  } else {
    order.paymentStatus = "pending";
    order.status = "pending_verification";
    await paymentVisibilityService.normalizeAndPersist(order, {
      phonePePayload: statusResponse,
    });
  }

  return state;
}

exports.applyPhonePeStateToOrder = applyPhonePeStateToOrder;
exports.extractPhonePeAmountPaisa = extractPhonePeAmountPaisa;

const PHONEPE_NOT_CONFIGURED_MSG = "PhonePe not configured";

if (!process.env.PHONEPE_CLIENT_ID || !process.env.PHONEPE_CLIENT_SECRET) {
  console.warn("PhonePe V2 configuration missing (PHONEPE_CLIENT_ID / PHONEPE_CLIENT_SECRET)");
}

/**
 * POST /api/payment/update-status — idempotent payment outcome for an order (admin / gateway).
 */
exports.updatePaymentStatus = asyncHandler(async (req, res) => {
  const { orderId, status, transactionId } = req.body;

  if (!orderId) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "orderId is required",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  const order = await Order.findById(orderId);
  if (!order) {
    return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, "Order not found", ERROR_CODES.RESOURCE_NOT_FOUND);
  }

  if (order.paymentStatus === "success") {
    return sendSuccessResponse(res, HTTP_STATUS.OK, "Order already paid", {
      orderId: order._id,
      paymentStatus: order.paymentStatus,
      orderStatus: order.status,
    });
  }

  if (status === "success") {
    order.paymentStatus = "success";
    order.status = "paid";
    order.paymentTransactionId = transactionId || order.paymentTransactionId || null;
    try {
      await onPaymentSucceeded(order);
    } catch (err) {
      console.error("commerce integrity on payment success failed:", err.message);
    }
    await paymentVisibilityService.normalizeAndPersist(order, { paidAt: new Date() });
  } else {
    order.paymentStatus = "failed";
    order.status = "cancelled";
    try {
      await onPaymentFailed(order);
    } catch (err) {
      console.error("commerce integrity on payment failure failed:", err.message);
    }
    await paymentVisibilityService.normalizeAndPersist(order);
  }

  await orderFulfillmentService.maybeSyncShiprocket(order._id).catch(() => {});

  return sendSuccessResponse(res, HTTP_STATUS.OK, "Payment status updated", {
    orderId: order._id,
    paymentStatus: order.paymentStatus,
    orderStatus: order.status,
    paymentTransactionId: order.paymentTransactionId,
  });
});

/**
 * POST /api/payment/verify — PhonePe V2 order status (poll after redirect).
 */
exports.verifyPaymentStatus = asyncHandler(async (req, res) => {
  try {
    const { orderId } = req.body || {};

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Missing orderId",
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (req.user?.id && order.buyer && order.buyer.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    if (order.paymentStatus === "success") {
      return res.status(200).json({
        success: true,
        message: "Already verified",
        status: "success",
        orderStatus: order.status,
      });
    }

    if (!order.paymentTransactionId) {
      return res.status(400).json({
        success: false,
        message: "No payment transaction on this order; cannot verify",
      });
    }

    if (!phonePeService.isV2Enabled()) {
      return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
        success: false,
        message: PHONEPE_NOT_CONFIGURED_MSG,
      });
    }

    const statusResponse = await phonePeService.checkPaymentStatus(
      order.paymentTransactionId,
      { details: true }
    );

    await applyPhonePeStateToOrder(order, statusResponse);

    if (order.status === "paid") {
      await orderFulfillmentService.maybeSyncShiprocket(order._id).catch(() => {});
    }

    return res.status(200).json({
      success: true,
      status: order.paymentStatus,
      orderStatus: order.status,
    });
  } catch (error) {
    console.error("Payment verification error:", error.message);

    return res.status(200).json({
      success: false,
      status: "pending",
      retry: true,
      message: "Verification temporarily unavailable",
    });
  }
});

/**
 * POST /api/admin/payment/reverify/:orderId — manual PhonePe status check (admin).
 */
exports.verifyPaymentAdmin = asyncHandler(async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (order.paymentStatus === "success") {
      return res.status(200).json({
        success: true,
        message: "Already verified",
        status: order.paymentStatus,
        orderStatus: order.status,
      });
    }

    if (!order.paymentTransactionId) {
      return res.status(400).json({ success: false, message: "Missing transaction ID" });
    }

    if (!phonePeService.isV2Enabled()) {
      return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
        success: false,
        message: PHONEPE_NOT_CONFIGURED_MSG,
      });
    }

    const statusResponse = await phonePeService.checkPaymentStatus(
      order.paymentTransactionId,
      { details: true }
    );

    const state = String(
      statusResponse?.data?.state || statusResponse?.state || ""
    ).toUpperCase();

    if (state !== "COMPLETED" && state !== "FAILED") {
      await paymentVisibilityService.normalizeAndPersist(order, {
        phonePePayload: statusResponse,
      });
      return res.status(200).json({
        success: true,
        status: order.paymentStatus,
        orderStatus: order.status,
        phonePeState: state,
        message: "Payment not yet completed",
      });
    }

    await applyPhonePeStateToOrder(order, statusResponse);

    if (order.status === "paid") {
      await orderFulfillmentService.maybeSyncShiprocket(order._id).catch(() => {});
    }

    return res.status(200).json({
      success: true,
      status: order.paymentStatus,
      orderStatus: order.status,
    });
  } catch (error) {
    console.error("Admin reverify error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Reverification failed",
    });
  }
});

/**
 * POST /api/payment/initiate — server-side PhonePe V2 checkout.
 */
exports.initiatePayment = asyncHandler(async (req, res) => {
  const { orderId } = req.body || {};

  if (!orderId) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "orderId is required",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  if (!phonePeService.isV2Enabled()) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      PHONEPE_NOT_CONFIGURED_MSG,
      ERROR_CODES.INTERNAL_SERVER_ERROR
    );
  }

  const order = await Order.findById(orderId);
  if (!order) {
    return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, "Order not found", ERROR_CODES.RESOURCE_NOT_FOUND);
  }

  if (req.user?.id) {
    if (!order.buyer || order.buyer.toString() !== req.user.id.toString()) {
      return sendErrorResponse(res, HTTP_STATUS.FORBIDDEN, "Access denied", ERROR_CODES.ACCESS_DENIED);
    }
  }

  // After a failed/cancelled unpaid order, re-claim stock and mint a fresh TXN
  // (prior PhonePe merchantOrderId is terminal — do not reuse it).
  let forceNewTransactionId = false;
  if (order.status === "cancelled" && order.paymentStatus === "failed") {
    const retry = await onPaymentRetry(order);
    if (!retry.success) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.CONFLICT,
        retry.error || "Insufficient stock to retry payment",
        ERROR_CODES.VALIDATION_REQUIRED_FIELDS
      );
    }
    order.status = "pending";
    order.paymentStatus = "pending";
    forceNewTransactionId = true;
    await order.save();
  }

  if (!["pending", "pending_verification"].includes(order.status) || order.paymentStatus !== "pending") {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Order is not eligible for payment initiation",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  const amountPaisa = Math.round(order.totalAmount * 100);

  // Re-initiate safety: reuse the existing pending TXN so verify/cron still see the
  // merchantOrderId the shopper may already have paid against. Mint a new id only
  // when none exists or after an explicit failed→retry path.
  let transactionId = order.paymentTransactionId || null;
  const canReusePendingTxn =
    !forceNewTransactionId &&
    Boolean(transactionId) &&
    order.paymentStatus === "pending" &&
    ["pending", "pending_verification"].includes(order.status);

  if (!canReusePendingTxn) {
    const shortOrderId = order._id.toString().slice(-8);
    const shortNow = Date.now().toString().slice(-6);
    transactionId = `TXN_${shortOrderId}_${shortNow}`;
  }

  const PHONEPE_REDIRECT_URL = process.env.PHONEPE_REDIRECT_URL || "http://localhost:3000/payment/success";

  const redirectUrl = `${PHONEPE_REDIRECT_URL}?orderId=${order._id}`;

  order.paymentTransactionId = transactionId;
  await paymentVisibilityService.normalizeAndPersist(order);

  const { redirectUrl: phonePeRedirectUrl } = await phonePeService.createPaymentRequest({
    merchantTransactionId: transactionId,
    amountPaisa,
    redirectUrl,
  });

  return sendSuccessResponse(res, HTTP_STATUS.OK, "Payment initiated successfully", {
    redirectUrl: phonePeRedirectUrl,
    transactionId,
    orderId: order._id,
  });
});
