const { toPaymentVisibilityDTO } = require("./paymentVisibilityService");
const {
  formatVariantSummary,
  resolveProductRef,
  resolveInvoiceAvailable,
} = require("./shopperOrderListService");
const {
  getReviewEligibility,
  getReviewEligibilityForOrder,
} = require("./reviewEligibilityService");
const { getCancellationEligibility } = require("./cancellationEligibilityService");
const {
  getReturnEligibility,
  toShopperReturnEligibility,
} = require("./returnEligibilityService");
const { buildOrderTaxVisibility, buildShopperOrderTaxVisibility } = require("../utils/orderFinancialSnapshot");
const {
  ORDER_SHIPPING_APPLICABILITY_NONE,
  LEGACY_ORDER_SHIPPING_APPLICABILITY,
} = require("../constants/shippingConstants");
const { isObjectIdString } = require("../utils/invoiceAddressFormatter");

const STATUS_WEIGHTS = {
  pending: 0,
  pending_verification: 0,
  paid: 1,
  processing: 2,
  shipped: 3,
  delivered: 4,
  cancelled: -1,
  failed: -2,
};

const TIMELINE_MILESTONES = [
  { key: "paid", label: "Payment confirmed", minWeight: 1 },
  { key: "processing", label: "Order processing", minWeight: 2 },
  { key: "shipped", label: "Shipped", minWeight: 3 },
  { key: "delivered", label: "Delivered", minWeight: 4 },
];

function toISO(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function normalizePlain(order) {
  return order && typeof order.toObject === "function" ? order.toObject() : order || {};
}

/**
 * Customer-safe string: trim, drop blanks, never leak location ObjectIds.
 */
function toSafeAddressField(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || isObjectIdString(s)) return null;
  return s;
}

/**
 * Map Order.shippingDetails / billingDetails → shopper-facing address DTO.
 * Sync only (no location DB lookups). Checkout already resolves state/country names on write.
 */
function toCustomerAddressDTO(details) {
  if (!details || typeof details !== "object") return null;

  const nested =
    details.address && typeof details.address === "object" ? details.address : null;
  const addressAsString =
    typeof details.address === "string" ? toSafeAddressField(details.address) : null;

  const addressLine1 =
    addressAsString ||
    toSafeAddressField(details.addressLine1) ||
    toSafeAddressField(nested?.street) ||
    toSafeAddressField(nested?.addressLine1) ||
    toSafeAddressField(nested?.line1);

  const addressLine2 =
    toSafeAddressField(details.addressLine2) ||
    toSafeAddressField(nested?.addressLine2) ||
    toSafeAddressField(nested?.line2);

  const name =
    toSafeAddressField(details.name) ||
    toSafeAddressField(
      [details.firstName, details.lastName].filter(Boolean).join(" ").trim() || null
    );

  const dto = {
    name,
    phone: toSafeAddressField(details.phone),
    addressLine1,
    addressLine2,
    city: toSafeAddressField(details.city) || toSafeAddressField(nested?.city),
    state: toSafeAddressField(details.state) || toSafeAddressField(nested?.state),
    district:
      toSafeAddressField(details.district) || toSafeAddressField(nested?.district),
    pincode:
      toSafeAddressField(details.pincode) ||
      toSafeAddressField(nested?.postalCode) ||
      toSafeAddressField(nested?.pincode),
    country: toSafeAddressField(details.country) || toSafeAddressField(nested?.country),
  };

  const hasContent = [
    "name",
    "phone",
    "addressLine1",
    "addressLine2",
    "city",
    "state",
    "district",
    "pincode",
    "country",
  ].some((key) => dto[key]);

  return hasContent ? dto : null;
}

function addressesEqual(a, b) {
  if (!a || !b) return false;
  return (
    a.name === b.name &&
    a.phone === b.phone &&
    a.addressLine1 === b.addressLine1 &&
    a.addressLine2 === b.addressLine2 &&
    a.city === b.city &&
    a.state === b.state &&
    a.district === b.district &&
    a.pincode === b.pincode &&
    a.country === b.country
  );
}

/**
 * deliveryAddress prefers shippingDetails; falls back to billing when shipping absent.
 * billingAddress is omitted when identical to a present shipping address (same-as-delivery).
 */
function buildCustomerAddresses(order) {
  const plain = normalizePlain(order);
  const shipping = toCustomerAddressDTO(plain.shippingDetails);
  const billing = toCustomerAddressDTO(plain.billingDetails);
  const deliveryAddress = shipping || billing || null;

  const billingAddress =
    billing && (!shipping || !addressesEqual(billing, shipping)) ? billing : null;

  return { deliveryAddress, billingAddress };
}

function resolveOrderShippingApplicability(order) {
  const plain = normalizePlain(order);
  return plain.shippingApplicability || LEGACY_ORDER_SHIPPING_APPLICABILITY;
}

function orderRequiresShipping(order) {
  return resolveOrderShippingApplicability(order) !== ORDER_SHIPPING_APPLICABILITY_NONE;
}

function buildPaymentVisibilityDetail(order) {
  const visibility = toPaymentVisibilityDTO(order);
  return {
    paymentType: visibility.paymentMethod,
    paymentStatus: visibility.paymentStatus,
    gateway: visibility.paymentGateway,
    channel: visibility.paymentChannel,
    transactionId: visibility.transactionId,
    paidAt: visibility.paidAt,
  };
}

/**
 * Read-only shipment summary — no Shiprocket sync or mutation.
 */
function normalizeShipmentStatusKey(input) {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  // Keep internal order statuses as-is
  if (
    [
      "pending",
      "pending_verification",
      "paid",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
      "failed",
    ].includes(lower)
  ) {
    return lower;
  }

  // Common Shiprocket-ish / legacy labels (best-effort, read-only)
  if (["synced", "created", "manifested", "pickup_scheduled"].includes(lower)) {
    return "shipment_created";
  }
  if (["awb_assigned", "awb_generated"].includes(lower)) return "awb_assigned";
  if (["picked_up", "in_transit", "dispatched"].includes(lower)) return "shipped";
  if (["out_for_delivery", "ofd"].includes(lower)) return "out_for_delivery";
  if (["rto", "return_to_origin", "returned"].includes(lower)) return "returned";

  return lower;
}

function shipmentStatusLabel(key) {
  if (!key) return null;

  const map = {
    shipment_created: "Shipment created",
    awb_assigned: "AWB assigned",
    processing: "Processing",
    shipped: "Shipped",
    out_for_delivery: "Out for delivery",
    delivered: "Delivered",
    cancelled: "Cancelled",
    failed: "Failed",
    returned: "Returned",
    pending: "Pending",
    pending_verification: "Pending verification",
    paid: "Paid",
  };

  return map[key] || key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function aggregateShipmentStatus(keys) {
  const clean = (keys || []).filter(Boolean);
  if (clean.length === 0) return null;

  const uniq = new Set(clean);
  if (uniq.size === 1) return clean[clean.length - 1];

  const counts = clean.reduce((acc, k) => {
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  // Partial fulfillment heuristics (no inference beyond recorded statuses)
  if (counts.delivered && clean.length > counts.delivered) return "partially_delivered";
  if (counts.shipped && clean.length > counts.shipped) return "partially_shipped";
  if (counts.out_for_delivery && clean.length > counts.out_for_delivery) return "partially_out_for_delivery";

  // Fallback to "least progressed" for safety/clarity
  const weight = {
    pending: 0,
    pending_verification: 0,
    paid: 1,
    shipment_created: 1,
    awb_assigned: 2,
    processing: 3,
    shipped: 4,
    out_for_delivery: 5,
    delivered: 6,
    returned: 7,
    cancelled: -1,
    failed: -2,
  };

  return clean
    .slice()
    .sort((a, b) => (weight[a] ?? 999) - (weight[b] ?? 999))[0];
}

function buildShipmentSummary(order) {
  const plain = normalizePlain(order);
  const shippingApplicability = resolveOrderShippingApplicability(plain);

  if (!orderRequiresShipping(plain)) {
    return {
      requiresShipping: false,
      shippingApplicability,
      shipmentStatus: null,
      courierName: null,
      awbNumber: null,
      trackingUrl: null,
      estimatedDelivery: null,
      trackingAvailable: false,
    };
  }

  const shipments = Array.isArray(plain.shiprocketShipments)
    ? plain.shiprocketShipments
    : [];

  const awbCandidates = [
    ...shipments.map((s) => s.trackingNumber).filter((awb) => awb && String(awb).trim()),
    plain.trackingNumber && String(plain.trackingNumber).trim(),
  ].filter(Boolean);

  const awbNumber = awbCandidates[0] || null;

  const shipmentStatusKeys = shipments
    .map((s) => normalizeShipmentStatusKey(s.status))
    .filter(Boolean);

  const fallbackKey = normalizeShipmentStatusKey(plain.status);
  const aggregatedKey =
    shipmentStatusKeys.length > 0
      ? aggregateShipmentStatus(shipmentStatusKeys)
      : ["processing", "shipped", "delivered"].includes(fallbackKey)
        ? fallbackKey
        : null;

  const shipmentStatus = aggregatedKey ? shipmentStatusLabel(aggregatedKey) : null;

  const trackingAvailable = !!awbNumber;
  const trackingUrl = trackingAvailable
    ? `https://shiprocket.co/tracking/${encodeURIComponent(awbNumber)}`
    : null;

  return {
    requiresShipping: true,
    shippingApplicability,
    shipmentStatus,
    courierName: null,
    awbNumber,
    trackingUrl,
    estimatedDelivery: null,
    trackingAvailable,
  };
}

function buildInvoiceSummary(order, orderId) {
  const available = resolveInvoiceAvailable(order);
  return {
    invoiceAvailable: available,
    invoiceUrl: available && orderId ? `/api/orders/${orderId}/invoice` : null,
  };
}

function buildPricingSummary(order) {
  const taxVisibility = buildShopperOrderTaxVisibility(order);
  const subtotal = taxVisibility.itemsNetSubtotal;
  const shippingApplicability = resolveOrderShippingApplicability(order);
  const requiresShipping = orderRequiresShipping(order);

  return {
    shippingApplicability,
    requiresShipping,
    shippableItemCount: order.shippableItemCount ?? null,
    nonShippableItemCount: order.nonShippableItemCount ?? null,
    subtotal,
    shippingCharge: requiresShipping ? taxVisibility.shippingCharge : 0,
    taxAmount: taxVisibility.totalTaxAdded,
    discountAmount: taxVisibility.discountAmount,
    total: taxVisibility.total,
    gst: {
      cgst: Number(order.tax?.cgst) || 0,
      sgst: Number(order.tax?.sgst) || 0,
      ugst: Number(order.tax?.ugst) || 0,
      igst: Number(order.tax?.igst) || 0,
      taxType: order.tax?.taxType || null,
    },
    orderSummary: {
      subtotal,
      subtotalLabel: taxVisibility.subtotalLabel,
      itemsGstAdded: taxVisibility.itemsGstAdded,
      shippingCharge: requiresShipping ? taxVisibility.shippingCharge : 0,
      shippingGst: requiresShipping ? taxVisibility.shippingGst : 0,
      discountAmount: taxVisibility.showDiscountLine ? taxVisibility.discountAmount : 0,
      total: taxVisibility.total,
    },
  };
}

/**
 * Historical order SKU snapshot — variant line snapshot first, then product base SKU.
 */
function resolveOrderItemSku(item, product) {
  const variantSku = item?.variantSku;
  if (variantSku != null && String(variantSku).trim()) {
    return String(variantSku).trim();
  }

  const productSku = product?.sku;
  if (productSku != null && String(productSku).trim()) {
    return String(productSku).trim();
  }

  return null;
}

function resolveSellerFromProduct(product) {
  if (!product || typeof product !== "object") {
    return { sellerId: null, sellerName: null, sellerSlug: null };
  }

  const seller = product.seller;
  if (!seller || typeof seller !== "object") {
    return { sellerId: null, sellerName: null, sellerSlug: null };
  }

  return {
    sellerId: seller._id ? String(seller._id) : null,
    sellerName: seller.shopName || null,
    sellerSlug: seller.shopUrl || null,
  };
}

function buildItems(order, options = {}) {
  const plain = normalizePlain(order);
  if (!Array.isArray(plain.items)) return [];

  const { shopperId, reviewedProductIds = new Set() } = options;

  return plain.items.map((item) => {
    const product = resolveProductRef(item.product);
    const seller = resolveSellerFromProduct(product);
    const productId = product?._id ? String(product._id) : null;

    const reviewEligibility = getReviewEligibility({
      order: plain,
      shopperId,
      productId,
      reviewedProductIds,
    });

    return {
      productId,
      productName: product?.name || "Product unavailable",
      productSlug: product?.slug || null,
      sku: resolveOrderItemSku(item, product),
      image: item.image || product?.mainImage || null,
      quantity: item.quantity || 1,
      variantSummary: formatVariantSummary(item.variantCombination),
      itemPrice: item.price,
      sellerName: seller.sellerName,
      sellerSlug: seller.sellerSlug,
      lineShippingApplicability: item.lineShippingApplicability || item.effectiveShippingApplicability || null,
      requiresShipping: (item.lineShippingApplicability || item.effectiveShippingApplicability) !== "not_applicable",
      reviewEligibility,
    };
  });
}

function buildSellerSummary(items) {
  const sellers = [];
  const seen = new Set();

  for (const item of items || []) {
    const key = item.sellerSlug || item.sellerName;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    sellers.push({
      sellerName: item.sellerName,
      sellerSlug: item.sellerSlug,
    });
  }

  return { sellers };
}

function statusWeight(status) {
  return STATUS_WEIGHTS[status] ?? -99;
}

function buildStatusTimeline(order) {
  const plain = normalizePlain(order);
  const createdAt = toISO(plain.createdAt);
  const updatedAt = toISO(plain.updatedAt);
  const deliveredAt = toISO(plain.deliveredAt);
  const currentStatus = plain.status;
  const currentWeight = statusWeight(currentStatus);

  const timeline = [{ status: "placed", timestamp: createdAt, label: "Order placed" }];

  if (currentStatus === "cancelled") {
    timeline.push({ status: "cancelled", timestamp: updatedAt, label: "Order cancelled" });
    return timeline;
  }

  if (currentStatus === "failed") {
    timeline.push({ status: "failed", timestamp: updatedAt, label: "Order failed" });
    return timeline;
  }

  const shipmentTimestamp = toISO(plain.shiprocketShipments?.[0]?.createdAt);
  const milestones = orderRequiresShipping(plain)
    ? TIMELINE_MILESTONES
    : TIMELINE_MILESTONES.filter((milestone) => milestone.key !== "shipped");

  for (const milestone of milestones) {
    if (currentWeight >= milestone.minWeight) {
      const timestamp =
        milestone.key === "delivered" && deliveredAt
          ? deliveredAt
          : milestone.key === "shipped" && shipmentTimestamp
            ? shipmentTimestamp
            : updatedAt;
      timeline.push({
        status: milestone.key,
        timestamp,
        label: milestone.label,
      });
    }
  }

  return timeline;
}

/**
 * Read-only order-level review eligibility aggregate.
 */
function buildReviewEligibility(order, options = {}) {
  const plain = normalizePlain(order);
  const { shopperId, reviewedProductIds = new Set() } = options;

  return getReviewEligibilityForOrder({
    order: plain,
    shopperId,
    reviewedProductIds,
  });
}

/**
 * Normalized shopper order detail DTO — safe read-only fields only.
 */
function shopperOrderDetailDTO(order, options = {}) {
  const plain = normalizePlain(order);
  const id = plain._id ? String(plain._id) : null;
  const dtoOptions = {
    shopperId: options.shopperId || null,
    reviewedProductIds: options.reviewedProductIds || new Set(),
  };
  const items = buildItems(plain, dtoOptions);

  const { deliveryAddress, billingAddress } = buildCustomerAddresses(plain);

  return {
    _id: id,
    orderId: plain.invoiceNumber || id,
    createdAt: toISO(plain.createdAt),
    orderStatus: plain.status,
    fulfilmentKind: plain.fulfilmentKind || "sale",
    sourceOrder: plain.sourceOrder ? String(plain.sourceOrder) : null,
    shippingApplicability: resolveOrderShippingApplicability(plain),
    requiresShipping: orderRequiresShipping(plain),
    shippableItemCount: plain.shippableItemCount ?? null,
    nonShippableItemCount: plain.nonShippableItemCount ?? null,
    deliveryAddress,
    billingAddress,
    paymentVisibility: buildPaymentVisibilityDetail(plain),
    shipmentSummary: buildShipmentSummary(plain),
    invoiceSummary: buildInvoiceSummary(plain, id),
    pricingSummary: buildPricingSummary(plain),
    items,
    sellerSummary: buildSellerSummary(items),
    statusTimeline: buildStatusTimeline(plain),
    reviewEligibility: buildReviewEligibility(plain, dtoOptions),
    cancelEligibility: getCancellationEligibility(plain),
    returnEligibility: toShopperReturnEligibility(
      getReturnEligibility(plain, options.existingReturnRequest || null, {
        returnWindowDays: options.returnWindowDays,
        returnAllowed: options.returnAllowed,
      })
    ),
    returnRequest: options.returnRequest || null,
    manualConfirmation: options.manualConfirmation || { eligible: false, status: null },
  };
}

module.exports = {
  shopperOrderDetailDTO,
  buildPaymentVisibilityDetail,
  buildShipmentSummary,
  buildInvoiceSummary,
  buildPricingSummary,
  buildItems,
  buildSellerSummary,
  buildStatusTimeline,
  buildReviewEligibility,
  buildCustomerAddresses,
  toCustomerAddressDTO,
  resolveOrderItemSku,
  resolveOrderShippingApplicability,
  orderRequiresShipping,
};
