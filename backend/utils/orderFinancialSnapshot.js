/**
 * Read-only financial breakdown from a persisted order document.
 * Checkout / order creation is the source of truth — this module does not recalculate tax or shipping.
 */

function normalizeOrder(order) {
  return order && typeof order.toObject === "function" ? order.toObject() : order || {};
}

function sumItemsNet(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce(
    (sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1),
    0
  );
}

function resolveSubtotal(bulk, items) {
  if (typeof bulk.totalOriginalAmount === "number" && bulk.totalOriginalAmount > 0) {
    return bulk.totalOriginalAmount;
  }

  if (!Array.isArray(items) || items.length === 0) return 0;

  return items.reduce((sum, item) => {
    const unit = Number(item.originalPrice ?? item.price) || 0;
    return sum + unit * (Number(item.quantity) || 1);
  }, 0);
}

function isInclusiveTaxOrder(order) {
  const taxType = order.tax?.taxType || "";
  if (/inclusive|mixed/i.test(taxType)) return true;
  const totalTax = Number(order.tax?.totalTaxAmount) || 0;
  return totalTax === 0 && Number(order.tax?.totalTaxableAmount) > 0;
}

/**
 * Tax amount actually added on top of discounted items + shipping to reach totalAmount.
 * Prefers persisted snapshot; otherwise derives from stored total (no GST engine re-run).
 */
function resolveTaxAdded(order, financialInputs) {
  const persisted = order.tax?.totalTaxAdded;
  if (typeof persisted === "number" && Number.isFinite(persisted)) {
    return Math.max(0, Math.round(persisted * 100) / 100);
  }

  const { subtotal, discountAmount, shippingCharge, total } = financialInputs;
  const derived = total - subtotal + discountAmount - shippingCharge;
  return Math.max(0, Math.round(derived * 100) / 100);
}

/**
 * @param {object} order - Mongoose document or plain order object
 * @returns {object} Normalized financial snapshot for shopper surfaces
 */
function roundMoney(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * Payable vs informational tax lines for shopper order summary and invoice payable block.
 * Reads persisted order fields only — no GST engine re-runs.
 */
function buildOrderTaxVisibility(order) {
  const plain = normalizeOrder(order);
  const snapshot = buildOrderFinancialSnapshot(plain);
  const items = plain.items || [];
  const itemsNetSubtotal = snapshot.itemsNetSubtotal;
  const shippingCharge = snapshot.shippingCharge;
  const discountAmount = snapshot.discountAmount;
  const total = snapshot.total;
  const totalTaxAdded = resolveTaxAdded(plain, {
    subtotal: snapshot.subtotal,
    discountAmount,
    shippingCharge,
    total,
  });
  const totalTaxAmount = Number(plain.tax?.totalTaxAmount) || 0;
  const shippingGst = roundMoney(plain.tax?.shippingTax?.taxAmount ?? 0);
  const itemsGstAdded = Math.max(0, roundMoney(totalTaxAdded - shippingGst));
  const includedGstInProductPrices = Math.max(0, roundMoney(totalTaxAmount - totalTaxAdded));

  const breakdownItems = plain.tax?.taxBreakdownSnapshot?.items;
  const hasInclusiveItems =
    Array.isArray(breakdownItems) && breakdownItems.some((item) => item.inclusive === true);
  const hasExclusiveItems =
    Array.isArray(breakdownItems) && breakdownItems.some((item) => item.inclusive === false);

  const preDiscountSubtotal = snapshot.subtotal;
  const discountEmbeddedInItems =
    discountAmount > 0 &&
    Math.abs(preDiscountSubtotal - itemsNetSubtotal - discountAmount) < 0.02;

  const subtotalIncludesGst =
    itemsGstAdded === 0 &&
    (hasInclusiveItems ||
      includedGstInProductPrices > 0 ||
      isInclusiveTaxOrder(plain));
  const subtotalLabel = subtotalIncludesGst ? "Subtotal (incl. GST)" : "Subtotal";

  return {
    itemsNetSubtotal,
    itemsGstAdded,
    shippingGst,
    shippingCharge,
    discountAmount,
    showDiscountLine: discountAmount > 0 && !discountEmbeddedInItems,
    couponCode:
      plain.coupon?.code != null && String(plain.coupon.code).trim()
        ? String(plain.coupon.code).trim()
        : null,
    couponDiscount: snapshot.couponDiscount,
    bulkDiscount: snapshot.bulkDiscount,
    total,
    totalTaxAdded,
    includedGstInProductPrices,
    taxType: plain.tax?.taxType || null,
    hasInclusiveItems,
    hasExclusiveItems,
    subtotalIncludesGst,
    subtotalLabel,
  };
}

function buildOrderFinancialSnapshot(order) {
  const plain = normalizeOrder(order);
  const bulk = plain.bulkDiscountSummary || {};
  const items = plain.items || [];
  const couponDiscount = Number(plain.coupon?.discountAmount) || 0;
  const bulkDiscount = Number(bulk.totalDiscountAmount) || 0;
  const discountAmount = bulkDiscount + couponDiscount;
  const shippingCharge = Number(plain.shippingCharge) || 0;
  const total = Number(plain.totalAmount) || 0;
  const itemsNetSubtotal = sumItemsNet(items);
  const subtotal = resolveSubtotal(bulk, items);
  const taxAdded = resolveTaxAdded(plain, {
    subtotal,
    discountAmount,
    shippingCharge,
    total,
  });
  const totalTaxAmount = Number(plain.tax?.totalTaxAmount) || 0;

  return {
    subtotal,
    bulkDiscount,
    couponDiscount,
    discountAmount,
    itemsNetSubtotal,
    shippingCharge,
    taxAmount: taxAdded,
    totalTaxAmount,
    taxAdded,
    isInclusiveTax: isInclusiveTaxOrder(plain),
    total,
  };
}

/**
 * Shopper-facing tax visibility — P8: no V2 hide gate; legacy none handled by callers via requiresShipping.
 */
function buildShopperOrderTaxVisibility(order) {
  return buildOrderTaxVisibility(order);
}

module.exports = {
  buildOrderFinancialSnapshot,
  buildOrderTaxVisibility,
  buildShopperOrderTaxVisibility,
  normalizeOrder,
  sumItemsNet,
  resolveSubtotal,
  resolveTaxAdded,
  isInclusiveTaxOrder,
  roundMoney,
};
