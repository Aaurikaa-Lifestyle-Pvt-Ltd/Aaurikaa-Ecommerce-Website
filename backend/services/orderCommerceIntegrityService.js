/**
 * Orchestrates inventory + coupon side effects for order/payment transitions.
 * Callers persist the order after these mutations.
 */

const {
  reserveStockForOrder,
  commitStockForOrder,
  releaseStockForOrder,
} = require("./inventoryLifecycleService");
const {
  markCouponApplied,
  consumeCouponForOrder,
  releaseCouponForOrder,
} = require("./couponLifecycleService");

function isCodOrder(order) {
  return String(order?.paymentMethod || "").toLowerCase() === "cod";
}

/**
 * After Order.save() on checkout.
 * Prepaid: reserve stock, do not consume coupon.
 * COD: reserve + commit stock and consume coupon (confirmed purchase).
 */
async function onOrderCreated(order, { isCod, requestInfo } = {}) {
  markCouponApplied(order);

  const reserved = await reserveStockForOrder(order);
  if (!reserved.success) {
    return reserved;
  }

  const cod = isCod === undefined ? isCodOrder(order) : Boolean(isCod);
  if (cod) {
    const committed = await commitStockForOrder(order);
    if (!committed.success) return committed;
    const consumed = await consumeCouponForOrder(order, requestInfo || {});
    if (!consumed.success) return consumed;
  }

  return { success: true };
}

/**
 * PhonePe COMPLETED / admin payment success. Idempotent.
 */
async function onPaymentSucceeded(order, requestInfo = {}) {
  const committed = await commitStockForOrder(order);
  if (!committed.success) return committed;
  return consumeCouponForOrder(order, requestInfo);
}

/**
 * PhonePe FAILED / admin payment failed. Idempotent.
 * Prepaid coupons are not consumed until success, so release is a no-op there.
 */
async function onPaymentFailed(order) {
  const released = await releaseStockForOrder(order);
  if (!released.success) return released;
  return releaseCouponForOrder(order);
}

/**
 * Eligible cancellation. Restores stock and coupon quota when they were claimed.
 * Does not implement refunds (SEC-006 HOLD).
 */
async function onOrderCancelled(order) {
  const released = await releaseStockForOrder(order);
  if (!released.success) return released;
  return releaseCouponForOrder(order);
}

/**
 * Payment retry after failed/cancelled unpaid order. Re-claims stock if released.
 */
async function onPaymentRetry(order) {
  return reserveStockForOrder(order);
}

module.exports = {
  onOrderCreated,
  onPaymentSucceeded,
  onPaymentFailed,
  onOrderCancelled,
  onPaymentRetry,
};
