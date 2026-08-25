const REASON = {
  ELIGIBLE: "ELIGIBLE",
  ORDER_ALREADY_CANCELLED: "ORDER_ALREADY_CANCELLED",
  SHIPMENT_CREATED: "SHIPMENT_CREATED",
  AWB_ASSIGNED: "AWB_ASSIGNED",
  ORDER_ALREADY_SHIPPED: "ORDER_ALREADY_SHIPPED",
  ORDER_ALREADY_DELIVERED: "ORDER_ALREADY_DELIVERED",
  CANCELLATION_NOT_ALLOWED: "CANCELLATION_NOT_ALLOWED",
};

const REASON_MESSAGES = {
  [REASON.ELIGIBLE]: "Order can be cancelled.",
  [REASON.ORDER_ALREADY_CANCELLED]: "This order has already been cancelled.",
  [REASON.SHIPMENT_CREATED]: "A shipment has been created for this order.",
  [REASON.AWB_ASSIGNED]: "Order can no longer be cancelled.",
  [REASON.ORDER_ALREADY_SHIPPED]: "This order has already been shipped.",
  [REASON.ORDER_ALREADY_DELIVERED]: "This order has already been delivered.",
  [REASON.CANCELLATION_NOT_ALLOWED]: "This order cannot be cancelled.",
};

const DELIVERED_STATUSES = new Set(["delivered", "completed"]);
const SHIPPED_STATUSES = new Set(["shipped", "dispatched"]);

const ALLOWED_REASON_CODES = new Set([
  "ORDERED_BY_MISTAKE",
  "FOUND_BETTER_PRICE",
  "DELIVERY_TOO_SLOW",
  "PAYMENT_ISSUE",
  "CHANGE_OF_MIND",
  "OTHER",
]);

const CUSTOM_REASON_MAX_LENGTH = 500;

function normalizePlain(order) {
  return order && typeof order.toObject === "function" ? order.toObject() : order || {};
}

function normalizeStatus(status) {
  if (!status) return "";
  return String(status).trim().toLowerCase();
}

function hasAwb(order) {
  const plain = normalizePlain(order);
  const legacyAwb = plain.trackingNumber && String(plain.trackingNumber).trim();
  if (legacyAwb) return true;

  const shipments = Array.isArray(plain.shiprocketShipments) ? plain.shiprocketShipments : [];
  return shipments.some((s) => s.trackingNumber && String(s.trackingNumber).trim());
}

function hasShipments(order) {
  const plain = normalizePlain(order);
  return Array.isArray(plain.shiprocketShipments) && plain.shiprocketShipments.length > 0;
}

function buildEligibility(eligible, reason) {
  return {
    eligible,
    reason: eligible ? REASON.ELIGIBLE : reason,
    message: REASON_MESSAGES[eligible ? REASON.ELIGIBLE : reason] || REASON_MESSAGES[REASON.CANCELLATION_NOT_ALLOWED],
  };
}

/**
 * Authoritative read-only cancellation eligibility from stored order state only.
 */
function getCancellationEligibility(order) {
  const plain = normalizePlain(order);
  const status = normalizeStatus(plain.status);

  if (status === "cancelled") {
    return buildEligibility(false, REASON.ORDER_ALREADY_CANCELLED);
  }

  if (DELIVERED_STATUSES.has(status)) {
    return buildEligibility(false, REASON.ORDER_ALREADY_DELIVERED);
  }

  if (SHIPPED_STATUSES.has(status)) {
    return buildEligibility(false, REASON.ORDER_ALREADY_SHIPPED);
  }

  if (hasAwb(plain)) {
    return buildEligibility(false, REASON.AWB_ASSIGNED);
  }

  if (hasShipments(plain)) {
    return buildEligibility(false, REASON.SHIPMENT_CREATED);
  }

  return buildEligibility(true, REASON.ELIGIBLE);
}

function canCancelOrder(order) {
  return getCancellationEligibility(order).eligible;
}

function sanitizeText(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/[\x00-\x1F\x7F]/g, "")
    .trim();
}

/**
 * Validates mandatory cancellation reason payload.
 */
function validateCancellationReason({ reasonCode, customReason }) {
  const code = sanitizeText(reasonCode).toUpperCase();

  if (!code) {
    return { valid: false, message: "Cancellation reason is required." };
  }

  if (!ALLOWED_REASON_CODES.has(code)) {
    return { valid: false, message: "Invalid cancellation reason." };
  }

  const sanitizedCustom = sanitizeText(customReason);

  if (code === "OTHER") {
    if (!sanitizedCustom) {
      return { valid: false, message: "Please provide a reason for cancellation." };
    }
    if (sanitizedCustom.length > CUSTOM_REASON_MAX_LENGTH) {
      return {
        valid: false,
        message: `Custom reason must be ${CUSTOM_REASON_MAX_LENGTH} characters or fewer.`,
      };
    }
    return {
      valid: true,
      reasonCode: code,
      reasonText: sanitizedCustom,
    };
  }

  if (sanitizedCustom.length > CUSTOM_REASON_MAX_LENGTH) {
    return {
      valid: false,
      message: `Custom reason must be ${CUSTOM_REASON_MAX_LENGTH} characters or fewer.`,
    };
  }

  return {
    valid: true,
    reasonCode: code,
    reasonText: sanitizedCustom || null,
  };
}

module.exports = {
  REASON,
  REASON_MESSAGES,
  ALLOWED_REASON_CODES,
  CUSTOM_REASON_MAX_LENGTH,
  getCancellationEligibility,
  canCancelOrder,
  validateCancellationReason,
  sanitizeText,
};
