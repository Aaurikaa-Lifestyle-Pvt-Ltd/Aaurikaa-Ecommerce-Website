const {
  ORDER_SHIPPING_APPLICABILITY_NONE,
  ORDER_SHIPPING_APPLICABILITY_PARTIAL,
  ORDER_SHIPPING_APPLICABILITY_FULL,
  SHIPPING_APPLICABILITY_NOT_APPLICABLE,
  LEGACY_ORDER_SHIPPING_APPLICABILITY,
} = require('../constants/shippingConstants');

const BASE_ALLOWED_TRANSITIONS = {
  // SEC-002: `paid` is not a fulfilment transition. It may only be set by a
  // trusted payment verification path (PhonePe poll / admin payment update).
  pending: ['cancelled'],
  paid: ['processing'],
  processing: ['shipped'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

function normalizePlain(order) {
  return order && typeof order.toObject === 'function' ? order.toObject() : order || {};
}

function resolveOrderShippingApplicability(order) {
  const plain = normalizePlain(order);
  return plain.shippingApplicability || LEGACY_ORDER_SHIPPING_APPLICABILITY;
}

/**
 * P5: New orders (missing applicability or not `none`) always require shipping.
 * Only historical orders with explicit `shippingApplicability: 'none'` skip Shiprocket.
 * ₹0 slab ("No Shipping Charge") is still physically shippable.
 */
function orderRequiresShipping(order) {
  return resolveOrderShippingApplicability(order) !== ORDER_SHIPPING_APPLICABILITY_NONE;
}

function isLineShippable(item) {
  const lineApp = item?.lineShippingApplicability || item?.effectiveShippingApplicability;
  if (lineApp) return lineApp !== SHIPPING_APPLICABILITY_NOT_APPLICABLE;
  return true;
}

/**
 * Filter items for physical shipment / Shiprocket.
 * P5: `full` (and missing → legacy full) includes all lines — line-level V1
 * `not_applicable` snapshots must not strip new always-physical orders.
 * Legacy `partial` still respects per-line shippability; `none` → empty.
 */
function filterShippableItems(items, order = null) {
  const list = items || [];
  if (!order) {
    return list.filter(isLineShippable);
  }

  const applicability = resolveOrderShippingApplicability(order);
  if (applicability === ORDER_SHIPPING_APPLICABILITY_NONE) {
    return [];
  }
  if (
    applicability === ORDER_SHIPPING_APPLICABILITY_FULL ||
    applicability === LEGACY_ORDER_SHIPPING_APPLICABILITY
  ) {
    return list;
  }
  if (applicability === ORDER_SHIPPING_APPLICABILITY_PARTIAL) {
    return list.filter(isLineShippable);
  }
  return list;
}

/**
 * Read-only DTO derivative for UI convenience — not persisted.
 */
function deriveFulfillmentBehavior(order) {
  const applicability = resolveOrderShippingApplicability(order);
  if (applicability === ORDER_SHIPPING_APPLICABILITY_NONE) {
    return { physical: false, shiprocket: false, tracking: false };
  }
  if (applicability === ORDER_SHIPPING_APPLICABILITY_PARTIAL) {
    return { physical: true, shiprocket: true, tracking: true };
  }
  return { physical: true, shiprocket: true, tracking: true };
}

function sellerItemIds(order, sellerProductIds) {
  return (order.items || []).filter((item) => {
    const productId = item.product?._id?.toString?.() || item.product?.toString?.();
    return productId && sellerProductIds.includes(productId);
  });
}

/**
 * Whether this seller's portion of the order requires physical shipping.
 */
function sellerRequiresShipping(order, sellerProductIds) {
  if (!orderRequiresShipping(order)) return false;

  const applicability = resolveOrderShippingApplicability(order);
  if (applicability !== ORDER_SHIPPING_APPLICABILITY_PARTIAL) {
    return true;
  }

  return sellerItemIds(order, sellerProductIds).some(isLineShippable);
}

function getAllowedTransitions(order, sellerProductIds = null) {
  const transitions = { ...BASE_ALLOWED_TRANSITIONS };

  const skipShipped =
    sellerProductIds && sellerProductIds.length > 0
      ? !sellerRequiresShipping(order, sellerProductIds)
      : !orderRequiresShipping(order);

  if (skipShipped) {
    transitions.processing = ['delivered'];
  }

  return transitions;
}

function isAllowedStatusTransition(order, currentStatus, nextStatus, sellerProductIds = null) {
  const currentKey = normalizeStatusForTransition(currentStatus);
  const nextKey = normalizeStatusForTransition(nextStatus);
  const allowed = getAllowedTransitions(order, sellerProductIds);
  return (allowed[currentKey] || []).includes(nextKey);
}

function normalizeStatusForTransition(status) {
  if (!status) return status;
  if (status === 'pending_verification' || status === 'pending') return 'pending';
  if (status === 'failed') return 'cancelled';
  return status;
}

function requiresTrackingForStatus(order, sellerProductIds, targetStatus) {
  if (targetStatus !== 'shipped') return false;
  if (!sellerProductIds || sellerProductIds.length === 0) {
    return orderRequiresShipping(order);
  }
  return sellerRequiresShipping(order, sellerProductIds);
}

function buildSellerFulfillmentDTO(order, sellerProductIds) {
  const shippingApplicability = resolveOrderShippingApplicability(order);
  const requiresShipping = sellerRequiresShipping(order, sellerProductIds);
  return {
    shippingApplicability,
    requiresShipping,
    fulfillmentBehavior: deriveFulfillmentBehavior(order),
    allowedTransitions: getAllowedTransitions(order, sellerProductIds),
  };
}

module.exports = {
  BASE_ALLOWED_TRANSITIONS,
  resolveOrderShippingApplicability,
  orderRequiresShipping,
  isLineShippable,
  filterShippableItems,
  deriveFulfillmentBehavior,
  sellerRequiresShipping,
  getAllowedTransitions,
  isAllowedStatusTransition,
  normalizeStatusForTransition,
  requiresTrackingForStatus,
  buildSellerFulfillmentDTO,
};
