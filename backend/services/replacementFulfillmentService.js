/**
 * Creates an outbound replacement Order on the existing commerce engines.
 * Does not collect payment. Inventory uses WS2 reserve+commit.
 * Shiprocket sync uses the existing fulfillment service (credentials optional).
 */

const Order = require("../models/Order");
const ReturnRequest = require("../models/ReturnRequest");
const { onOrderCreated } = require("./orderCommerceIntegrityService");
const orderFulfillmentService = require("./orderFulfillmentService");

function cloneLine(item) {
  const plain = item && typeof item.toObject === "function" ? item.toObject() : { ...item };
  delete plain._id;
  return {
    product: plain.product,
    quantity: plain.quantity,
    price: plain.price,
    originalPrice: plain.originalPrice,
    bulkDiscount: plain.bulkDiscount,
    variantCombination: plain.variantCombination,
    variantKey: plain.variantKey,
    variantSku: plain.variantSku,
    variantPriceSnapshot: plain.variantPriceSnapshot,
    variantStockSnapshot: plain.variantStockSnapshot,
    image: plain.image,
    lineShippingApplicability: plain.lineShippingApplicability,
    effectiveShippingApplicability: plain.effectiveShippingApplicability,
    effectiveShippingType: plain.effectiveShippingType,
    shippingResolutionSource: plain.shippingResolutionSource,
    lineShippingVisibility: plain.lineShippingVisibility,
    effectiveShippingVisibility: plain.effectiveShippingVisibility,
    shippingVisibilityResolutionSource: plain.shippingVisibilityResolutionSource,
  };
}

async function allocateInvoiceNumber() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  const todayStart = new Date(year, today.getMonth(), today.getDate());
  const todayEnd = new Date(year, today.getMonth(), today.getDate() + 1);
  const todayInvoiceCount = await Order.countDocuments({
    createdAt: { $gte: todayStart, $lt: todayEnd },
    invoiceNumber: { $exists: true },
  });
  const sequentialNumber = String(todayInvoiceCount + 1).padStart(4, "0");
  return `INV-${year}${month}${day}-${sequentialNumber}`;
}

/**
 * Idempotent: a second call for the same return request returns the existing order.
 */
async function fulfillApprovedReplacement({ returnRequestId }) {
  if (!returnRequestId) {
    return { skipped: true, message: "Return request is required." };
  }

  const returnRequest = await ReturnRequest.findById(returnRequestId);
  if (!returnRequest) {
    return { notFound: true, message: "Return request not found" };
  }
  if (returnRequest.resolution !== "replacement") {
    return { skipped: true, notEligible: true };
  }

  if (returnRequest.replacementOrder) {
    const existing = await Order.findById(returnRequest.replacementOrder);
    if (existing) {
      return {
        alreadyApplied: true,
        orderId: String(existing._id),
        invoiceNumber: existing.invoiceNumber || null,
      };
    }
  }

  const source = await Order.findById(returnRequest.order);
  if (!source) {
    return { notFound: true, message: "Source order not found" };
  }

  const invoiceNumber = await allocateInvoiceNumber();
  const replacement = new Order({
    invoiceNumber,
    buyer: source.buyer,
    billingDetails: source.billingDetails,
    shippingDetails: source.shippingDetails,
    shippingCharge: 0,
    shippingMethod: source.shippingMethod || "manual",
    shippingProvider: source.shippingProvider || "shiprocket",
    shippingApplicability: source.shippingApplicability,
    shippableItemCount: source.shippableItemCount,
    nonShippableItemCount: source.nonShippableItemCount,
    items: (source.items || []).map(cloneLine),
    totalAmount: 0,
    tax: {
      totalTaxableAmount: 0,
      totalTaxAmount: 0,
      totalTaxAdded: 0,
    },
    paymentMethod: source.paymentMethod === "cod" ? "cod" : source.paymentMethod || "phonepe",
    paymentStatus: "success",
    status: "processing",
    fulfilmentKind: "replacement",
    sourceOrder: source._id,
    sourceReturnRequest: returnRequest._id,
    testFlag: Boolean(source.testFlag),
  });

  const integrity = await onOrderCreated(replacement, { isCod: true });
  if (!integrity.success) {
    return {
      inventoryFailed: true,
      message: integrity.error || "Insufficient stock for replacement items",
    };
  }

  await replacement.save();

  returnRequest.replacementOrder = replacement._id;
  returnRequest.manualFollowUpRequired = false;
  await returnRequest.save();

  await orderFulfillmentService.maybeSyncShiprocket(replacement._id).catch((err) => {
    console.error("replacement Shiprocket sync:", err.message);
  });

  return {
    processed: true,
    orderId: String(replacement._id),
    invoiceNumber: replacement.invoiceNumber,
  };
}

module.exports = {
  fulfillApprovedReplacement,
  allocateInvoiceNumber,
};
