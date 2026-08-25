const Order = require("../models/Order");
const Review = require("../models/Review");

const REASON = {
  ELIGIBLE: "ELIGIBLE",
  ORDER_NOT_DELIVERED: "ORDER_NOT_DELIVERED",
  ALREADY_REVIEWED: "ALREADY_REVIEWED",
  PRODUCT_NOT_FOUND: "PRODUCT_NOT_FOUND",
};

function normalizePlain(order) {
  return order && typeof order.toObject === "function" ? order.toObject() : order || {};
}

function isOrderDelivered(order) {
  const plain = normalizePlain(order);
  return plain.status === "delivered";
}

function resolveProductIdFromItem(item) {
  if (!item) return null;
  const product = item.product !== undefined ? item.product : item;
  if (!product) return null;
  if (typeof product === "object" && product._id) return String(product._id);
  if (typeof product === "string") return product;
  return null;
}

function productExistsInOrder(order, productId) {
  if (!productId) return false;
  const plain = normalizePlain(order);
  const targetId = String(productId);

  return (plain.items || []).some((item) => {
    const itemProductId = resolveProductIdFromItem(item);
    return itemProductId === targetId;
  });
}

/**
 * Centralized read-only review eligibility for a product within an order context.
 */
function getReviewEligibility({ order, shopperId, productId, reviewedProductIds = new Set() }) {
  const delivered = isOrderDelivered(order);
  const productIdStr = productId ? String(productId) : null;

  if (!productIdStr || !productExistsInOrder(order, productIdStr)) {
    return {
      eligible: false,
      alreadyReviewed: false,
      delivered,
      reason: REASON.PRODUCT_NOT_FOUND,
    };
  }

  const alreadyReviewed = reviewedProductIds.has(productIdStr);

  if (alreadyReviewed) {
    return {
      eligible: false,
      alreadyReviewed: true,
      delivered,
      reason: REASON.ALREADY_REVIEWED,
    };
  }

  if (!delivered) {
    return {
      eligible: false,
      alreadyReviewed: false,
      delivered,
      reason: REASON.ORDER_NOT_DELIVERED,
    };
  }

  return {
    eligible: true,
    alreadyReviewed: false,
    delivered: true,
    reason: REASON.ELIGIBLE,
  };
}

/**
 * Order-level aggregate eligibility (supports mixed item states).
 */
function getReviewEligibilityForOrder({ order, shopperId, reviewedProductIds = new Set() }) {
  const plain = normalizePlain(order);
  const delivered = isOrderDelivered(plain);

  const productIds = (plain.items || [])
    .map((item) => resolveProductIdFromItem(item))
    .filter(Boolean);

  if (productIds.length === 0) {
    return {
      eligible: false,
      alreadyReviewed: false,
      delivered,
      reason: REASON.PRODUCT_NOT_FOUND,
    };
  }

  const itemStates = productIds.map((productId) =>
    getReviewEligibility({ order: plain, shopperId, productId, reviewedProductIds })
  );

  const anyEligible = itemStates.some((state) => state.eligible);
  const anyReviewed = itemStates.some((state) => state.alreadyReviewed);
  const allReviewed = itemStates.every((state) => state.alreadyReviewed);

  if (anyEligible) {
    return {
      eligible: true,
      alreadyReviewed: anyReviewed,
      delivered,
      reason: REASON.ELIGIBLE,
    };
  }

  if (allReviewed && anyReviewed) {
    return {
      eligible: false,
      alreadyReviewed: true,
      delivered,
      reason: REASON.ALREADY_REVIEWED,
    };
  }

  if (!delivered) {
    return {
      eligible: false,
      alreadyReviewed: anyReviewed,
      delivered,
      reason: REASON.ORDER_NOT_DELIVERED,
    };
  }

  return {
    eligible: false,
    alreadyReviewed: anyReviewed,
    delivered,
    reason: REASON.PRODUCT_NOT_FOUND,
  };
}

/**
 * Authoritative verified purchase lookup — fixes legacy `"user.id"` query bug.
 */
async function verifyDeliveredPurchase({ shopperId, productId, orderId = null }) {
  if (!shopperId || !productId) {
    return { verifiedPurchase: false, orderId: null };
  }

  const filter = {
    buyer: shopperId,
    "items.product": productId,
    status: "delivered",
  };

  if (orderId) {
    filter._id = orderId;
  }

  const order = await Order.findOne(filter).select("_id buyer status").lean();
  if (!order) {
    return { verifiedPurchase: false, orderId: null };
  }

  return { verifiedPurchase: true, orderId: order._id };
}

async function loadReviewedProductIds({ shopperId, productIds }) {
  if (!shopperId || !Array.isArray(productIds) || productIds.length === 0) {
    return new Set();
  }

  const reviews = await Review.find({
    product: { $in: productIds },
    "reviewer.userId": shopperId,
    "reviewer.role": "shopper",
  })
    .select("product")
    .lean();

  return new Set(reviews.map((review) => String(review.product)));
}

module.exports = {
  REASON,
  getReviewEligibility,
  getReviewEligibilityForOrder,
  verifyDeliveredPurchase,
  loadReviewedProductIds,
  isOrderDelivered,
  productExistsInOrder,
};
