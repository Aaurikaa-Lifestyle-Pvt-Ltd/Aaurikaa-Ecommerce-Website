/**
 * Checkout order-create idempotency helpers.
 * Client attempt key → Order.checkoutIdempotencyKey (unique per buyer when set).
 */

const Order = require("../models/Order");

const IDEMPOTENCY_KEY_MAX_LENGTH = 128;
/** Printable ASCII excluding whitespace (Stripe-style opaque keys). */
const IDEMPOTENCY_KEY_CHARSET = /^[\x21-\x7E]+$/;

/**
 * Extract Idempotency-Key from header (prefer) or body.idempotencyKey.
 * @returns {{ present: false, key: null } | { present: true, key: string } | { present: true, key: null, error: string }}
 */
function extractCheckoutIdempotencyKey(req) {
  const headerRaw = req.get("Idempotency-Key");
  let candidate;
  if (typeof headerRaw === "string" && headerRaw.trim() !== "") {
    candidate = headerRaw;
  } else if (req.body && req.body.idempotencyKey != null && req.body.idempotencyKey !== "") {
    candidate = req.body.idempotencyKey;
  } else {
    return { present: false, key: null };
  }

  if (typeof candidate !== "string") {
    return { present: true, key: null, error: "Idempotency-Key must be a string" };
  }

  const key = candidate.trim();
  if (!key) {
    return { present: true, key: null, error: "Idempotency-Key must not be empty" };
  }
  if (key.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    return {
      present: true,
      key: null,
      error: `Idempotency-Key must be at most ${IDEMPOTENCY_KEY_MAX_LENGTH} characters`,
    };
  }
  if (!IDEMPOTENCY_KEY_CHARSET.test(key)) {
    return {
      present: true,
      key: null,
      error: "Idempotency-Key contains invalid characters",
    };
  }

  return { present: true, key };
}

function findOrderByCheckoutIdempotencyKey(buyerId, key) {
  return Order.findOne({ buyer: buyerId, checkoutIdempotencyKey: key });
}

function isMongoDuplicateKeyError(err) {
  return Boolean(err && (err.code === 11000 || err.code === 11001));
}

/**
 * True when a duplicate-key error is (or may be) the checkout idempotency compound index.
 */
function isCheckoutIdempotencyDuplicateKey(err) {
  if (!isMongoDuplicateKeyError(err)) return false;
  if (err.keyPattern && Object.prototype.hasOwnProperty.call(err.keyPattern, "checkoutIdempotencyKey")) {
    return true;
  }
  if (err.keyValue && Object.prototype.hasOwnProperty.call(err.keyValue, "checkoutIdempotencyKey")) {
    return true;
  }
  const msg = `${err.message || ""} ${err.errmsg || ""}`;
  return msg.includes("checkoutIdempotencyKey");
}

/**
 * Same success JSON shape as a fresh create (plus optional idempotentReplay).
 */
async function buildOrderCreateSuccessPayload(order, { idempotentReplay = false } = {}) {
  await order.populate("items.product", "name mainImage regularPrice salePrice");
  const payload = {
    message: "✅ Order created successfully with bulk discount processing and invoice integration",
    order,
    bulkDiscountSummary: order.bulkDiscountSummary,
    invoiceNumber: order.invoiceNumber,
  };
  if (idempotentReplay) {
    payload.idempotentReplay = true;
  }
  return payload;
}

module.exports = {
  IDEMPOTENCY_KEY_MAX_LENGTH,
  extractCheckoutIdempotencyKey,
  findOrderByCheckoutIdempotencyKey,
  isMongoDuplicateKeyError,
  isCheckoutIdempotencyDuplicateKey,
  buildOrderCreateSuccessPayload,
};
