const Order = require("../models/Order");
const Product = require("../models/Product");
const Shopper = require("../models/Shopper");
const { addItemToShopperCart } = require("./cartAddService");
const { productHasVariants, validateVariantCombination } = require("../utils/variantUtils");

const FAILURE_REASON = {
  PRODUCT_NOT_FOUND: "PRODUCT_NOT_FOUND",
  PRODUCT_INACTIVE: "PRODUCT_INACTIVE",
  OUT_OF_STOCK: "OUT_OF_STOCK",
  VARIANT_UNAVAILABLE: "VARIANT_UNAVAILABLE",
  SELLER_UNAVAILABLE: "SELLER_UNAVAILABLE",
};

const PRODUCT_SELECT =
  "name slug status approvalStatus seller stock variants variantStock variantPricing variantMedia mainImage";

const WARNING_MESSAGES = {
  PRODUCT_NOT_FOUND: "Product no longer available",
  PRODUCT_INACTIVE: "Product is no longer active",
  OUT_OF_STOCK: "Item is out of stock",
  VARIANT_UNAVAILABLE: "Variant no longer available",
  SELLER_UNAVAILABLE: "Seller unavailable",
};

function resolveHistoricalProductId(orderItem) {
  if (!orderItem?.product) return null;
  if (typeof orderItem.product === "object" && orderItem.product._id) {
    return String(orderItem.product._id);
  }
  return String(orderItem.product);
}

function resolveHistoricalProductName(orderItem, liveProduct) {
  if (liveProduct?.name) return liveProduct.name;
  if (orderItem?.product && typeof orderItem.product === "object" && orderItem.product.name) {
    return orderItem.product.name;
  }
  return "Product unavailable";
}

function isProductActive(product) {
  return product?.status === "published" && product?.approvalStatus === "approved";
}

function isSellerActive(product) {
  const seller = product?.seller;
  if (!seller || typeof seller !== "object") return false;
  return seller.isApproved === true;
}

function validateLiveProductForBuyAgain(orderItem, product) {
  const productId = product?._id ? String(product._id) : resolveHistoricalProductId(orderItem);
  const productName = resolveHistoricalProductName(orderItem, product);

  if (!product) {
    return {
      ok: false,
      productId,
      productName,
      reason: FAILURE_REASON.PRODUCT_NOT_FOUND,
    };
  }

  if (!isProductActive(product)) {
    return {
      ok: false,
      productId: String(product._id),
      productName,
      reason: FAILURE_REASON.PRODUCT_INACTIVE,
    };
  }

  if (!isSellerActive(product)) {
    return {
      ok: false,
      productId: String(product._id),
      productName,
      reason: FAILURE_REASON.SELLER_UNAVAILABLE,
    };
  }

  const hasVariants = productHasVariants(product);
  const historicalVariant = orderItem.variantCombination;

  if (hasVariants) {
    if (!historicalVariant || typeof historicalVariant !== "object" || Object.keys(historicalVariant).length === 0) {
      return {
        ok: false,
        productId: String(product._id),
        productName,
        reason: FAILURE_REASON.VARIANT_UNAVAILABLE,
      };
    }

    const validation = validateVariantCombination(product, historicalVariant);
    if (!validation.valid) {
      return {
        ok: false,
        productId: String(product._id),
        productName,
        reason: FAILURE_REASON.VARIANT_UNAVAILABLE,
      };
    }
  }

  return {
    ok: true,
    productId: String(product._id),
    productName,
    quantity: orderItem.quantity || 1,
    variantCombination: hasVariants ? historicalVariant : undefined,
  };
}

/**
 * Buy Again orchestration — rehydrates cart from historical order with live validation.
 */
async function processBuyAgain({ orderId, shopperId }) {
  const order = await Order.findOne({ _id: orderId, buyer: shopperId })
    .select("items buyer")
    .populate("items.product", "name")
    .lean();

  if (!order) {
    return { notFound: true };
  }

  const shopper = await Shopper.findById(shopperId);
  if (!shopper) {
    return { shopperNotFound: true };
  }

  const addedItems = [];
  const failedItems = [];
  const warnings = [];

  for (const orderItem of order.items || []) {
    const productId = resolveHistoricalProductId(orderItem);
    if (!productId) {
      failedItems.push({
        productId: null,
        productName: resolveHistoricalProductName(orderItem, null),
        reason: FAILURE_REASON.PRODUCT_NOT_FOUND,
      });
      warnings.push(WARNING_MESSAGES.PRODUCT_NOT_FOUND);
      continue;
    }

    const liveProduct = await Product.findById(productId)
      .select(PRODUCT_SELECT)
      .populate("seller", "isApproved shopName")
      .lean();

    const validation = await validateLiveProductForBuyAgain(orderItem, liveProduct);
    if (!validation.ok) {
      failedItems.push({
        productId: validation.productId,
        productName: validation.productName,
        reason: validation.reason,
      });
      warnings.push(WARNING_MESSAGES[validation.reason] || "Item could not be added");
      continue;
    }

    const cartResult = await addItemToShopperCart(shopper, {
      productId: validation.productId,
      quantity: validation.quantity,
      variantCombination: validation.variantCombination,
    });

    if (!cartResult.success) {
      const reason = cartResult.reason || FAILURE_REASON.OUT_OF_STOCK;
      const failedEntry = {
        productId: validation.productId,
        productName: validation.productName,
        reason,
      };
      if (validation.variantCombination) {
        failedEntry.variantCombination = validation.variantCombination;
      }
      failedItems.push(failedEntry);
      warnings.push(WARNING_MESSAGES[reason] || cartResult.message);
      continue;
    }

    addedItems.push({
      productId: validation.productId,
      productName: validation.productName,
      quantity: validation.quantity,
    });
  }

  if (addedItems.length > 0) {
    await shopper.save();
  }

  return {
    notFound: false,
    success: addedItems.length > 0,
    addedItems,
    failedItems,
    warnings: [...new Set(warnings)],
  };
}

module.exports = {
  processBuyAgain,
  validateLiveProductForBuyAgain,
  FAILURE_REASON,
  WARNING_MESSAGES,
};
