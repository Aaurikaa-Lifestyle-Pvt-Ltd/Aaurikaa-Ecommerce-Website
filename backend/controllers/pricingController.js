// Pricing Controller - Centralized pricing calculation APIs
// Provides standardized pricing calculation endpoints

const { calculatePricing, validateCoupon, calculateProductPricing } = require('../utils/pricingEngine');
const { asyncHandler, sendErrorResponse, sendSuccessResponse, ERROR_MESSAGES, ERROR_CODES, HTTP_STATUS } = require('../utils/errorHandler');
const { validateCartItems, validatePricingResult, validateProductPricing } = require('../utils/pricingValidator');
const gstEngineService = require('../services/gstEngineService');
const { calculateShipping, getAvailableShippingMethods, ShippingEngineError } = require('../services/shippingEngineService');
const { getTaxRatesForLocation } = require('../utils/taxShippingEngine'); // Keeping for now if still needed for UI dropdowns
// Note: checkFreeShippingRules was removed - logic integrated into calculateShipping

function isShippingEngineFailure(error) {
  return (
    error instanceof ShippingEngineError ||
    error?.name === 'ShippingEngineError' ||
    Boolean(error?.code && String(error.code).includes('WEIGHT_CLASS')) ||
    Boolean(error?.code && ['ZONE_UNRESOLVED', 'FLAT_RULE_MISSING', 'PRODUCT_NOT_FOUND'].includes(error.code))
  );
}

function shippingEngineClientMessage(error) {
  const raw = error?.message || 'Failed to calculate shipping';
  return raw.replace(/^Pricing calculation failed:\s*/i, '');
}
/**
 * Calculate complete pricing for cart items
 * POST /api/pricing/calculate
 */
exports.calculateCartPricing = asyncHandler(async (req, res) => {
  try {
    const { cartItems, couponCode, shippingAddress, billingAddress, options } = req.body;

    // Validate cart items using centralized validation
    const cartValidation = validateCartItems(cartItems);
    if (cartValidation.hasErrors()) {
      const errorMessages = cartValidation.errors.map(error => error.message);
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        errorMessages.join('; '),
        ERROR_CODES.VALIDATION_REQUIRED_FIELDS,
        { validationErrors: cartValidation.errors }
      );
    }

    // Log warnings if any
    if (cartValidation.hasWarnings()) {
      console.warn('⚠️ Cart validation warnings:', cartValidation.warnings);
    }

    // Calculate pricing
    const pricing = await calculatePricing({
      cartItems,
      couponCode,
      shippingAddress,
      billingAddress,
      options
    });

    // Validate pricing result
    const pricingValidation = validatePricingResult(pricing);
    if (pricingValidation.hasErrors()) {
      console.error('❌ Pricing result validation failed:', pricingValidation.errors);
      return sendErrorResponse(
        res,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        "Pricing calculation produced invalid result",
        ERROR_CODES.INTERNAL_ERROR,
        { validationErrors: pricingValidation.errors }
      );
    }

    // Log warnings if any
    if (pricingValidation.hasWarnings()) {
      console.warn('⚠️ Pricing result warnings:', pricingValidation.warnings);
    }

    return sendSuccessResponse(
      res,
      HTTP_STATUS.OK,
      "Pricing calculated successfully",
      pricing
    );

  } catch (error) {
    console.error('❌ Cart pricing calculation error:', error);
    if (isShippingEngineFailure(error)) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        shippingEngineClientMessage(error),
        ERROR_CODES.VALIDATION_REQUIRED_FIELDS,
        { error: error.message, code: error.code || 'SHIPPING_ENGINE_ERROR' }
      );
    }
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      shippingEngineClientMessage(error) || "Failed to calculate pricing",
      ERROR_CODES.INTERNAL_ERROR,
      { error: error.message }
    );
  }
});

/**
 * Validate coupon code
 * POST /api/pricing/validate-coupon
 */
exports.validateCouponCode = asyncHandler(async (req, res) => {
  try {
    const { couponCode, cartTotal } = req.body;

    // Validate required fields
    if (!couponCode) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        "Coupon code is required",
        ERROR_CODES.VALIDATION_REQUIRED_FIELDS
      );
    }

    if (typeof cartTotal !== 'number' || cartTotal < 0) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        "Valid cart total is required",
        ERROR_CODES.VALIDATION_REQUIRED_FIELDS
      );
    }

    // Validate coupon
    const validation = await validateCoupon(couponCode, cartTotal);

    return sendSuccessResponse(
      res,
      HTTP_STATUS.OK,
      validation.message,
      {
        valid: validation.valid,
        coupon: validation.coupon || null
      }
    );

  } catch (error) {
    console.error('❌ Coupon validation error:', error);
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      "Failed to validate coupon",
      ERROR_CODES.INTERNAL_ERROR,
      { error: error.message }
    );
  }
});

/**
 * Calculate pricing for a single product
 * POST /api/pricing/product
 */
exports.calculateProductPricing = asyncHandler(async (req, res) => {
  try {
    const { product, quantity, options } = req.body;

    // Validate product using centralized validation
    const productValidation = validateProductPricing(product);
    if (productValidation.hasErrors()) {
      const errorMessages = productValidation.errors.map(error => error.message);
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        errorMessages.join('; '),
        ERROR_CODES.VALIDATION_REQUIRED_FIELDS,
        { validationErrors: productValidation.errors }
      );
    }

    // Validate quantity
    if (typeof quantity !== 'number' || quantity <= 0) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        "Valid quantity is required",
        ERROR_CODES.VALIDATION_REQUIRED_FIELDS
      );
    }

    // Log warnings if any
    if (productValidation.hasWarnings()) {
      console.warn('⚠️ Product validation warnings:', productValidation.warnings);
    }

    // Calculate product pricing
    const pricing = calculateProductPricing(product, quantity, options);

    return sendSuccessResponse(
      res,
      HTTP_STATUS.OK,
      "Product pricing calculated successfully",
      pricing
    );

  } catch (error) {
    console.error('❌ Product pricing calculation error:', error);
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      "Failed to calculate product pricing",
      ERROR_CODES.INTERNAL_ERROR,
      { error: error.message }
    );
  }
});

/**
 * Get pricing breakdown for order items
 * POST /api/pricing/order-breakdown
 */
exports.calculateOrderBreakdown = asyncHandler(async (req, res) => {
  try {
    const { orderItems, couponCode, shippingAddress, options } = req.body;

    // Validate required fields
    if (!orderItems || !Array.isArray(orderItems)) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        "Order items are required and must be an array",
        ERROR_CODES.VALIDATION_REQUIRED_FIELDS
      );
    }

    // Convert order items to cart format for pricing calculation
    const cartItems = orderItems.map(item => ({
      product: item.product,
      quantity: item.quantity,
      price: item.price
    }));

    // Calculate pricing
    const pricing = await calculatePricing({
      cartItems,
      couponCode,
      shippingAddress,
      options
    });

    // Add order-specific metadata
    const orderBreakdown = {
      ...pricing,
      metadata: {
        ...pricing.metadata,
        orderItemCount: orderItems.length,
        calculatedFor: 'order'
      }
    };

    return sendSuccessResponse(
      res,
      HTTP_STATUS.OK,
      "Order pricing breakdown calculated successfully",
      orderBreakdown
    );

  } catch (error) {
    console.error('❌ Order breakdown calculation error:', error);
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      "Failed to calculate order breakdown",
      ERROR_CODES.INTERNAL_ERROR,
      { error: error.message }
    );
  }
});

/**
 * Calculate tax for a given amount and location
 * POST /api/pricing/calculate-tax
 */
exports.calculateTax = asyncHandler(async (req, res) => {
  try {
    const { amount, shippingAddress, options } = req.body;

    // Validate required fields
    if (typeof amount !== 'number' || amount < 0) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        "Valid amount is required",
        ERROR_CODES.VALIDATION_REQUIRED_FIELDS
      );
    }

    // Calculate tax using NEW GST engine
    // Since this endpoint only takes an amount, we treat it as a single line item
    const taxResult = await gstEngineService.calculateGST({
      items: [{
        price: amount,
        quantity: 1,
        taxIncluded: options.taxIncluded || false,
        taxRate: options.taxRate // Optional override
      }],
      shippingCharge: 0,
      shippingAddress
    });

    return sendSuccessResponse(
      res,
      HTTP_STATUS.OK,
      "Tax calculated successfully",
      {
        amount: taxResult.totalTax,
        rate: taxResult.taxBreakdown.items[0].taxRate,
        cgst: taxResult.cgst,
        sgst: taxResult.sgst,
        ugst: taxResult.ugst,
        breakdown: taxResult
      }
    );

  } catch (error) {
    console.error('❌ Tax calculation error:', error);
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      "Failed to calculate tax",
      ERROR_CODES.INTERNAL_ERROR,
      { error: error.message }
    );
  }
});

/**
 * Calculate shipping cost for cart items and address
 * POST /api/pricing/calculate-shipping
 */
exports.calculateShippingCost = asyncHandler(async (req, res) => {
  try {
    const { cartItems, shippingAddress, couponCode, options } = req.body;

    // Validate required fields
    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        "Cart items are required and must be an array",
        ERROR_CODES.VALIDATION_REQUIRED_FIELDS
      );
    }

    // Calculate shipping
    const shippingResult = await calculateShipping({
      cartItems,
      shippingAddress,
      couponCode,
      options
    });

    return sendSuccessResponse(
      res,
      HTTP_STATUS.OK,
      "Shipping cost calculated successfully",
      shippingResult
    );

  } catch (error) {
    console.error('❌ Shipping calculation error:', error);
    if (isShippingEngineFailure(error)) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        shippingEngineClientMessage(error),
        ERROR_CODES.VALIDATION_REQUIRED_FIELDS,
        { error: error.message, code: error.code || 'SHIPPING_ENGINE_ERROR' }
      );
    }
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      "Failed to calculate shipping cost",
      ERROR_CODES.INTERNAL_ERROR,
      { error: error.message }
    );
  }
});

/**
 * Get available shipping methods for an address
 * POST /api/pricing/shipping-methods
 */
exports.getShippingMethods = asyncHandler(async (req, res) => {
  try {
    const { shippingAddress } = req.body;

    // Get available shipping methods
    const shippingMethods = await getAvailableShippingMethods(shippingAddress);

    return sendSuccessResponse(
      res,
      HTTP_STATUS.OK,
      "Shipping methods retrieved successfully",
      shippingMethods
    );

  } catch (error) {
    console.error('❌ Error getting shipping methods:', error);
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      "Failed to get shipping methods",
      ERROR_CODES.INTERNAL_ERROR,
      { error: error.message }
    );
  }
});

/**
 * Get tax rates for a location
 * POST /api/pricing/tax-rates
 */
exports.getTaxRates = asyncHandler(async (req, res) => {
  try {
    const { shippingAddress } = req.body;

    // Get tax rates for location
    const taxRates = await getTaxRatesForLocation(shippingAddress);

    return sendSuccessResponse(
      res,
      HTTP_STATUS.OK,
      "Tax rates retrieved successfully",
      taxRates
    );

  } catch (error) {
    console.error('❌ Error getting tax rates:', error);
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      "Failed to get tax rates",
      ERROR_CODES.INTERNAL_ERROR,
      { error: error.message }
    );
  }
});

/**
 * Health check for pricing engine
 * GET /api/pricing/health
 */
exports.pricingHealthCheck = asyncHandler(async (req, res) => {
  try {
    // Test basic pricing calculation
    const testPricing = await calculatePricing({
      cartItems: [{
        product: { price: 100 },
        quantity: 1
      }],
      couponCode: null,
      shippingAddress: null,
      options: {}
    });

    return sendSuccessResponse(
      res,
      HTTP_STATUS.OK,
      "Pricing engine is healthy",
      {
        status: 'healthy',
        timestamp: new Date(),
        testCalculation: {
          subtotal: testPricing.subtotal,
          total: testPricing.total
        }
      }
    );

  } catch (error) {
    console.error('❌ Pricing health check error:', error);
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      "Pricing engine health check failed",
      ERROR_CODES.INTERNAL_ERROR,
      { error: error.message }
    );
  }
});
