const { toPaymentVisibilityDTO } = require("./paymentVisibilityService");
const { getCancellationEligibility } = require("./cancellationEligibilityService");
const {
  getReturnEligibility,
  toShopperReturnEligibility,
} = require("./returnEligibilityService");
const { buildOrderFinancialSnapshot } = require("../utils/orderFinancialSnapshot");

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

function parsePaginationQuery(query = {}) {
  const page = Math.max(DEFAULT_PAGE, parseInt(query.page, 10) || DEFAULT_PAGE);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(query.limit, 10) || DEFAULT_LIMIT)
  );
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function formatVariantSummary(variantCombination) {
  if (!variantCombination || typeof variantCombination !== "object") {
    return null;
  }
  const entries = Object.entries(variantCombination).filter(
    ([, value]) => value !== null && value !== undefined && String(value).trim() !== ""
  );
  if (entries.length === 0) return null;
  return entries.map(([key, value]) => `${key}: ${value}`).join(", ");
}

function resolveProductRef(product) {
  if (!product || typeof product !== "object") return null;
  if (product._id || product.name || product.slug) {
    return product;
  }
  return null;
}

function buildItemsPreview(items) {
  if (!Array.isArray(items)) return [];

  return items.map((item) => {
    const product = resolveProductRef(item.product);
    return {
      productName: product?.name || "Product unavailable",
      productSlug: product?.slug || null,
      image: item.image || product?.mainImage || null,
      quantity: item.quantity || 1,
      variantSummary: formatVariantSummary(item.variantCombination),
    };
  });
}

/**
 * Read-only tracking summary for listing (no Shiprocket sync or mutation).
 */
function buildTrackingSummary(order) {
  const shipments = Array.isArray(order.shiprocketShipments)
    ? order.shiprocketShipments
    : [];
  const shipmentAwbs = shipments
    .map((s) => s.trackingNumber)
    .filter((awb) => awb && String(awb).trim());
  const legacyAwb = order.trackingNumber && String(order.trackingNumber).trim();
  const awbAvailable = !!(legacyAwb || shipmentAwbs.length > 0);

  const shipmentStatuses = shipments
    .map((s) => s.status)
    .filter((status) => status && String(status).trim());
  const shipmentStatus =
    shipmentStatuses.length > 0
      ? shipmentStatuses[shipmentStatuses.length - 1]
      : order.status || null;

  return {
    shipmentStatus,
    awbAvailable,
    trackingAvailable: awbAvailable,
  };
}

/**
 * Read-only cancel eligibility via centralized governance (stored order state only).
 */
function resolveCancelEligibility(order) {
  return getCancellationEligibility(order);
}

function resolveInvoiceAvailable(order) {
  return !!(
    order &&
    Array.isArray(order.items) &&
    order.items.length > 0 &&
    typeof order.totalAmount === "number" &&
    order.totalAmount > 0
  );
}

/**
 * Normalized shopper order listing DTO — safe fields only.
 */
function shopperOrderListDTO(order, options = {}) {
  const plain =
    order && typeof order.toObject === "function" ? order.toObject() : order || {};

  const id = plain._id ? String(plain._id) : null;
  const manualConfirmation = options.manualConfirmation || {
    eligible: false,
    status: null,
  };
  const financial = buildOrderFinancialSnapshot(plain);
  const couponCode =
    plain.coupon?.code != null && String(plain.coupon.code).trim()
      ? String(plain.coupon.code).trim()
      : null;

  return {
    _id: id,
    orderId: plain.invoiceNumber || id,
    createdAt: plain.createdAt
      ? plain.createdAt instanceof Date
        ? plain.createdAt.toISOString()
        : plain.createdAt
      : null,
    total: plain.totalAmount,
    discountAmount: financial.discountAmount > 0 ? financial.discountAmount : 0,
    couponCode,
    orderStatus: plain.status,
    paymentVisibility: toPaymentVisibilityDTO(plain),
    trackingSummary: buildTrackingSummary(plain),
    cancelEligibility: resolveCancelEligibility(plain),
    returnEligibility: toShopperReturnEligibility(
      getReturnEligibility(plain, options.existingReturnRequest || null, {
        returnWindowDays: options.returnWindowDays,
        returnAllowed: options.returnAllowed,
      })
    ),
    returnRequest: options.returnRequest || null,
    afterSales: options.afterSales !== undefined
      ? options.afterSales
      : options.returnRequest
        ? {
            status: options.returnRequest.status || null,
            resolution:
              options.returnRequest.resolution ||
              options.returnRequest.effectiveResolution ||
              null,
          }
        : null,
    invoiceAvailable: resolveInvoiceAvailable(plain),
    itemsPreview: buildItemsPreview(plain.items),
    manualConfirmation,
  };
}

module.exports = {
  parsePaginationQuery,
  shopperOrderListDTO,
  buildItemsPreview,
  buildTrackingSummary,
  resolveCancelEligibility,
  resolveInvoiceAvailable,
  formatVariantSummary,
  resolveProductRef,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
};
