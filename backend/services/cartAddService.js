const mongoose = require("mongoose");
const Product = require("../models/Product");
const {
  normalizeVariantCombination,
  getVariantStock,
  getVariantPricing,
  getVariantMedia,
  productHasVariants,
  validateVariantCombination,
} = require("../utils/variantUtils");

function findCartItemIndex(cart, productId, variantKey) {
  return cart.findIndex((item) => {
    if (!item || !item.product) return false;
    const itemProductId = item.product._id ? item.product._id.toString() : item.product.toString();
    if (itemProductId !== String(productId)) return false;

    if (variantKey) {
      return item.variantKey === variantKey;
    }

    return !item.variantKey || item.variantKey === "";
  });
}

function cleanCartEntries(cart) {
  return (cart || []).filter((item) => {
    if (!item || !item.product) return false;
    const itemProductId = item.product._id || item.product;
    return mongoose.Types.ObjectId.isValid(itemProductId);
  });
}

/**
 * Authoritative cart add — shared by shopper add-to-cart and Buy Again orchestration.
 * Mutates shopper.cart in memory; caller must save shopper.
 */
async function addItemToShopperCart(shopper, { productId, quantity, variantCombination }) {
  const qty = parseInt(quantity, 10);
  if (!qty || qty < 1) {
    return { success: false, message: "Quantity must be a positive number.", statusCode: 400 };
  }

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return { success: false, message: "Invalid product ID format.", statusCode: 400 };
  }

  let variantKey = null;
  let normalizedVariantCombination = null;
  if (variantCombination && typeof variantCombination === "object" && Object.keys(variantCombination).length > 0) {
    variantKey = normalizeVariantCombination(variantCombination);
    if (variantKey) {
      normalizedVariantCombination = variantCombination;
    }
  }

  const product = await Product.findById(productId).select(
    "stock name weight variants variantStock variantPricing variantMedia mainImage regularPrice salePrice taxIncluded taxRate"
  );
  if (!product) {
    return { success: false, message: "Product not found.", statusCode: 404, reason: "PRODUCT_NOT_FOUND" };
  }

  const hasVariants = productHasVariants(product);
  if (hasVariants) {
    if (!variantCombination || typeof variantCombination !== "object" || Object.keys(variantCombination).length === 0) {
      return {
        success: false,
        message: "Variant selection required.",
        statusCode: 400,
        reason: "VARIANT_UNAVAILABLE",
      };
    }

    if (!variantKey) {
      return {
        success: false,
        message: "Invalid variant selection.",
        statusCode: 400,
        reason: "VARIANT_UNAVAILABLE",
      };
    }

    const validation = validateVariantCombination(product, normalizedVariantCombination);
    if (!validation.valid) {
      return {
        success: false,
        message: validation.error || "Invalid variant selection.",
        statusCode: 400,
        reason: "VARIANT_UNAVAILABLE",
      };
    }
  }

  let availableStock = null;
  if (hasVariants) {
    const variantStock = getVariantStock(product, normalizedVariantCombination);
    if (variantStock === null) {
      return {
        success: false,
        message: "Stock information not available for selected variant.",
        statusCode: 400,
        reason: "VARIANT_UNAVAILABLE",
      };
    }
    availableStock = variantStock;
  } else {
    availableStock = product.stock;
  }

  if (qty > availableStock) {
    return {
      success: false,
      message: `Only ${availableStock} items available in stock.`,
      statusCode: 400,
      reason: "OUT_OF_STOCK",
    };
  }

  if (!Array.isArray(shopper.cart)) {
    shopper.cart = [];
  }

  shopper.cart = cleanCartEntries(shopper.cart);

  let variantPriceSnapshot = null;
  if (hasVariants && variantKey && normalizedVariantCombination) {
    const variantPricing = getVariantPricing(product, normalizedVariantCombination);
    if (variantPricing) {
      variantPriceSnapshot = variantPricing.salePrice || variantPricing.price || null;
    }
  }

  let resolvedImage = null;
  if (hasVariants && variantKey && normalizedVariantCombination) {
    const variantMedia = getVariantMedia(product, normalizedVariantCombination);
    resolvedImage =
      variantMedia && variantMedia.mainImage ? variantMedia.mainImage : product.mainImage || null;
  } else {
    resolvedImage = product.mainImage || null;
  }

  const itemIndex = findCartItemIndex(shopper.cart, productId, variantKey);

  if (itemIndex > -1) {
    const currentQuantity = shopper.cart[itemIndex].quantity;
    const newQuantity = currentQuantity + qty;

    if (newQuantity > availableStock) {
      return {
        success: false,
        message: `Only ${availableStock} items available in stock.`,
        statusCode: 400,
        reason: "OUT_OF_STOCK",
      };
    }

    shopper.cart[itemIndex].quantity = newQuantity;
    if (variantPriceSnapshot !== null && !shopper.cart[itemIndex].variantPriceSnapshot) {
      shopper.cart[itemIndex].variantPriceSnapshot = variantPriceSnapshot;
    }
    if (resolvedImage && !shopper.cart[itemIndex].image) {
      shopper.cart[itemIndex].image = resolvedImage;
    }
  } else {
    const newItem = {
      product: productId,
      quantity: qty,
    };

    if (variantKey && normalizedVariantCombination) {
      newItem.variantCombination = normalizedVariantCombination;
      newItem.variantKey = variantKey;
      if (variantPriceSnapshot !== null) {
        newItem.variantPriceSnapshot = variantPriceSnapshot;
      }
    }
    if (resolvedImage) {
      newItem.image = resolvedImage;
    }

    shopper.cart.push(newItem);
  }

  return {
    success: true,
    productName: product.name,
    message: "Product added to cart",
  };
}

module.exports = {
  addItemToShopperCart,
  findCartItemIndex,
  cleanCartEntries,
};
