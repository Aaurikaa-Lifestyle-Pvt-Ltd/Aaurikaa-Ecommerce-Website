// Unified Pricing Calculation Engine
// This module provides centralized pricing calculation logic for the entire application

const Coupon = require('../models/coupon');
const Product = require('../models/Product');
const gstEngineService = require('../services/gstEngineService');
const { calculateShipping, ShippingEngineError } = require('../services/shippingEngineService');
const { calculateBulkDiscount } = require('./bulkDiscountCalculator');
const {
  combinationFromVariantKey,
  resolveAuthoritativeVariantPrice,
} = require('./variantUtils');

function mapAddressForEngine(address) {
  if (!address) return null;
  return {
    stateId: address.stateId || address.state,
    countryId: address.countryId || address.country,
    pincode: address.zip || address.postalCode || address.pincode,
  };
}

/** P5: charge path uses every cart line (slab engine); no V1 applicability partition. */
function buildCartForShippingEngine(cartItems) {
  return cartItems.map((rawItem) => ({
    product: rawItem.product,
    quantity: rawItem.quantity || rawItem.qty || 1,
    variantPriceSnapshot: rawItem.variantPriceSnapshot,
  }));
}

function rethrowPricingError(error) {
  if (error instanceof ShippingEngineError || error.name === 'ShippingEngineError') {
    throw error;
  }
  const wrapped = new Error(`Pricing calculation failed: ${error.message}`);
  wrapped.cause = error;
  throw wrapped;
}

/**
 * Main pricing calculation function
 * Calculates: subtotal, discounts, tax, shipping, and final total
 */
async function calculatePricing(params) {
  try {
    const {
      cartItems = [],
      couponCode = null,
      shippingAddress = null,
      billingAddress = null,
      options = {},
    } = params;

    // Validate input
    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      return createEmptyPricingResult();
    }

    // 1. Calculate subtotal (with bulk discounts applied)
    const subtotalResult = await calculateSubtotal(cartItems);
    const subtotal = subtotalResult.subtotal; // Subtotal AFTER bulk discounts
    const bulkDiscountAmount = subtotalResult.bulkDiscountAmount;
    const originalSubtotal = subtotalResult.originalSubtotal; // Subtotal BEFORE bulk discounts
    const enrichedItems = subtotalResult.items; // Items with product info for GST

    // 2. Calculate coupon discounts (applied on subtotal after bulk discounts)
    const discountResult = await calculateDiscounts(subtotal, couponCode, cartItems);

    // 3. Slab shipping engine on all cart lines — fail closed
    const shippingResult = await calculateShipping({
      cartItems: buildCartForShippingEngine(cartItems),
      shippingAddress,
      couponCode,
    });

    const shippingCharge = shippingResult.shippingCharge;
    const shippingApplicable = shippingResult.applicable !== false;

    // 4. GST destination: shipping address (new checkouts always physical)
    const gstAddress =
      mapAddressForEngine(shippingAddress) || mapAddressForEngine(billingAddress) || {};

    const gstResult = await gstEngineService.calculateGST({
      items: enrichedItems.map((item) => ({
        ...item,
        price: item.price * (1 - discountResult.totalDiscount / subtotal),
      })),
      shippingCharge: shippingCharge,
      shippingAddress: gstAddress,
    });

    // 5. Calculate final total
    // IMPORTANT: Only add 'totalTaxAdded' (exclusive tax). 
    // Inclusive tax is already part of 'subtotal'.
    const total = Math.max(0, subtotal - discountResult.totalDiscount + gstResult.totalTaxAdded + shippingCharge);

    return {
      subtotal: Math.round(subtotal * 100) / 100, // After bulk discount, before coupon
      originalSubtotal: Math.round(originalSubtotal * 100) / 100, // Before all discounts
      discount: {
        total: Math.round((bulkDiscountAmount + discountResult.totalDiscount) * 100) / 100,
        bulk: Math.round(bulkDiscountAmount * 100) / 100,
        coupon: discountResult.couponDiscount,
        type: discountResult.discountType,
        value: discountResult.discountValue,
        freeShipping: discountResult.freeShipping || shippingResult.shippingMethod === 'free_coupon',
        breakdown: {
          ...discountResult.breakdown,
          bulkDiscountBreakdown: subtotalResult.bulkDiscountBreakdown
        }
      },
      tax: {
        amount: gstResult.totalTax,
        rate: gstResult.taxBreakdown.shipping.taxRate, // Reference rate
        cgst: gstResult.cgst,
        sgst: gstResult.sgst,
        ugst: gstResult.ugst,
        igst: gstResult.igst,
        taxAdded: gstResult.totalTaxAdded, // NEW: Amount actually added to subtotal
        addedCgst: gstResult.addedCgst,
        addedSgst: gstResult.addedSgst,
        addedUgst: gstResult.addedUgst,
        addedIgst: gstResult.addedIgst,
        included: gstResult.taxType === 'inclusive' || gstResult.taxType === 'mixed/inclusive',
        shippingTax: gstResult.taxBreakdown.shipping
      },
      shipping: {
        applicable: shippingApplicable,
        amount: Math.round(shippingCharge),
        method: shippingResult.shippingMethod,
        label: shippingResult.ruleApplied?.name || "Shipping",
        breakdown: shippingResult,
      },
      shippingEngineInput: shippingResult.engineInput || null,
      total: Math.round(total * 100) / 100,
      breakdown: {
        subtotal,
        originalSubtotal: originalSubtotal,
        bulkDiscount: bulkDiscountAmount,
        couponDiscount: discountResult.totalDiscount,
        tax: gstResult.totalTax,
        taxAdded: gstResult.totalTaxAdded,
        shipping: shippingCharge,
        total,
        gstBreakdown: gstResult.taxBreakdown
      },
      metadata: {
        calculatedAt: new Date(),
        cartItemCount: cartItems.length,
        couponApplied: !!couponCode,
        bulkDiscountApplied: bulkDiscountAmount > 0,
        shippingAddress: !!shippingAddress,
        billingAddress: !!billingAddress,
        gstEngine: "v2",
      },
    };

  } catch (error) {
    console.error('❌ Pricing calculation error:', error);
    rethrowPricingError(error);
  }
}

/**
 * Calculate subtotal from cart items (with bulk discounts applied)
 * @param {Array} cartItems - Array of cart items
 * @returns {Object} Object containing subtotal and bulk discount breakdown
 */
async function calculateSubtotal(cartItems) {
  let subtotal = 0;
  let originalSubtotal = 0;
  let bulkDiscountTotal = 0;
  const bulkDiscountBreakdown = [];
  const enrichedItems = [];

  for (const item of cartItems) {
    let productId = item.product;

    // Extract ID if product is an object
    if (productId && typeof productId === 'object') {
      productId = productId._id || productId.id;
    }

    let product = null;
    if (productId) {
      product = await Product.findById(productId).populate({
        path: 'seller',
        select: 'address.state',
        populate: { path: 'address.state', select: 'name' }
      });
    }

    // Fallback to provided object if DB fetch fails
    if (!product && item.product && typeof item.product === 'object') {
      product = item.product;
    }

    const quantity = item.quantity || item.qty || 0;

    if (!product || quantity <= 0) {
      continue;
    }

    const hasVariantSelection = Boolean(
      item.variantKey ||
      (item.variantCombination && typeof item.variantCombination === 'object' && Object.keys(item.variantCombination).length > 0)
    );

    let baseUnitPrice = product.salePrice || product.regularPrice || product.price || 0;

    if (hasVariantSelection) {
      const combination =
        item.variantCombination && Object.keys(item.variantCombination).length > 0
          ? item.variantCombination
          : combinationFromVariantKey(item.variantKey);
      const authoritative = resolveAuthoritativeVariantPrice(product, combination, item.variantKey);
      if (authoritative == null) {
        console.error('❌ calculateSubtotal: Variant price missing on Product.variantPricing', {
          productId: product._id || product.id,
          productName: product.name,
          variantKey: item.variantKey,
        });
        continue;
      }
      baseUnitPrice = authoritative;
    }

    if (baseUnitPrice <= 0) {
      console.error('❌ calculateSubtotal: Invalid baseUnitPrice for item', {
        productId: product._id || product.id,
        productName: product.name,
        baseUnitPrice,
        variantPriceSnapshot: item.variantPriceSnapshot,
        hasVariantPricing: !!product?.variantPricing
      });
      continue;
    }

    const originalItemTotal = baseUnitPrice * quantity;
    originalSubtotal += originalItemTotal;

    // Check if product has bulk discount enabled
    let itemPrice = baseUnitPrice;
    let itemBulkDiscount = 0;

    if (product.bulkDiscount?.enabled && product.bulkDiscount?.tiers && product.bulkDiscount.tiers.length > 0) {
      // Calculate bulk discount for this item - pass baseUnitPrice explicitly
      const bulkDiscountResult = calculateBulkDiscount(product, quantity, baseUnitPrice);

      if (bulkDiscountResult.success && bulkDiscountResult.savings > 0) {
        // Use discounted price if bulk discount is applicable
        itemPrice = bulkDiscountResult.discountedPrice;
        itemBulkDiscount = bulkDiscountResult.totalSavings; // Total savings for all units
        bulkDiscountTotal += itemBulkDiscount;

        bulkDiscountBreakdown.push({
          productId: product._id || product.id,
          productName: product.name,
          quantity,
          originalPrice: baseUnitPrice, // Use baseUnitPrice (variant price when variants exist)
          discountedPrice: bulkDiscountResult.discountedPrice,
          originalTotal: originalItemTotal,
          discountedTotal: bulkDiscountResult.totalPrice,
          savings: itemBulkDiscount,
          savingsPercentage: bulkDiscountResult.savingsPercentage,
          tier: bulkDiscountResult.applicableTier
        });
      }
    }

    // Add item total (with bulk discount applied if applicable)
    const itemTotal = itemPrice * quantity;
    subtotal += itemTotal;

    // Enrich item for GST calculation
    enrichedItems.push({
      productId: product._id || product.id,
      name: product.name,
      price: itemPrice, // Base price after bulk discount
      quantity,
      category: product.category,
      subcategory: product.subcategory,
      childCategory: product.childCategory,
      taxIncluded: product.taxIncluded || false,
      taxRate: product.taxRate, // If product has explicit override
      originState: product.seller?.address?.state // Pass popuated State object (has _id and name)
    });
  }

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    originalSubtotal: Math.round(originalSubtotal * 100) / 100,
    bulkDiscountAmount: Math.round(bulkDiscountTotal * 100) / 100,
    bulkDiscountBreakdown,
    items: enrichedItems
  };
}

/**
 * Calculate discounts (coupon-based)
 * @param {number} subtotal - Cart subtotal
 * @param {string} couponCode - Coupon code
 * @param {Array} cartItems - Cart items for validation
 * @returns {Object} Discount calculation result
 */
async function calculateDiscounts(subtotal, couponCode, cartItems) {
  let totalDiscount = 0;
  let couponDiscount = 0;
  let discountType = 'none';
  let discountValue = 0;
  let freeShipping = false;
  let breakdown = {};

  if (!couponCode) {
    return {
      totalDiscount,
      couponDiscount,
      discountType,
      discountValue,
      freeShipping,
      breakdown
    };
  }

  try {
    // Fetch coupon from database
    const coupon = await Coupon.findOne({
      code: couponCode.toUpperCase(),
      isActive: true,
      validFrom: { $lte: new Date() },
      validTo: { $gte: new Date() }
    });

    if (!coupon) {
      return {
        totalDiscount,
        couponDiscount,
        discountType,
        discountValue,
        freeShipping,
        breakdown: { error: 'Invalid or expired coupon' }
      };
    }

    // Check minimum order requirement
    if (subtotal < coupon.minOrder) {
      return {
        totalDiscount,
        couponDiscount,
        discountType,
        discountValue,
        freeShipping,
        breakdown: { error: `Minimum order amount of ₹${coupon.minOrder} required` }
      };
    }

    // Calculate discount based on type
    if (coupon.discountType === 'percentage') {
      couponDiscount = (subtotal * coupon.discountValue) / 100;
      discountType = 'percentage';
      discountValue = coupon.discountValue;
    } else if (coupon.discountType === 'fixed') {
      couponDiscount = Math.min(coupon.discountValue, subtotal);
      discountType = 'fixed';
      discountValue = coupon.discountValue;
    }

    // Check for free shipping
    if (coupon.freeShipping) {
      freeShipping = true;
    }

    totalDiscount = couponDiscount;

    breakdown = {
      couponCode: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      freeShipping: coupon.freeShipping,
      minOrder: coupon.minOrder
    };

  } catch (error) {
    console.error('❌ Discount calculation error:', error);
    breakdown = { error: 'Error calculating discount' };
  }

  return {
    totalDiscount,
    couponDiscount,
    discountType,
    discountValue,
    freeShipping,
    breakdown
  };
}

// Tax calculation is now handled by taxShippingEngine.js

/**
 * Create empty pricing result for invalid inputs
 * @returns {Object} Empty pricing result
 */
function createEmptyPricingResult() {
  return {
    subtotal: 0,
    originalSubtotal: 0,
    discount: {
      total: 0,
      bulk: 0,
      coupon: 0,
      type: 'none',
      value: 0,
      freeShipping: false,
      breakdown: {
        bulkDiscountBreakdown: []
      }
    },
    tax: {
      amount: 0,
      rate: 0,
      included: false
    },
    shipping: {
      applicable: false,
      amount: 0,
      method: 'none',
      label: 'No items in cart',
      breakdown: {},
    },
    shippingEngineInput: null,
    total: 0,
    breakdown: {
      subtotal: 0,
      originalSubtotal: 0,
      bulkDiscount: 0,
      couponDiscount: 0,
      totalDiscount: 0,
      tax: 0,
      shipping: 0,
      total: 0
    },
    metadata: {
      calculatedAt: new Date(),
      cartItemCount: 0,
      couponApplied: false,
      bulkDiscountApplied: false,
      shippingAddress: false
    }
  };
}

/**
 * Validate coupon code
 * @param {string} couponCode - Coupon code to validate
 * @param {number} cartTotal - Cart total for validation
 * @param {string} userId - User ID for per-user usage tracking (optional)
 * @returns {Object} Validation result
 */
async function validateCoupon(couponCode, cartTotal, userId = null) {
  try {
    if (!couponCode) {
      return {
        valid: false,
        message: 'No coupon code provided'
      };
    }

    const coupon = await Coupon.findOne({
      code: couponCode.toUpperCase(),
      isActive: true,
      validFrom: { $lte: new Date() },
      validTo: { $gte: new Date() }
    });

    if (!coupon) {
      return {
        valid: false,
        message: 'Invalid or expired coupon code'
      };
    }

    if (cartTotal < coupon.minOrder) {
      return {
        valid: false,
        message: `Minimum order amount of ₹${coupon.minOrder} required for this coupon`
      };
    }

    // Check global usage limit
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return {
        valid: false,
        message: 'This coupon has reached its usage limit'
      };
    }

    // Check per-user usage limit
    if (userId && coupon.perUserLimit) {
      const userUsage = coupon.userUsageCount.find(usage =>
        usage.userId.toString() === userId.toString()
      );

      if (userUsage && userUsage.count >= coupon.perUserLimit) {
        return {
          valid: false,
          message: `You have already used this coupon ${coupon.perUserLimit} time(s)`
        };
      }
    }

    return {
      valid: true,
      message: `✅ Coupon applied! ${coupon.discountValue}${coupon.discountType === 'percentage' ? '%' : '₹'} off`,
      coupon: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        freeShipping: coupon.freeShipping,
        minOrder: coupon.minOrder,
        usageLimit: coupon.usageLimit,
        usedCount: coupon.usedCount,
        perUserLimit: coupon.perUserLimit
      }
    };

  } catch (error) {
    console.error('❌ Coupon validation error:', error);
    return {
      valid: false,
      message: 'Error validating coupon. Please try again.'
    };
  }
}

/**
 * Calculate pricing for a single product (with bulk discounts applied)
 * @param {Object} product - Product object
 * @param {number} quantity - Quantity
 * @param {Object} options - Additional options
 * @returns {Object} Product pricing
 */
function calculateProductPricing(product, quantity = 1, options = {}) {
  // Get base price (sale price if available, otherwise regular price)
  // Note: For variant products, baseUnitPrice should be passed via options.variantPriceSnapshot
  const baseUnitPrice = options.variantPriceSnapshot !== null && options.variantPriceSnapshot !== undefined
    ? options.variantPriceSnapshot
    : (product.salePrice || product.regularPrice || product.price || 0);

  if (baseUnitPrice <= 0) {
    console.error('❌ calculateProductPricing: Invalid baseUnitPrice', {
      productId: product._id || product.id,
      productName: product.name,
      baseUnitPrice
    });
    return createEmptyPricingResult();
  }

  let price = baseUnitPrice;
  let originalPrice = baseUnitPrice;
  let bulkDiscount = 0;
  let bulkDiscountInfo = null;

  // Check if product has bulk discount enabled
  if (product.bulkDiscount?.enabled && product.bulkDiscount?.tiers && product.bulkDiscount.tiers.length > 0) {
    const bulkDiscountResult = calculateBulkDiscount(product, quantity, baseUnitPrice);

    if (bulkDiscountResult.success && bulkDiscountResult.savings > 0) {
      price = bulkDiscountResult.discountedPrice;
      originalPrice = bulkDiscountResult.originalPrice;
      bulkDiscount = bulkDiscountResult.totalSavings; // Total savings for all units
      bulkDiscountInfo = {
        discountType: bulkDiscountResult.discountType,
        discountValue: bulkDiscountResult.discount,
        savings: bulkDiscountResult.savings,
        savingsPercentage: bulkDiscountResult.savingsPercentage,
        tier: bulkDiscountResult.applicableTier
      };
    }
  }

  const subtotal = price * quantity;
  const originalSubtotal = originalPrice * quantity;

  // Calculate tax if product has tax rate
  const taxRate = product.taxRate || 0.05;
  const taxAmount = subtotal * taxRate;

  // Calculate shipping if product has shipping charge
  const shippingCharge = product.shippingCharge || 0;

  const total = subtotal + taxAmount + shippingCharge;

  return {
    price,
    originalPrice,
    quantity,
    subtotal: Math.round(subtotal * 100) / 100,
    originalSubtotal: Math.round(originalSubtotal * 100) / 100,
    bulkDiscount: Math.round(bulkDiscount * 100) / 100,
    bulkDiscountInfo,
    tax: {
      amount: Math.round(taxAmount * 100) / 100,
      rate: Math.round(taxRate * 100)
    },
    shipping: {
      amount: Math.round(shippingCharge)
    },
    total: Math.round(total * 100) / 100
  };
}

/**
 * Record coupon usage when an order is placed
 * @param {string} couponCode - Coupon code that was used
 * @param {string} userId - User ID who used the coupon
 * @param {string} orderId - Order ID where coupon was used
 * @param {number} discountAmount - Discount amount applied
 * @param {number} orderTotal - Total order amount
 * @param {Object} requestInfo - Request information (IP, user agent)
 * @returns {Object} Result of recording usage
 */
async function recordCouponUsage(couponCode, userId, orderId, discountAmount, orderTotal, requestInfo = {}) {
  try {
    const coupon = await Coupon.findOne({
      code: couponCode.toUpperCase(),
      isActive: true
    });

    if (!coupon) {
      return {
        success: false,
        error: 'Coupon not found'
      };
    }

    if (orderId && Array.isArray(coupon.usageHistory)) {
      const alreadyRecorded = coupon.usageHistory.some(
        (entry) => entry.orderId && entry.orderId.toString() === orderId.toString()
      );
      if (alreadyRecorded) {
        return {
          success: true,
          alreadyApplied: true,
          message: 'Coupon usage already recorded for this order'
        };
      }
    }

    // Add to usage history
    coupon.usageHistory.push({
      userId: userId,
      orderId: orderId,
      usedAt: new Date(),
      discountAmount: discountAmount,
      orderTotal: orderTotal,
      ipAddress: requestInfo.ipAddress || null,
      userAgent: requestInfo.userAgent || null
    });

    // Increment global usage count
    coupon.usedCount += 1;

    // Update per-user usage count
    if (userId) {
      const existingUserUsage = coupon.userUsageCount.find(usage =>
        usage.userId.toString() === userId.toString()
      );

      if (existingUserUsage) {
        existingUserUsage.count += 1;
        existingUserUsage.lastUsed = new Date();
      } else {
        coupon.userUsageCount.push({
          userId: userId,
          count: 1,
          lastUsed: new Date()
        });
      }
    }

    await coupon.save();

    return {
      success: true,
      message: 'Coupon usage recorded successfully'
    };

  } catch (error) {
    console.error('❌ Error recording coupon usage:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Reverse a previously recorded coupon usage for an order. Idempotent per orderId.
 */
async function releaseCouponUsage(couponCode, orderId, userId) {
  try {
    if (!couponCode || !orderId) {
      return { success: true, skipped: true };
    }

    const coupon = await Coupon.findOne({
      code: String(couponCode).toUpperCase(),
    });

    if (!coupon) {
      return { success: false, error: 'Coupon not found' };
    }

    const history = Array.isArray(coupon.usageHistory) ? coupon.usageHistory : [];
    const index = history.findIndex(
      (entry) => entry.orderId && entry.orderId.toString() === orderId.toString()
    );

    if (index === -1) {
      return { success: true, alreadyApplied: true };
    }

    coupon.usageHistory.splice(index, 1);
    coupon.usedCount = Math.max(0, (coupon.usedCount || 0) - 1);

    if (userId && Array.isArray(coupon.userUsageCount)) {
      const userUsage = coupon.userUsageCount.find(
        (usage) => usage.userId && usage.userId.toString() === userId.toString()
      );
      if (userUsage) {
        userUsage.count = Math.max(0, (userUsage.count || 0) - 1);
      }
    }

    await coupon.save();

    return { success: true, message: 'Coupon usage released' };
  } catch (error) {
    console.error('❌ Error releasing coupon usage:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  calculatePricing,
  calculateSubtotal,
  calculateDiscounts,
  validateCoupon,
  calculateProductPricing,
  createEmptyPricingResult,
  recordCouponUsage,
  releaseCouponUsage
};
