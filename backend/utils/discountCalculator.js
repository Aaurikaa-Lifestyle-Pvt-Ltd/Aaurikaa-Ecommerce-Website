// Standardized Discount Calculation Utility
// Provides consistent discount calculation logic across all modules

const { calculatePricing } = require('./pricingEngine');

/**
 * Calculate standardized order total with discounts
 * @param {Array} items - Order items with product and quantity
 * @param {string} couponCode - Optional coupon code
 * @param {Object} shippingAddress - Optional shipping address
 * @param {Object} options - Additional options
 * @returns {Object} Standardized pricing breakdown
 */
async function calculateOrderTotal(items, couponCode = null, shippingAddress = null, options = {}) {
  try {
    // Convert items to cart format for pricing engine
    const cartItems = items.map(item => ({
      product: item.product || { price: item.price },
      quantity: item.quantity || item.qty || 1
    }));

    // Use unified pricing engine for consistent calculation
    const pricing = await calculatePricing({
      cartItems,
      couponCode,
      shippingAddress,
      options
    });

    return {
      subtotal: pricing.subtotal,
      discount: pricing.discount.total,
      discountType: pricing.discount.type,
      discountValue: pricing.discount.value,
      tax: pricing.tax.amount,
      shipping: pricing.shipping.amount,
      total: pricing.total,
      breakdown: pricing.breakdown,
      metadata: pricing.metadata
    };

  } catch (error) {
    console.error('❌ Order total calculation error:', error);
    throw new Error(`Order total calculation failed: ${error.message}`);
  }
}

/**
 * Calculate standardized commission amount
 * @param {number} orderAmount - Order amount
 * @param {number} commissionRate - Commission rate (percentage)
 * @returns {number} Commission amount
 */
function calculateCommissionAmount(orderAmount, commissionRate) {
  if (typeof orderAmount !== 'number' || orderAmount <= 0) {
    throw new Error('Order amount must be a positive number');
  }
  
  if (typeof commissionRate !== 'number' || commissionRate < 0 || commissionRate > 100) {
    throw new Error('Commission rate must be between 0 and 100');
  }

  const commissionAmount = (orderAmount * commissionRate) / 100;
  return Math.round(commissionAmount * 100) / 100; // Round to 2 decimal places
}

/**
 * Calculate standardized seller revenue from order items
 * @param {Array} orderItems - Order items
 * @param {string} sellerId - Seller ID to filter items
 * @returns {Object} Seller revenue breakdown
 */
function calculateSellerRevenue(orderItems, sellerId) {
  if (!Array.isArray(orderItems)) {
    throw new Error('Order items must be an array');
  }

  const sellerItems = orderItems.filter(item => {
    // Check if item belongs to the seller
    if (item.product && item.product.seller) {
      return item.product.seller.toString() === sellerId.toString();
    }
    return false;
  });

  const revenue = sellerItems.reduce((sum, item) => {
    const price = item.product?.salePrice || item.product?.price || item.price || 0;
    const quantity = item.quantity || item.qty || 0;
    return sum + (price * quantity);
  }, 0);

  return {
    itemCount: sellerItems.length,
    totalRevenue: Math.round(revenue * 100) / 100,
    items: sellerItems.map(item => ({
      productId: item.product?._id,
      quantity: item.quantity || item.qty || 0,
      price: item.product?.salePrice || item.product?.price || item.price || 0,
      total: (item.product?.salePrice || item.product?.price || item.price || 0) * (item.quantity || item.qty || 0)
    }))
  };
}

/**
 * Calculate standardized product pricing with discounts
 * @param {Object} product - Product object
 * @param {number} quantity - Quantity
 * @param {string} couponCode - Optional coupon code
 * @param {Object} options - Additional options
 * @returns {Object} Product pricing breakdown
 */
async function calculateProductTotal(product, quantity, couponCode = null, options = {}) {
  try {
    const cartItems = [{
      product: product,
      quantity: quantity
    }];

    const pricing = await calculatePricing({
      cartItems,
      couponCode,
      shippingAddress: null,
      options
    });

    return {
      productId: product._id,
      quantity: quantity,
      unitPrice: product.salePrice || product.regularPrice || product.price || 0,
      subtotal: pricing.subtotal,
      discount: pricing.discount.total,
      tax: pricing.tax.amount,
      shipping: pricing.shipping.amount,
      total: pricing.total,
      breakdown: pricing.breakdown
    };

  } catch (error) {
    console.error('❌ Product total calculation error:', error);
    throw new Error(`Product total calculation failed: ${error.message}`);
  }
}

/**
 * Validate discount application
 * @param {string} couponCode - Coupon code
 * @param {number} orderAmount - Order amount
 * @param {Array} items - Order items
 * @returns {Object} Validation result
 */
async function validateDiscountApplication(couponCode, orderAmount, items = []) {
  try {
    if (!couponCode) {
      return { valid: true, message: 'No coupon applied' };
    }

    // Use pricing engine to validate coupon
    const { validateCoupon } = require('./pricingEngine');
    const validation = await validateCoupon(couponCode, orderAmount);

    if (!validation.valid) {
      return {
        valid: false,
        message: validation.message,
        error: 'INVALID_COUPON'
      };
    }

    return {
      valid: true,
      message: validation.message,
      coupon: validation.coupon
    };

  } catch (error) {
    console.error('❌ Discount validation error:', error);
    return {
      valid: false,
      message: 'Error validating discount',
      error: 'VALIDATION_ERROR'
    };
  }
}

/**
 * Get standardized pricing summary for reporting
 * @param {Array} orders - Array of orders
 * @param {string} sellerId - Optional seller ID to filter
 * @returns {Object} Pricing summary
 */
function getPricingSummary(orders, sellerId = null) {
  if (!Array.isArray(orders)) {
    throw new Error('Orders must be an array');
  }

  let filteredOrders = orders;
  if (sellerId) {
    filteredOrders = orders.filter(order => {
      return order.items.some(item => 
        item.product && item.product.seller && 
        item.product.seller.toString() === sellerId.toString()
      );
    });
  }

  const summary = filteredOrders.reduce((acc, order) => {
    const orderTotal = order.totalAmount || 0;
    const orderDiscount = order.discount || 0;
    const orderTax = order.tax || 0;
    const orderShipping = order.shipping || 0;

    acc.totalOrders += 1;
    acc.totalRevenue += orderTotal;
    acc.totalDiscounts += orderDiscount;
    acc.totalTax += orderTax;
    acc.totalShipping += orderShipping;
    acc.averageOrderValue = acc.totalRevenue / acc.totalOrders;

    return acc;
  }, {
    totalOrders: 0,
    totalRevenue: 0,
    totalDiscounts: 0,
    totalTax: 0,
    totalShipping: 0,
    averageOrderValue: 0
  });

  // Round all monetary values
  Object.keys(summary).forEach(key => {
    if (typeof summary[key] === 'number') {
      summary[key] = Math.round(summary[key] * 100) / 100;
    }
  });

  return summary;
}

module.exports = {
  calculateOrderTotal,
  calculateCommissionAmount,
  calculateSellerRevenue,
  calculateProductTotal,
  validateDiscountApplication,
  getPricingSummary
};
