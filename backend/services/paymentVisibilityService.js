/**
 * Normalizes order payment metadata for admin/seller visibility.
 * Write once at payment lifecycle events; read via toPaymentVisibilityDTO.
 */

const PAYMENT_TYPE_MAP = {
  cod: { paymentType: "COD", gateway: null },
  phonepe: { paymentType: "ONLINE", gateway: "PHONEPE" },
  stripe: { paymentType: "ONLINE", gateway: "STRIPE" },
  razorpay: { paymentType: "ONLINE", gateway: "RAZORPAY" },
  upi: { paymentType: "ONLINE", gateway: "UPI" },
  upi_manual: { paymentType: "OFFLINE", gateway: null },
  bank: { paymentType: "OFFLINE", gateway: null },
};

function normalizePaymentMethodKey(paymentMethod) {
  if (!paymentMethod || typeof paymentMethod !== "string") return "";
  return paymentMethod.trim().toLowerCase();
}

function mapPaymentType(paymentMethod) {
  const key = normalizePaymentMethodKey(paymentMethod);
  return PAYMENT_TYPE_MAP[key] || { paymentType: "ONLINE", gateway: key ? key.toUpperCase() : null };
}

function mapPaymentStatus(paymentStatus, orderStatus, paymentMethod, paymentTransactionId) {
  const ps = (paymentStatus || "").toLowerCase();
  const os = (orderStatus || "").toLowerCase();
  const method = normalizePaymentMethodKey(paymentMethod);

  if (ps === "success" || os === "paid") return "PAID";
  if (ps === "failed" || os === "failed" || os === "cancelled") {
    if (ps === "failed") return "FAILED";
  }

  if (method === "phonepe" && paymentTransactionId) return "PROCESSING";
  if (ps === "pending") return "PENDING";

  return "PENDING";
}

function extractChannelFromPhonePePayload(statusResponse) {
  if (!statusResponse || typeof statusResponse !== "object") return null;

  const candidates = [
    statusResponse?.paymentInstrument?.type,
    statusResponse?.data?.paymentInstrument?.type,
    statusResponse?.paymentDetails?.[0]?.paymentMode,
    statusResponse?.data?.paymentDetails?.[0]?.paymentMode,
    statusResponse?.paymentMode,
    statusResponse?.data?.paymentMode,
    statusResponse?.instrumentType,
    statusResponse?.data?.instrumentType,
  ];

  for (const c of candidates) {
    if (c && typeof c === "string" && c.trim()) {
      return c.trim().toUpperCase();
    }
  }

  return null;
}

function buildPaymentDetails(order, options = {}) {
  const { phonePePayload, paidAt } = options;
  const method = normalizePaymentMethodKey(order.paymentMethod);
  const { paymentType, gateway } = mapPaymentType(order.paymentMethod);

  const channel =
    order.paymentDetails?.channel ||
    extractChannelFromPhonePePayload(phonePePayload) ||
    null;

  const transactionId =
    order.paymentTransactionId ||
    order.upiTxnId ||
    order.paymentDetails?.transactionId ||
    null;

  const displayStatus = mapPaymentStatus(
    order.paymentStatus,
    order.status,
    order.paymentMethod,
    order.paymentTransactionId
  );

  const resolvedPaidAt =
    paidAt ||
    order.paymentDetails?.paidAt ||
    (displayStatus === "PAID" ? order.updatedAt || new Date() : null);

  return {
    paymentType,
    gateway,
    channel,
    transactionId,
    paymentStatus: displayStatus,
    paidAt: resolvedPaidAt,
  };
}

function applyPaymentDetailsToOrder(order, details) {
  if (!order.paymentDetails || typeof order.paymentDetails !== "object") {
    order.paymentDetails = {};
  }
  order.paymentDetails.paymentType = details.paymentType;
  order.paymentDetails.gateway = details.gateway;
  order.paymentDetails.channel = details.channel;
  order.paymentDetails.transactionId = details.transactionId;
  order.paymentDetails.paymentStatus = details.paymentStatus;
  order.paymentDetails.paidAt = details.paidAt;
  order.markModified("paymentDetails");
}

async function normalizeAndPersist(order, options = {}) {
  const details = buildPaymentDetails(order, options);
  applyPaymentDetailsToOrder(order, details);
  await order.save();
  return details;
}

function toPaymentVisibilityDTO(order) {
  const plain = order && typeof order.toObject === "function" ? order.toObject() : order || {};
  const stored = plain.paymentDetails || {};
  const { paymentType, gateway } =
    stored.paymentType
      ? { paymentType: stored.paymentType, gateway: stored.gateway ?? null }
      : mapPaymentType(plain.paymentMethod);

  const paymentStatus =
    stored.paymentStatus ||
    mapPaymentStatus(
      plain.paymentStatus,
      plain.status,
      plain.paymentMethod,
      plain.paymentTransactionId
    );

  const transactionId =
    stored.transactionId || plain.paymentTransactionId || plain.upiTxnId || null;

  const channel = stored.channel ?? null;

  const paidAt = stored.paidAt
    ? stored.paidAt instanceof Date
      ? stored.paidAt.toISOString()
      : stored.paidAt
    : null;

  return {
    paymentMethod: paymentType,
    paymentGateway: gateway,
    paymentChannel: channel,
    paymentStatus,
    transactionId,
    paidAt,
  };
}

module.exports = {
  mapPaymentType,
  mapPaymentStatus,
  extractChannelFromPhonePePayload,
  buildPaymentDetails,
  applyPaymentDetailsToOrder,
  normalizeAndPersist,
  toPaymentVisibilityDTO,
};
