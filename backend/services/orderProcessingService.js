/**
 * Order Processing Service
 * Handles order creation with bulk discount calculations and tracking
 */

const Product = require('../models/Product');
const Coupon = require('../models/coupon');
const { calculateBulkDiscount, calculateOrderBulkDiscount } = require('../utils/bulkDiscountCalculator');
const { validateCoupon, recordCouponUsage } = require('../utils/pricingEngine');
const gstEngineService = require('../services/gstEngineService');
const { calculateShipping } = require('./shippingEngineService');
const { normalizeVariantCombination, computeVariantSku, getVariantStock, getVariantMedia, productHasVariants, validateVariantCombination, combinationFromVariantKey, resolveAuthoritativeVariantPrice } = require('../utils/variantUtils');
const { resolveLocationName, isObjectIdString } = require('../utils/invoiceAddressFormatter');

function mapAddressForEngine(address) {
  if (!address || typeof address !== 'object') return null;
  return {
    stateId: address.stateId || address.state,
    countryId: address.countryId || address.country,
    pincode: address.zip || address.postalCode,
  };
}

/** Charge path uses every order line (slab engine). */
function buildCartItemsForShippingEngine(processedItems, rawItems) {
  return processedItems.map((processed, idx) => {
    const raw = rawItems[idx] || {};
    return {
      product: processed.product || raw.product,
      quantity: processed.quantity || raw.quantity || 1,
      variantPriceSnapshot: processed.variantPriceSnapshot ?? raw.variantPriceSnapshot,
    };
  });
}

/**
 * Map checkout billing/shipping form objects to persisted Order billingDetails/shippingDetails (flat).
 * Resolves state/country IDs to human-readable names.
 */
async function mapCheckoutAddressToDetails(addr) {
  if (!addr || typeof addr !== 'object') return {};
  const addrLine =
    [addr.address1, addr.address2].filter(Boolean).join(', ') ||
    (addr.street ? String(addr.street) : '');

  const stateRaw =
    addr.state != null && typeof addr.state === 'object'
      ? ''
      : addr.stateId || addr.state || '';
  const countryRaw = addr.countryId || addr.country || 'India';

  const [stateName, countryName] = await Promise.all([
    resolveLocationName(stateRaw),
    resolveLocationName(countryRaw),
  ]);

  const cityRaw = addr.postoffice || addr.city || '';

  return {
    name: (addr.name || '').trim(),
    email: addr.email || '',
    phone: addr.phone || '',
    address: addrLine || '',
    city: isObjectIdString(cityRaw) ? '' : cityRaw,
    state: stateName || (isObjectIdString(stateRaw) ? '' : String(stateRaw)),
    pincode: (addr.zip || addr.postalCode || '').toString(),
    country: countryName || (isObjectIdString(countryRaw) ? 'India' : String(countryRaw)),
  };
}

/**
 * Process order items with bulk discount calculations
 */
const processOrderWithBulkDiscounts = async (items) => {
  try {
    const processedItems = [];
    let totalOriginalAmount = 0;
    let totalDiscountAmount = 0;
    let itemsWithBulkDiscount = 0;

    for (const item of items) {
      // Fetch product details to get bulk discount configuration and category info
      const product = await Product.findById(item.product).populate({
        path: 'seller',
        select: 'address.state',
        populate: { path: 'address.state', select: 'name' }
      });
      if (!product) {
        throw new Error(`Product not found: ${item.product}`);
      }

      const hasVariants = productHasVariants(product);

      // Phase 4: Order Validation Enforcement
      if (hasVariants) {
        if (!item.variantCombination && item.variantKey) {
          item.variantCombination = combinationFromVariantKey(item.variantKey);
        }
        if (!item.variantKey && item.variantCombination) {
          item.variantKey = normalizeVariantCombination(item.variantCombination);
        }
        // Product has variants - variant fields are required
        if (!item.variantKey || !item.variantCombination) {
          throw new Error(`Variant selection required for product: ${product.name}. Please select size, color, or other variant options.`);
        }

        // Validate variantCombination against product's actual variant definitions
        const validation = validateVariantCombination(product, item.variantCombination);
        if (!validation.valid) {
          throw new Error(`Invalid variant selection for product: ${product.name}. ${validation.error}`);
        }
      }

      // Capture variant information from cart item if present
      let variantData = {};
      if (hasVariants) {
        // Phase 4: For variant products, variant data is mandatory
        const variantKey = item.variantKey;
        const variantCombination = item.variantCombination;

        // Get variant SKU - use stored variantSku if available, otherwise compute it
        let variantSku = null;
        if (product.variantSku && typeof product.variantSku === 'object' && product.variantSku[variantKey]) {
          // Use stored variant SKU from product
          variantSku = product.variantSku[variantKey];
        } else {
          // Fallback: compute variant SKU (for backward compatibility with existing products)
          variantSku = computeVariantSku(product.sku, variantCombination);
        }

        if (!variantSku) {
          throw new Error(`Failed to get variant SKU for product: ${product.name}. Please select valid variant options.`);
        }

        // SEC-001: variant price is always resolved from trusted Product.variantPricing.
        // Client/cart variantPriceSnapshot is ignored for commercial calculation.
        const variantPriceSnapshot = resolveAuthoritativeVariantPrice(product, variantCombination);
        if (variantPriceSnapshot === null) {
          throw new Error(`Variant price not available for product: ${product.name}. Please remove and re-add this item to cart with proper variant selection.`);
        }

        // Get variant stock snapshot
        const variantStock = getVariantStock(product, variantCombination);
        const variantStockSnapshot = variantStock !== null ? variantStock : null;

        variantData = {
          variantCombination,
          variantKey,
          variantSku: variantSku,
          variantPriceSnapshot: variantPriceSnapshot,
          variantStockSnapshot: variantStockSnapshot !== null ? variantStockSnapshot : undefined,
        };
      } else if (item.variantKey && item.variantCombination) {
        // Non-variant product but variant data provided (optional, for backward compatibility)
        const variantKey = item.variantKey;
        const variantCombination = item.variantCombination;

        // Get variant SKU - use stored variantSku if available, otherwise compute it
        let variantSku = null;
        if (product.variantSku && typeof product.variantSku === 'object' && product.variantSku[variantKey]) {
          variantSku = product.variantSku[variantKey];
        } else {
          variantSku = computeVariantSku(product.sku, variantCombination);
        }

        const variantPriceSnapshot = resolveAuthoritativeVariantPrice(product, variantCombination);
        if (variantPriceSnapshot === null) {
          throw new Error(`Variant price not available for product: ${product.name}. Please remove and re-add this item to cart with proper variant selection.`);
        }

        const variantStock = getVariantStock(product, variantCombination);
        const variantStockSnapshot = variantStock !== null ? variantStock : null;

        variantData = {
          variantCombination,
          variantKey,
          variantSku: variantSku || undefined,
          variantPriceSnapshot: variantPriceSnapshot !== null ? variantPriceSnapshot : undefined,
          variantStockSnapshot: variantStockSnapshot !== null ? variantStockSnapshot : undefined,
        };
      }

      // Phase 4: Pricing Authority Lock
      let basePrice;
      if (hasVariants) {
        // Variant products: variant price is mandatory (no fallback)
        basePrice = variantData.variantPriceSnapshot;
      } else {
        // Non-variant products: use product-level pricing
        basePrice = product.salePrice || product.regularPrice;
      }

      const originalPrice = basePrice;
      const originalItemTotal = originalPrice * item.quantity;
      totalOriginalAmount += originalItemTotal;

      // Snapshot image for order (variant image or product main image; do not depend on live product later)
      let itemImage = null;
      if (item.image) {
        itemImage = item.image;
      } else if (item.variantKey && item.variantCombination) {
        const variantMedia = getVariantMedia(product, item.variantCombination);
        itemImage = (variantMedia && variantMedia.mainImage) ? variantMedia.mainImage : (product.mainImage || null);
      } else {
        itemImage = product.mainImage || null;
      }

      let processedItem = {
        product: item.product,
        name: product.name, // Persist product name for audit
        quantity: item.quantity,
        price: originalPrice, // Final price after bulk discount
        originalPrice: originalPrice,
        category: product.category,
        subcategory: product.subcategory,
        childCategory: product.childCategory,
        taxIncluded: product.taxIncluded || false,
        taxRate: product.taxRate, // Optional override
        bulkDiscount: {
          applied: false,
          discountAmount: 0,
          discountPercentage: 0,
          tierUsed: null,
        },
        ...variantData, // Include variant fields if present
        originState: product.seller?.address?.state // Pass popuated State object for GST engine
      };
      if (itemImage) {
        processedItem.image = itemImage;
      }

      // Calculate bulk discount if product has bulk pricing enabled
      if (product.bulkDiscount && product.bulkDiscount.enabled && product.bulkDiscount.tiers.length > 0) {
        const bulkDiscountResult = calculateBulkDiscount(
          product,
          item.quantity,
          basePrice
        );

        if (bulkDiscountResult.success && bulkDiscountResult.savings > 0) {
          processedItem.price = bulkDiscountResult.discountedPrice;
          processedItem.bulkDiscount = {
            applied: true,
            discountAmount: bulkDiscountResult.savings,
            discountPercentage: bulkDiscountResult.savingsPercentage,
            tierUsed: bulkDiscountResult.applicableTier,
          };

          totalDiscountAmount += bulkDiscountResult.totalSavings; // Total savings for all units
          itemsWithBulkDiscount++;
        }
      }

      processedItems.push(processedItem);
    }

    // Calculate final total amount as sum of all item totals
    const finalTotalAmount = processedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const totalDiscountPercentage = totalOriginalAmount > 0
      ? (totalDiscountAmount / totalOriginalAmount) * 100
      : 0;

    // Create bulk discount summary
    const bulkDiscountSummary = {
      totalOriginalAmount,
      totalDiscountAmount,
      totalDiscountPercentage,
      itemsWithBulkDiscount,
    };

    return {
      success: true,
      items: processedItems,
      totalAmount: finalTotalAmount,
      bulkDiscountSummary,
    };

  } catch (error) {
    console.error('Error processing order with bulk discounts:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Validate order items and calculate totals
 */
const validateAndProcessOrder = async (items) => {
  try {
    // Validate items array
    if (!Array.isArray(items) || items.length === 0) {
      return {
        success: false,
        error: 'Order must contain at least one item',
      };
    }

    // Validate each item
    for (const item of items) {
      if (!item.product || !item.quantity || item.quantity <= 0) {
        return {
          success: false,
          error: 'Each item must have a valid product ID and quantity',
        };
      }

      const product = await Product.findById(item.product);
      if (!product) {
        return {
          success: false,
          error: `Product not found: ${item.product}`,
        };
      }

      const hasVariants = productHasVariants(product);

      if (hasVariants) {
        if (!item.variantKey || !item.variantCombination) {
          return {
            success: false,
            error: `Variant selection required for product: ${product.name}. Please select size, color, or other variant options.`,
          };
        }

        const validation = validateVariantCombination(product, item.variantCombination);
        if (!validation.valid) {
          return {
            success: false,
            error: `Invalid variant selection for product: ${product.name}. ${validation.error}`,
          };
        }
      }

      let availableStock = null;
      if (hasVariants) {
        const variantStock = getVariantStock(product, item.variantCombination);
        if (variantStock === null) {
          return {
            success: false,
            error: `Stock information not available for selected variant of product: ${product.name}. Please select a different variant.`,
          };
        }
        availableStock = variantStock;
      } else {
        availableStock = product.stock;
      }

      if (availableStock < item.quantity) {
        const variantMessage = hasVariants ? ' (selected variant)' : '';
        return {
          success: false,
          error: `Insufficient stock for product: ${product.name}${variantMessage}. Available: ${availableStock}, Requested: ${item.quantity}.`,
        };
      }
    }

    const processedOrder = await processOrderWithBulkDiscounts(items);

    if (!processedOrder.success) {
      return processedOrder;
    }

    return {
      success: true,
      data: processedOrder,
    };

  } catch (error) {
    console.error('Error validating and processing order:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Create order with bulk discount, coupon, tax (v2), and shipping (v2) processing
 */
const createOrderWithBulkDiscounts = async (orderData, requestInfo = {}) => {
  try {
    const {
      items,
      coupon,
      buyer,
      billingAddress,
      shippingAddress,
      status: orderStatus,
      paymentStatus: orderPaymentStatus,
      paymentTransactionId: orderPaymentTransactionId,
      ...otherOrderData
    } = orderData;

    // Validate and process order items
    const validationResult = await validateAndProcessOrder(items);
    if (!validationResult.success) {
      return {
        success: false,
        error: validationResult.error,
      };
    }

    const processedData = validationResult.data;

    let subtotalAmount = processedData.totalAmount;
    let couponDiscount = 0;
    let couponData = null;

    // Validate and apply coupon
    if (coupon && coupon.trim()) {
      const couponValidation = await validateCoupon(coupon.trim(), subtotalAmount, buyer);

      if (couponValidation.valid) {
        couponData = couponValidation.coupon;

        if (couponData.discountType === 'percentage') {
          couponDiscount = (subtotalAmount * couponData.discountValue) / 100;
        } else if (couponData.discountType === 'fixed') {
          couponDiscount = Math.min(couponData.discountValue, subtotalAmount);
        }

        subtotalAmount = Math.max(0, subtotalAmount - couponDiscount);
      } else {
        return {
          success: false,
          error: `Coupon validation failed: ${couponValidation.message}`,
        };
      }
    }

    // Unified Shipping Engine — P5: all lines; always-physical for new orders (fail closed)
    const engineShippingAddress = mapAddressForEngine(shippingAddress || billingAddress);
    const cartForShippingEngine = buildCartItemsForShippingEngine(processedData.items, items);

    const shippingResult = await calculateShipping({
      cartItems: cartForShippingEngine,
      shippingAddress: engineShippingAddress,
      couponCode: coupon ? coupon.trim() : null,
    });

    const shippingCharge = shippingResult.shippingCharge;

    const gstAddress = engineShippingAddress || mapAddressForEngine(billingAddress) || {};

    const discountRatio = processedData.totalAmount > 0 ? (1 - couponDiscount / processedData.totalAmount) : 1;

    const gstResult = await gstEngineService.calculateGST({
      items: processedData.items.map((item) => ({
        ...item,
        originState: item.originState,
        price: item.price * discountRatio,
      })),
      shippingCharge: shippingCharge,
      shippingAddress: gstAddress,
    });

    // Final total amount
    // Use totalTaxAdded to account for Inclusive vs Exclusive tax logic correctly
    const finalAmount = subtotalAmount + gstResult.totalTaxAdded + shippingCharge;

    const billingDetails = await mapCheckoutAddressToDetails(billingAddress);
    const shippingDetails = await mapCheckoutAddressToDetails(shippingAddress || billingAddress);

    // Create order object (do not persist raw billingAddress/shippingAddress on the document)
    const order = {
      ...otherOrderData,
      buyer: buyer,
      items: processedData.items,
      totalAmount: Math.round(finalAmount * 100) / 100,
      bulkDiscountSummary: processedData.bulkDiscountSummary,
      billingDetails,
      shippingDetails,
      status: orderStatus !== undefined ? orderStatus : 'pending',
      paymentStatus: orderPaymentStatus !== undefined ? orderPaymentStatus : 'pending',
      paymentTransactionId: orderPaymentTransactionId !== undefined ? orderPaymentTransactionId : null,

      // Shipping Engine fields (P8: do not write V1/V2 applicability/visibility snapshots)
      shippingCharge: shippingCharge,
      shippingMethod: shippingResult.shippingMethod,
      shippingProvider: null,
      shippingEngineInput: shippingResult.engineInput || undefined,
      shippingRuleSnapshot: shippingResult.ruleApplied,
      shippingZoneSnapshot: shippingResult.shippingZone,

      coupon: coupon ? {
        code: coupon.trim(),
        discountAmount: couponDiscount,
        couponData: couponData
      } : null,

      // New Tax Snapshot Structure (Objective 4.5)
      tax: {
        totalTaxableAmount: gstResult.taxableAmount,
        totalTaxAmount: gstResult.totalTax,
        totalTaxAdded: gstResult.totalTaxAdded,
        cgst: gstResult.cgst,
        sgst: gstResult.sgst,
        ugst: gstResult.ugst,
        igst: gstResult.igst,
        taxType: gstResult.taxType,
        taxSummary: [
          ...gstResult.taxBreakdown.items.map(item => ({
            taxRate: item.taxRate,
            taxableAmount: item.taxableAmount,
            taxAmount: item.taxAmount,
            cgst: item.cgst,
            sgst: item.sgst,
            ugst: item.ugst,
            igst: item.igst,
            taxType: 'GST'
          })),
          {
            taxRate: gstResult.taxBreakdown.shipping.taxRate,
            taxableAmount: gstResult.taxBreakdown.shipping.amount,
            taxAmount: gstResult.taxBreakdown.shipping.taxAmount,
            cgst: gstResult.taxBreakdown.shipping.cgst,
            sgst: gstResult.taxBreakdown.shipping.sgst,
            ugst: gstResult.taxBreakdown.shipping.ugst,
            igst: gstResult.taxBreakdown.shipping.igst,
            taxType: 'Shipping GST'
          }
        ],
        shippingTax: gstResult.taxBreakdown.shipping,
        taxBreakdownSnapshot: gstResult.taxBreakdown
      }
    };

    return {
      success: true,
      order,
    };

  } catch (error) {
    console.error('Error creating order:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Get order bulk discount summary for display
 * @param {Object} order - Order object with bulk discount information
 * @returns {Object} Formatted bulk discount summary
 */
const getOrderBulkDiscountSummary = (order) => {
  if (!order.bulkDiscountSummary) {
    return {
      hasBulkDiscounts: false,
      summary: null,
    };
  }

  const { bulkDiscountSummary } = order;

  return {
    hasBulkDiscounts: bulkDiscountSummary.itemsWithBulkDiscount > 0,
    summary: {
      totalOriginalAmount: bulkDiscountSummary.totalOriginalAmount,
      totalDiscountAmount: bulkDiscountSummary.totalDiscountAmount,
      totalDiscountPercentage: bulkDiscountSummary.totalDiscountPercentage,
      itemsWithBulkDiscount: bulkDiscountSummary.itemsWithBulkDiscount,
      finalAmount: order.totalAmount,
      savings: bulkDiscountSummary.totalDiscountAmount,
    },
  };
};

/**
 * Record coupon usage after order creation
 * @param {string} orderId - Order ID
 * @param {Object} orderData - Order data with coupon information
 * @param {Object} requestInfo - Request information for audit trail
 * @returns {Object} Result of recording usage
 */
const recordOrderCouponUsage = async (orderId, orderData, requestInfo = {}) => {
  try {
    if (!orderData.coupon || !orderData.coupon.code) {
      return {
        success: true,
        message: 'No coupon to record'
      };
    }

    const result = await recordCouponUsage(
      orderData.coupon.code,
      orderData.buyer,
      orderId,
      orderData.coupon.discountAmount,
      orderData.totalAmount,
      requestInfo
    );

    return result;

  } catch (error) {
    console.error('❌ Error recording order coupon usage:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

module.exports = {
  processOrderWithBulkDiscounts,
  validateAndProcessOrder,
  createOrderWithBulkDiscounts,
  getOrderBulkDiscountSummary,
  recordOrderCouponUsage,
  mapCheckoutAddressToDetails,
  resolveAuthoritativeVariantPrice,
};
