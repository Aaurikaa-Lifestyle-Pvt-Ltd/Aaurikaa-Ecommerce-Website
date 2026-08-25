/**
 * WS-4 / 1.9 — Product card labels derived from existing merchandising state.
 * Not a promotion engine. Conditions reuse sale pricing, featured flag,
 * bulk-discount deals, and createdAt recency already stored on Product.
 */

const NEW_ARRIVAL_DAYS = 30;

const LABEL_KEYS = Object.freeze({
  NEW: "new",
  SALE: "sale",
  DEAL: "deal",
  FEATURED: "featured",
});

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Same condition as ProductCard savings overlay: regularPrice > salePrice. */
function isOnSale(product = {}) {
  const regularPrice = toNumber(product.regularPrice);
  const salePrice = toNumber(product.salePrice);
  if (regularPrice == null || salePrice == null) return false;
  return regularPrice > salePrice;
}

function getNewArrivalCutoff(now = new Date(), days = NEW_ARRIVAL_DAYS) {
  const cutoff = new Date(now);
  cutoff.setTime(cutoff.getTime() - days * 24 * 60 * 60 * 1000);
  return cutoff;
}

function isNewArrival(product = {}, now = new Date()) {
  if (!product.createdAt) return false;
  const created = new Date(product.createdAt);
  if (Number.isNaN(created.getTime())) return false;
  return created >= getNewArrivalCutoff(now);
}

/** Existing product-level promotional pricing (bulk discount), until Point 20 Deal engine. */
function isDeal(product = {}) {
  return product?.bulkDiscount?.enabled === true;
}

function isFeatured(product = {}) {
  return product.isFeatured === true;
}

/**
 * Applicable labels in display order. Multiple labels may apply.
 * @returns {Array<{ key: string }>}
 */
function getProductLabels(product = {}, now = new Date()) {
  const labels = [];
  if (isNewArrival(product, now)) labels.push({ key: LABEL_KEYS.NEW });
  if (isOnSale(product)) labels.push({ key: LABEL_KEYS.SALE });
  if (isDeal(product)) labels.push({ key: LABEL_KEYS.DEAL });
  if (isFeatured(product)) labels.push({ key: LABEL_KEYS.FEATURED });
  return labels;
}

function normalizeCollectionKey(query = {}) {
  const fromLabel = String(query.label || query.collection || "")
    .trim()
    .toLowerCase();
  if (fromLabel) return fromLabel;
  if (query.featured === "true" || query.featured === true) return LABEL_KEYS.FEATURED;
  if (query.onSale === "true" || query.onSale === true) return LABEL_KEYS.SALE;
  if (query.new === "true" || query.new === true) return LABEL_KEYS.NEW;
  if (query.deal === "true" || query.deal === true) return LABEL_KEYS.DEAL;
  return "";
}

/**
 * Apply a merchandising collection onto an existing storefront Mongo filter.
 * Reuses listing architecture; does not create a separate catalogue.
 */
function applyMerchandisingCollectionFilter(filter, query = {}, now = new Date()) {
  const key = normalizeCollectionKey(query);
  if (!key) return filter;

  filter.$and = filter.$and || [];

  if (key === LABEL_KEYS.SALE) {
    filter.$and.push({
      $expr: {
        $gt: [
          { $ifNull: ["$regularPrice", 0] },
          { $ifNull: ["$salePrice", "$regularPrice"] },
        ],
      },
    });
    return filter;
  }

  if (key === LABEL_KEYS.NEW) {
    filter.createdAt = { $gte: getNewArrivalCutoff(now) };
    return filter;
  }

  if (key === LABEL_KEYS.DEAL) {
    filter["bulkDiscount.enabled"] = true;
    return filter;
  }

  if (key === LABEL_KEYS.FEATURED) {
    filter.isFeatured = true;
    return filter;
  }

  return filter;
}

module.exports = {
  NEW_ARRIVAL_DAYS,
  LABEL_KEYS,
  isOnSale,
  isNewArrival,
  isDeal,
  isFeatured,
  getProductLabels,
  getNewArrivalCutoff,
  normalizeCollectionKey,
  applyMerchandisingCollectionFilter,
};
