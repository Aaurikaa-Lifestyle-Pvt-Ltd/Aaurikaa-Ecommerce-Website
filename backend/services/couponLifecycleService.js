/**
 * Coupon consumption timing on the existing Coupon usage model.
 *
 * validate  — checkout already validates via pricingEngine.validateCoupon
 * applied   — discount stored on the unpaid/COD order; quota not incremented
 * consumed  — usedCount / usageHistory written (payment success or COD confirm)
 * released  — quota restored after cancel/fail of a consumed coupon
 */

const { recordCouponUsage, releaseCouponUsage } = require("../utils/pricingEngine");

const COUPON_STATES = {
  NONE: "none",
  APPLIED: "applied",
  CONSUMED: "consumed",
  RELEASED: "released",
};

function getCouponState(order) {
  return order?.couponLifecycle?.state || COUPON_STATES.NONE;
}

function markCoupon(order, patch) {
  const current =
    order.couponLifecycle && typeof order.couponLifecycle.toObject === "function"
      ? order.couponLifecycle.toObject()
      : { ...(order.couponLifecycle || {}) };
  order.couponLifecycle = { ...current, ...patch };
  if (typeof order.markModified === "function") {
    order.markModified("couponLifecycle");
  }
}

function markCouponApplied(order) {
  if (!order?.coupon?.code) {
    markCoupon(order, { state: COUPON_STATES.NONE });
    return;
  }
  if (getCouponState(order) === COUPON_STATES.CONSUMED) return;
  markCoupon(order, { state: COUPON_STATES.APPLIED });
}

async function consumeCouponForOrder(order, requestInfo = {}) {
  if (!order?.coupon?.code) {
    return { success: true, skipped: true };
  }

  if (getCouponState(order) === COUPON_STATES.CONSUMED) {
    return { success: true, alreadyApplied: true };
  }

  const result = await recordCouponUsage(
    order.coupon.code,
    order.buyer,
    order._id,
    order.coupon.discountAmount,
    order.totalAmount,
    requestInfo
  );

  if (!result.success) {
    return result;
  }

  markCoupon(order, {
    state: COUPON_STATES.CONSUMED,
    consumedAt: new Date(),
  });

  return result;
}

async function releaseCouponForOrder(order) {
  if (!order?.coupon?.code) {
    return { success: true, skipped: true };
  }

  const state = getCouponState(order);
  if (state !== COUPON_STATES.CONSUMED) {
    return { success: true, alreadyApplied: true, state };
  }

  const result = await releaseCouponUsage(order.coupon.code, order._id, order.buyer);
  if (!result.success && !result.alreadyApplied) {
    return result;
  }

  markCoupon(order, {
    state: COUPON_STATES.RELEASED,
    releasedAt: new Date(),
  });

  return { success: true, ...result };
}

module.exports = {
  COUPON_STATES,
  getCouponState,
  markCouponApplied,
  consumeCouponForOrder,
  releaseCouponForOrder,
};
