// Centralized Pricing Validation System
// Provides comprehensive validation for all pricing-related operations

const mongoose = require('mongoose');

/**
 * Validation result structure
 */
class ValidationResult {
  constructor(isValid = true, errors = [], warnings = [], data = null) {
    this.isValid = isValid;
    this.errors = errors;
    this.warnings = warnings;
    this.data = data;
    this.timestamp = new Date();
  }

  addError(message, code = 'VALIDATION_ERROR', field = null) {
    this.errors.push({ message, code, field, timestamp: new Date() });
    this.isValid = false;
  }

  addWarning(message, code = 'VALIDATION_WARNING', field = null) {
    this.warnings.push({ message, code, field, timestamp: new Date() });
  }

  hasErrors() {
    return this.errors.length > 0;
  }

  hasWarnings() {
    return this.warnings.length > 0;
  }
}

/**
 * Product pricing validation rules
 */
const PRODUCT_PRICING_RULES = {
  MIN_PRICE: 0.01,
  MAX_PRICE: 1000000,
  MIN_SALE_PRICE: 0.01,
  MAX_DISCOUNT_PERCENTAGE: 90,
  MIN_STOCK: 0,
  MAX_STOCK: 1000000,
  MIN_WEIGHT: 0,
  MAX_WEIGHT: 1000,
  MIN_DIMENSIONS: 0,
  MAX_DIMENSIONS: 1000
};

/**
 * Cart validation rules
 */
const CART_VALIDATION_RULES = {
  MAX_ITEMS: 100,
  MAX_QUANTITY_PER_ITEM: 1000,
  MIN_QUANTITY: 1,
  MAX_CART_VALUE: 1000000,
  MIN_CART_VALUE: 0.01
};

/**
 * Coupon validation rules
 */
const COUPON_VALIDATION_RULES = {
  MIN_DISCOUNT_VALUE: 0.01,
  MAX_DISCOUNT_VALUE: 1000000,
  MIN_ORDER_AMOUNT: 0.01,
  MAX_ORDER_AMOUNT: 1000000,
  MIN_DISCOUNT_PERCENTAGE: 1,
  MAX_DISCOUNT_PERCENTAGE: 100
};

/**
 * Tax validation rules
 */
const TAX_VALIDATION_RULES = {
  MIN_TAX_RATE: 0,
  MAX_TAX_RATE: 50,
  MIN_TAX_AMOUNT: 0,
  MAX_TAX_AMOUNT: 1000000
};

/**
 * Commission validation rules
 */
const COMMISSION_VALIDATION_RULES = {
  MIN_COMMISSION_RATE: 0,
  MAX_COMMISSION_RATE: 100,
  MIN_COMMISSION_AMOUNT: 0,
  MAX_COMMISSION_AMOUNT: 1000000
};

/**
 * Shipping validation rules
 */
const SHIPPING_VALIDATION_RULES = {
  MIN_SHIPPING_COST: 0,
  MAX_SHIPPING_COST: 10000,
  MIN_FREE_SHIPPING_THRESHOLD: 0,
  MAX_FREE_SHIPPING_THRESHOLD: 1000000
};

/**
 * Validate product pricing data
 * @param {Object} product - Product object
 * @param {Object} options - Validation options
 * @returns {ValidationResult} Validation result
 */
function validateProductPricing(product, options = {}) {
  const result = new ValidationResult();

  if (!product) {
    result.addError('Product is required', 'PRODUCT_REQUIRED');
    return result;
  }

  // Validate regular price
  if (product.regularPrice !== undefined) {
    if (typeof product.regularPrice !== 'number' || isNaN(product.regularPrice)) {
      result.addError('Regular price must be a valid number', 'INVALID_REGULAR_PRICE', 'regularPrice');
    } else if (product.regularPrice < PRODUCT_PRICING_RULES.MIN_PRICE) {
      result.addError(`Regular price must be at least ₹${PRODUCT_PRICING_RULES.MIN_PRICE}`, 'PRICE_TOO_LOW', 'regularPrice');
    } else if (product.regularPrice > PRODUCT_PRICING_RULES.MAX_PRICE) {
      result.addError(`Regular price cannot exceed ₹${PRODUCT_PRICING_RULES.MAX_PRICE}`, 'PRICE_TOO_HIGH', 'regularPrice');
    }
  }

  // Validate sale price
  if (product.salePrice !== undefined) {
    if (typeof product.salePrice !== 'number' || isNaN(product.salePrice)) {
      result.addError('Sale price must be a valid number', 'INVALID_SALE_PRICE', 'salePrice');
    } else if (product.salePrice < PRODUCT_PRICING_RULES.MIN_SALE_PRICE) {
      result.addError(`Sale price must be at least ₹${PRODUCT_PRICING_RULES.MIN_SALE_PRICE}`, 'SALE_PRICE_TOO_LOW', 'salePrice');
    } else if (product.salePrice > PRODUCT_PRICING_RULES.MAX_PRICE) {
      result.addError(`Sale price cannot exceed ₹${PRODUCT_PRICING_RULES.MAX_PRICE}`, 'SALE_PRICE_TOO_HIGH', 'salePrice');
    }
  }

  // Validate price relationship
  if (product.regularPrice && product.salePrice) {
    if (product.salePrice > product.regularPrice) {
      result.addError('Sale price cannot be higher than regular price', 'SALE_PRICE_HIGHER_THAN_REGULAR', 'salePrice');
    }

    const discountPercentage = ((product.regularPrice - product.salePrice) / product.regularPrice) * 100;
    if (discountPercentage > PRODUCT_PRICING_RULES.MAX_DISCOUNT_PERCENTAGE) {
      result.addWarning(`Discount percentage (${discountPercentage.toFixed(2)}%) exceeds recommended maximum (${PRODUCT_PRICING_RULES.MAX_DISCOUNT_PERCENTAGE}%)`, 'HIGH_DISCOUNT_PERCENTAGE', 'salePrice');
    }
  }

  // Validate stock
  if (product.stock !== undefined) {
    if (typeof product.stock !== 'number' || isNaN(product.stock)) {
      result.addError('Stock must be a valid number', 'INVALID_STOCK', 'stock');
    } else if (product.stock < PRODUCT_PRICING_RULES.MIN_STOCK) {
      result.addError(`Stock cannot be negative`, 'NEGATIVE_STOCK', 'stock');
    } else if (product.stock > PRODUCT_PRICING_RULES.MAX_STOCK) {
      result.addError(`Stock cannot exceed ${PRODUCT_PRICING_RULES.MAX_STOCK}`, 'STOCK_TOO_HIGH', 'stock');
    }
  }

  // Validate weight
  if (product.weight !== undefined) {
    if (typeof product.weight !== 'number' || isNaN(product.weight)) {
      result.addError('Weight must be a valid number', 'INVALID_WEIGHT', 'weight');
    } else if (product.weight < PRODUCT_PRICING_RULES.MIN_WEIGHT) {
      result.addError('Weight cannot be negative', 'NEGATIVE_WEIGHT', 'weight');
    } else if (product.weight > PRODUCT_PRICING_RULES.MAX_WEIGHT) {
      result.addError(`Weight cannot exceed ${PRODUCT_PRICING_RULES.MAX_WEIGHT}kg`, 'WEIGHT_TOO_HIGH', 'weight');
    }
  }

  // Validate dimensions
  const dimensions = ['length', 'width', 'height'];
  dimensions.forEach(dim => {
    if (product[dim] !== undefined) {
      if (typeof product[dim] !== 'number' || isNaN(product[dim])) {
        result.addError(`${dim} must be a valid number`, `INVALID_${dim.toUpperCase()}`, dim);
      } else if (product[dim] < PRODUCT_PRICING_RULES.MIN_DIMENSIONS) {
        result.addError(`${dim} cannot be negative`, `NEGATIVE_${dim.toUpperCase()}`, dim);
      } else if (product[dim] > PRODUCT_PRICING_RULES.MAX_DIMENSIONS) {
        result.addError(`${dim} cannot exceed ${PRODUCT_PRICING_RULES.MAX_DIMENSIONS}cm`, `${dim.toUpperCase()}_TOO_HIGH`, dim);
      }
    }
  });

  // Validate tax rate
  if (product.taxRate !== undefined) {
    if (typeof product.taxRate !== 'number' || isNaN(product.taxRate)) {
      result.addError('Tax rate must be a valid number', 'INVALID_TAX_RATE', 'taxRate');
    } else if (product.taxRate < TAX_VALIDATION_RULES.MIN_TAX_RATE) {
      result.addError('Tax rate cannot be negative', 'NEGATIVE_TAX_RATE', 'taxRate');
    } else if (product.taxRate > TAX_VALIDATION_RULES.MAX_TAX_RATE) {
      result.addError(`Tax rate cannot exceed ${TAX_VALIDATION_RULES.MAX_TAX_RATE}%`, 'TAX_RATE_TOO_HIGH', 'taxRate');
    }
  }

  // Validate shipping charge
  if (product.shippingCharge !== undefined) {
    if (typeof product.shippingCharge !== 'number' || isNaN(product.shippingCharge)) {
      result.addError('Shipping charge must be a valid number', 'INVALID_SHIPPING_CHARGE', 'shippingCharge');
    } else if (product.shippingCharge < SHIPPING_VALIDATION_RULES.MIN_SHIPPING_COST) {
      result.addError('Shipping charge cannot be negative', 'NEGATIVE_SHIPPING_CHARGE', 'shippingCharge');
    } else if (product.shippingCharge > SHIPPING_VALIDATION_RULES.MAX_SHIPPING_COST) {
      result.addError(`Shipping charge cannot exceed ₹${SHIPPING_VALIDATION_RULES.MAX_SHIPPING_COST}`, 'SHIPPING_CHARGE_TOO_HIGH', 'shippingCharge');
    }
  }

  return result;
}

/**
 * True when `product` is an ID reference (string / ObjectId), not a priced document.
 * Checkout quotes send product IDs only; pricingEngine loads authoritative prices.
 */
function isProductIdReference(product) {
  if (product == null) return false;
  if (typeof product === 'string') return mongoose.Types.ObjectId.isValid(product);
  if (product instanceof mongoose.Types.ObjectId) return true;
  if (typeof product === 'object' && product._bsontype === 'ObjectId') return true;
  return false;
}

/**
 * Resolve unit price from a cart line for structural pre-checks only.
 * Aligns with pricingEngine: valid salePrice, else regularPrice, else legacy price.
 * When product is an ID-only reference, price is deferred to the pricing engine.
 * @returns {{ deferred: boolean, price: number|null }}
 */
function resolveCartItemUnitPriceForValidation(item) {
  if (item == null) {
    return { deferred: false, price: null };
  }

  if (typeof item.price === 'number' && !Number.isNaN(item.price)) {
    return { deferred: false, price: item.price };
  }

  const product = item.product;
  if (!product) {
    return { deferred: false, price: null };
  }

  if (isProductIdReference(product)) {
    return { deferred: true, price: null };
  }

  if (typeof product !== 'object') {
    return { deferred: false, price: null };
  }

  const hasPricingFields =
    product.salePrice !== undefined ||
    product.regularPrice !== undefined ||
    product.price !== undefined;

  // Populated shell without pricing (e.g. {_id}) — defer to pricing engine
  if (!hasPricingFields) {
    return { deferred: true, price: null };
  }

  const sale = Number(product.salePrice);
  if (Number.isFinite(sale) && sale > 0) {
    return { deferred: false, price: sale };
  }

  const regular = Number(product.regularPrice);
  if (Number.isFinite(regular) && regular > 0) {
    return { deferred: false, price: regular };
  }

  const legacy = Number(product.price);
  if (Number.isFinite(legacy)) {
    return { deferred: false, price: legacy };
  }

  return { deferred: false, price: 0 };
}

/**
 * Validate cart items
 * @param {Array} cartItems - Cart items array
 * @param {Object} options - Validation options
 * @returns {ValidationResult} Validation result
 */
function validateCartItems(cartItems, options = {}) {
  const result = new ValidationResult();

  if (!Array.isArray(cartItems)) {
    result.addError('Cart items must be an array', 'INVALID_CART_ITEMS');
    return result;
  }

  if (cartItems.length === 0) {
    result.addError('Cart cannot be empty', 'EMPTY_CART');
    return result;
  }

  if (cartItems.length > CART_VALIDATION_RULES.MAX_ITEMS) {
    result.addError(`Cart cannot contain more than ${CART_VALIDATION_RULES.MAX_ITEMS} items`, 'TOO_MANY_ITEMS');
  }

  let totalCartValue = 0;
  let hasDeferredPrices = false;

  cartItems.forEach((item, index) => {
    const itemPrefix = `items[${index}]`;

    // Validate item structure
    if (!item.product && (item.price === undefined || item.price === null)) {
      result.addError(`Item at index ${index} must have either product object or price`, 'MISSING_ITEM_PRICE', `${itemPrefix}.product`);
    }

    // Validate quantity
    const quantity = item.quantity || item.qty || 0;
    if (typeof quantity !== 'number' || isNaN(quantity)) {
      result.addError(`Item at index ${index} must have valid quantity`, 'INVALID_QUANTITY', `${itemPrefix}.quantity`);
    } else if (quantity < CART_VALIDATION_RULES.MIN_QUANTITY) {
      result.addError(`Item at index ${index} quantity must be at least ${CART_VALIDATION_RULES.MIN_QUANTITY}`, 'QUANTITY_TOO_LOW', `${itemPrefix}.quantity`);
    } else if (quantity > CART_VALIDATION_RULES.MAX_QUANTITY_PER_ITEM) {
      result.addError(`Item at index ${index} quantity cannot exceed ${CART_VALIDATION_RULES.MAX_QUANTITY_PER_ITEM}`, 'QUANTITY_TOO_HIGH', `${itemPrefix}.quantity`);
    }

    const resolved = resolveCartItemUnitPriceForValidation(item);

    if (resolved.deferred) {
      // Product ID only — authoritative unit price comes from Product DB in pricingEngine
      hasDeferredPrices = true;
      return;
    }

    const itemPrice = resolved.price;

    if (typeof itemPrice !== 'number' || isNaN(itemPrice)) {
      result.addError(`Item at index ${index} must have valid price`, 'INVALID_ITEM_PRICE', `${itemPrefix}.price`);
      return;
    }
    if (itemPrice < PRODUCT_PRICING_RULES.MIN_PRICE) {
      result.addError(`Item at index ${index} price must be at least ₹${PRODUCT_PRICING_RULES.MIN_PRICE}`, 'ITEM_PRICE_TOO_LOW', `${itemPrefix}.price`);
      return;
    }
    if (itemPrice > PRODUCT_PRICING_RULES.MAX_PRICE) {
      result.addError(`Item at index ${index} price cannot exceed ₹${PRODUCT_PRICING_RULES.MAX_PRICE}`, 'ITEM_PRICE_TOO_HIGH', `${itemPrefix}.price`);
      return;
    }

    const itemTotal = itemPrice * quantity;
    totalCartValue += itemTotal;

    if (itemTotal > CART_VALIDATION_RULES.MAX_CART_VALUE) {
      result.addError(`Item at index ${index} total value cannot exceed ₹${CART_VALIDATION_RULES.MAX_CART_VALUE}`, 'ITEM_TOTAL_TOO_HIGH', `${itemPrefix}.total`);
    }
  });

  // Client-supplied cart value bounds only when every line has a resolvable price.
  // ID-only checkout quotes defer totals to pricingEngine (server authority).
  if (!hasDeferredPrices) {
    if (totalCartValue < CART_VALIDATION_RULES.MIN_CART_VALUE) {
      result.addError(`Cart total must be at least ₹${CART_VALIDATION_RULES.MIN_CART_VALUE}`, 'CART_TOTAL_TOO_LOW');
    } else if (totalCartValue > CART_VALIDATION_RULES.MAX_CART_VALUE) {
      result.addError(`Cart total cannot exceed ₹${CART_VALIDATION_RULES.MAX_CART_VALUE}`, 'CART_TOTAL_TOO_HIGH');
    }
  }

  result.data = {
    totalCartValue,
    itemCount: cartItems.length,
    pricesDeferredToEngine: hasDeferredPrices,
  };
  return result;
}

/**
 * Validate coupon data
 * @param {Object} coupon - Coupon object
 * @param {Object} options - Validation options
 * @returns {ValidationResult} Validation result
 */
function validateCouponData(coupon, options = {}) {
  const result = new ValidationResult();

  if (!coupon) {
    result.addError('Coupon is required', 'COUPON_REQUIRED');
    return result;
  }

  // Validate coupon code
  if (!coupon.code || typeof coupon.code !== 'string') {
    result.addError('Coupon code is required and must be a string', 'INVALID_COUPON_CODE', 'code');
  } else if (coupon.code.length < 3) {
    result.addError('Coupon code must be at least 3 characters long', 'COUPON_CODE_TOO_SHORT', 'code');
  } else if (coupon.code.length > 50) {
    result.addError('Coupon code cannot exceed 50 characters', 'COUPON_CODE_TOO_LONG', 'code');
  }

  // Validate discount type
  const validDiscountTypes = ['percentage', 'fixed', 'shipping'];
  if (!coupon.discountType || !validDiscountTypes.includes(coupon.discountType)) {
    result.addError(`Discount type must be one of: ${validDiscountTypes.join(', ')}`, 'INVALID_DISCOUNT_TYPE', 'discountType');
  }

  // Validate discount value
  if (coupon.discountValue !== undefined) {
    if (typeof coupon.discountValue !== 'number' || isNaN(coupon.discountValue)) {
      result.addError('Discount value must be a valid number', 'INVALID_DISCOUNT_VALUE', 'discountValue');
    } else if (coupon.discountValue < COUPON_VALIDATION_RULES.MIN_DISCOUNT_VALUE) {
      result.addError(`Discount value must be at least ₹${COUPON_VALIDATION_RULES.MIN_DISCOUNT_VALUE}`, 'DISCOUNT_VALUE_TOO_LOW', 'discountValue');
    } else if (coupon.discountValue > COUPON_VALIDATION_RULES.MAX_DISCOUNT_VALUE) {
      result.addError(`Discount value cannot exceed ₹${COUPON_VALIDATION_RULES.MAX_DISCOUNT_VALUE}`, 'DISCOUNT_VALUE_TOO_HIGH', 'discountValue');
    }

    // Validate percentage discount
    if (coupon.discountType === 'percentage') {
      if (coupon.discountValue < COUPON_VALIDATION_RULES.MIN_DISCOUNT_PERCENTAGE) {
        result.addError(`Percentage discount must be at least ${COUPON_VALIDATION_RULES.MIN_DISCOUNT_PERCENTAGE}%`, 'DISCOUNT_PERCENTAGE_TOO_LOW', 'discountValue');
      } else if (coupon.discountValue > COUPON_VALIDATION_RULES.MAX_DISCOUNT_PERCENTAGE) {
        result.addError(`Percentage discount cannot exceed ${COUPON_VALIDATION_RULES.MAX_DISCOUNT_PERCENTAGE}%`, 'DISCOUNT_PERCENTAGE_TOO_HIGH', 'discountValue');
      }
    }
  }

  // Validate minimum order amount
  if (coupon.minOrder !== undefined) {
    if (typeof coupon.minOrder !== 'number' || isNaN(coupon.minOrder)) {
      result.addError('Minimum order amount must be a valid number', 'INVALID_MIN_ORDER', 'minOrder');
    } else if (coupon.minOrder < COUPON_VALIDATION_RULES.MIN_ORDER_AMOUNT) {
      result.addError(`Minimum order amount must be at least ₹${COUPON_VALIDATION_RULES.MIN_ORDER_AMOUNT}`, 'MIN_ORDER_TOO_LOW', 'minOrder');
    } else if (coupon.minOrder > COUPON_VALIDATION_RULES.MAX_ORDER_AMOUNT) {
      result.addError(`Minimum order amount cannot exceed ₹${COUPON_VALIDATION_RULES.MAX_ORDER_AMOUNT}`, 'MIN_ORDER_TOO_HIGH', 'minOrder');
    }
  }

  // Validate dates
  if (coupon.validFrom && coupon.validTo) {
    const fromDate = new Date(coupon.validFrom);
    const toDate = new Date(coupon.validTo);

    if (isNaN(fromDate.getTime())) {
      result.addError('Valid from date must be a valid date', 'INVALID_VALID_FROM_DATE', 'validFrom');
    }

    if (isNaN(toDate.getTime())) {
      result.addError('Valid to date must be a valid date', 'INVALID_VALID_TO_DATE', 'validTo');
    }

    if (fromDate >= toDate) {
      result.addError('Valid from date must be before valid to date', 'INVALID_DATE_RANGE', 'validFrom');
    }
  }

  return result;
}

/**
 * Validate commission data
 * @param {Object} commission - Commission object
 * @param {Object} options - Validation options
 * @returns {ValidationResult} Validation result
 */
function validateCommissionData(commission, options = {}) {
  const result = new ValidationResult();

  if (!commission) {
    result.addError('Commission is required', 'COMMISSION_REQUIRED');
    return result;
  }

  // Validate order amount
  if (commission.orderAmount !== undefined) {
    if (typeof commission.orderAmount !== 'number' || isNaN(commission.orderAmount)) {
      result.addError('Order amount must be a valid number', 'INVALID_ORDER_AMOUNT', 'orderAmount');
    } else if (commission.orderAmount < 0) {
      result.addError('Order amount cannot be negative', 'NEGATIVE_ORDER_AMOUNT', 'orderAmount');
    }
  }

  // Validate commission rate
  if (commission.commissionRate !== undefined) {
    if (typeof commission.commissionRate !== 'number' || isNaN(commission.commissionRate)) {
      result.addError('Commission rate must be a valid number', 'INVALID_COMMISSION_RATE', 'commissionRate');
    } else if (commission.commissionRate < COMMISSION_VALIDATION_RULES.MIN_COMMISSION_RATE) {
      result.addError('Commission rate cannot be negative', 'NEGATIVE_COMMISSION_RATE', 'commissionRate');
    } else if (commission.commissionRate > COMMISSION_VALIDATION_RULES.MAX_COMMISSION_RATE) {
      result.addError(`Commission rate cannot exceed ${COMMISSION_VALIDATION_RULES.MAX_COMMISSION_RATE}%`, 'COMMISSION_RATE_TOO_HIGH', 'commissionRate');
    }
  }

  // Validate commission amount
  if (commission.commissionAmount !== undefined) {
    if (typeof commission.commissionAmount !== 'number' || isNaN(commission.commissionAmount)) {
      result.addError('Commission amount must be a valid number', 'INVALID_COMMISSION_AMOUNT', 'commissionAmount');
    } else if (commission.commissionAmount < COMMISSION_VALIDATION_RULES.MIN_COMMISSION_AMOUNT) {
      result.addError('Commission amount cannot be negative', 'NEGATIVE_COMMISSION_AMOUNT', 'commissionAmount');
    } else if (commission.commissionAmount > COMMISSION_VALIDATION_RULES.MAX_COMMISSION_AMOUNT) {
      result.addError(`Commission amount cannot exceed ₹${COMMISSION_VALIDATION_RULES.MAX_COMMISSION_AMOUNT}`, 'COMMISSION_AMOUNT_TOO_HIGH', 'commissionAmount');
    }
  }

  // Validate commission calculation consistency
  if (commission.orderAmount && commission.commissionRate && commission.commissionAmount) {
    const expectedAmount = (commission.orderAmount * commission.commissionRate) / 100;
    const tolerance = 0.01; // Allow 1 paisa tolerance for rounding

    if (Math.abs(commission.commissionAmount - expectedAmount) > tolerance) {
      result.addError(`Commission amount (₹${commission.commissionAmount}) does not match calculated amount (₹${expectedAmount.toFixed(2)})`, 'COMMISSION_AMOUNT_MISMATCH', 'commissionAmount');
    }
  }

  return result;
}

/**
 * Validate pricing calculation result
 * @param {Object} pricing - Pricing calculation result
 * @param {Object} options - Validation options
 * @returns {ValidationResult} Validation result
 */
function validatePricingResult(pricing, options = {}) {
  const result = new ValidationResult();

  if (!pricing) {
    result.addError('Pricing result is required', 'PRICING_RESULT_REQUIRED');
    return result;
  }

  // Validate subtotal
  if (pricing.subtotal !== undefined) {
    if (typeof pricing.subtotal !== 'number' || isNaN(pricing.subtotal)) {
      result.addError('Subtotal must be a valid number', 'INVALID_SUBTOTAL', 'subtotal');
    } else if (pricing.subtotal < 0) {
      result.addError('Subtotal cannot be negative', 'NEGATIVE_SUBTOTAL', 'subtotal');
    }
  }

  // Validate discount
  if (pricing.discount && pricing.discount.total !== undefined) {
    if (typeof pricing.discount.total !== 'number' || isNaN(pricing.discount.total)) {
      result.addError('Discount total must be a valid number', 'INVALID_DISCOUNT_TOTAL', 'discount.total');
    } else if (pricing.discount.total < 0) {
      result.addError('Discount total cannot be negative', 'NEGATIVE_DISCOUNT_TOTAL', 'discount.total');
    } else {
      // Check against originalSubtotal if available (before bulk discounts)
      // Otherwise check against subtotal (for backward compatibility)
      const baseAmount = pricing.originalSubtotal !== undefined ? pricing.originalSubtotal : pricing.subtotal;
      if (baseAmount && pricing.discount.total > baseAmount) {
        result.addError('Discount cannot exceed subtotal', 'DISCOUNT_EXCEEDS_SUBTOTAL', 'discount.total');
      }
    }
  }

  // Validate tax
  if (pricing.tax && pricing.tax.amount !== undefined) {
    if (typeof pricing.tax.amount !== 'number' || isNaN(pricing.tax.amount)) {
      result.addError('Tax amount must be a valid number', 'INVALID_TAX_AMOUNT', 'tax.amount');
    } else if (pricing.tax.amount < 0) {
      result.addError('Tax amount cannot be negative', 'NEGATIVE_TAX_AMOUNT', 'tax.amount');
    }
  }

  // Validate shipping
  if (pricing.shipping && pricing.shipping.amount !== undefined) {
    if (typeof pricing.shipping.amount !== 'number' || isNaN(pricing.shipping.amount)) {
      result.addError('Shipping amount must be a valid number', 'INVALID_SHIPPING_AMOUNT', 'shipping.amount');
    } else if (pricing.shipping.amount < 0) {
      result.addError('Shipping amount cannot be negative', 'NEGATIVE_SHIPPING_AMOUNT', 'shipping.amount');
    }
  }

  // Validate total
  if (pricing.total !== undefined) {
    if (typeof pricing.total !== 'number' || isNaN(pricing.total)) {
      result.addError('Total must be a valid number', 'INVALID_TOTAL', 'total');
    } else if (pricing.total < 0) {
      result.addError('Total cannot be negative', 'NEGATIVE_TOTAL', 'total');
    }

    // Validate total calculation
    // Note: If originalSubtotal exists, bulk discount is already applied to subtotal
    // Formula: subtotal (after bulk) - couponDiscount + tax + shipping
    // NOT: subtotal - totalDiscount (because bulk is already in subtotal)
    if (pricing.subtotal !== undefined) {
      let calculatedTotal;

      // Determine tax to add - prefer taxAdded (exclusive tax only) 
      // fallback to amount (total tax) for backward compatibility
      const taxToAdd = (pricing.tax && pricing.tax.taxAdded !== undefined)
        ? pricing.tax.taxAdded
        : (pricing.tax?.amount || 0);

      if (pricing.originalSubtotal !== undefined) {
        // New format: subtotal already has bulk discount applied
        // Only subtract coupon discount, not bulk discount
        const couponDiscount = pricing.discount?.coupon || 0;
        calculatedTotal = (pricing.subtotal || 0) -
          couponDiscount +
          taxToAdd +
          (pricing.shipping?.amount || 0);
      } else {
        // Old format: subtotal is before all discounts
        // Subtract total discount
        calculatedTotal = (pricing.subtotal || 0) -
          (pricing.discount?.total || 0) +
          taxToAdd +
          (pricing.shipping?.amount || 0);
      }

      const tolerance = 0.01; // Allow 1 paisa tolerance for rounding
      if (Math.abs(pricing.total - calculatedTotal) > tolerance) {
        result.addError(`Total (₹${pricing.total}) does not match calculated total (₹${calculatedTotal.toFixed(2)})`, 'TOTAL_CALCULATION_MISMATCH', 'total');
      }
    }
  }

  return result;
}

/**
 * Detect pricing conflicts
 * @param {Object} pricingData - Pricing data to check for conflicts
 * @param {Object} options - Validation options
 * @returns {ValidationResult} Validation result with conflict detection
 */
function detectPricingConflicts(pricingData, options = {}) {
  const result = new ValidationResult();

  if (!pricingData) {
    result.addError('Pricing data is required', 'PRICING_DATA_REQUIRED');
    return result;
  }

  // Check for conflicting discount rules
  if (pricingData.coupons && Array.isArray(pricingData.coupons)) {
    const activeCoupons = pricingData.coupons.filter(coupon =>
      coupon.isActive &&
      (!coupon.validFrom || new Date(coupon.validFrom) <= new Date()) &&
      (!coupon.validTo || new Date(coupon.validTo) >= new Date())
    );

    // Check for overlapping coupon conditions
    for (let i = 0; i < activeCoupons.length; i++) {
      for (let j = i + 1; j < activeCoupons.length; j++) {
        const coupon1 = activeCoupons[i];
        const coupon2 = activeCoupons[j];

        // Check for same discount type and similar values
        if (coupon1.discountType === coupon2.discountType) {
          const valueDiff = Math.abs(coupon1.discountValue - coupon2.discountValue);
          if (valueDiff < 0.01) { // Less than 1 paisa difference
            result.addWarning(`Potential conflict: Coupons "${coupon1.code}" and "${coupon2.code}" have identical discount values`, 'COUPON_VALUE_CONFLICT');
          }
        }

        // Check for overlapping minimum order requirements
        if (coupon1.minOrder && coupon2.minOrder) {
          const orderDiff = Math.abs(coupon1.minOrder - coupon2.minOrder);
          if (orderDiff < 10) { // Less than ₹10 difference
            result.addWarning(`Potential conflict: Coupons "${coupon1.code}" and "${coupon2.code}" have similar minimum order requirements`, 'COUPON_MIN_ORDER_CONFLICT');
          }
        }
      }
    }
  }

  // Check for conflicting tax rates
  if (pricingData.products && Array.isArray(pricingData.products)) {
    const taxRates = pricingData.products
      .map(product => product.taxRate)
      .filter(rate => rate !== undefined && rate !== null)
      .sort((a, b) => a - b);

    if (taxRates.length > 1) {
      const uniqueRates = [...new Set(taxRates)];
      if (uniqueRates.length < taxRates.length) {
        result.addWarning('Multiple products have the same tax rate - consider standardizing', 'TAX_RATE_DUPLICATION');
      }

      const rateRange = taxRates[taxRates.length - 1] - taxRates[0];
      if (rateRange > 20) { // More than 20% difference
        result.addWarning('Wide variation in tax rates across products - consider standardizing', 'TAX_RATE_VARIATION');
      }
    }
  }

  // Check for conflicting shipping costs
  if (pricingData.shipping && Array.isArray(pricingData.shipping)) {
    const shippingCosts = pricingData.shipping
      .map(method => method.cost)
      .filter(cost => cost !== undefined && cost !== null)
      .sort((a, b) => a - b);

    if (shippingCosts.length > 1) {
      const costRange = shippingCosts[shippingCosts.length - 1] - shippingCosts[0];
      if (costRange > 500) { // More than ₹500 difference
        result.addWarning('Wide variation in shipping costs - consider standardizing', 'SHIPPING_COST_VARIATION');
      }
    }
  }

  return result;
}

/**
 * Validate pricing data integrity
 * @param {Object} pricingData - Complete pricing data
 * @param {Object} options - Validation options
 * @returns {ValidationResult} Validation result
 */
function validatePricingDataIntegrity(pricingData, options = {}) {
  const result = new ValidationResult();

  if (!pricingData) {
    result.addError('Pricing data is required', 'PRICING_DATA_REQUIRED');
    return result;
  }

  // Validate product pricing integrity
  if (pricingData.products && Array.isArray(pricingData.products)) {
    pricingData.products.forEach((product, index) => {
      const productValidation = validateProductPricing(product);
      if (productValidation.hasErrors()) {
        productValidation.errors.forEach(error => {
          result.addError(`Product ${index}: ${error.message}`, error.code, `products[${index}].${error.field}`);
        });
      }
      if (productValidation.hasWarnings()) {
        productValidation.warnings.forEach(warning => {
          result.addWarning(`Product ${index}: ${warning.message}`, warning.code, `products[${index}].${warning.field}`);
        });
      }
    });
  }

  // Validate cart integrity
  if (pricingData.cartItems && Array.isArray(pricingData.cartItems)) {
    const cartValidation = validateCartItems(pricingData.cartItems);
    if (cartValidation.hasErrors()) {
      cartValidation.errors.forEach(error => {
        result.addError(`Cart: ${error.message}`, error.code, error.field);
      });
    }
    if (cartValidation.hasWarnings()) {
      cartValidation.warnings.forEach(warning => {
        result.addWarning(`Cart: ${warning.message}`, warning.code, warning.field);
      });
    }
  }

  // Validate coupon integrity
  if (pricingData.coupons && Array.isArray(pricingData.coupons)) {
    pricingData.coupons.forEach((coupon, index) => {
      const couponValidation = validateCouponData(coupon);
      if (couponValidation.hasErrors()) {
        couponValidation.errors.forEach(error => {
          result.addError(`Coupon ${index}: ${error.message}`, error.code, `coupons[${index}].${error.field}`);
        });
      }
    });
  }

  // Validate commission integrity
  if (pricingData.commissions && Array.isArray(pricingData.commissions)) {
    pricingData.commissions.forEach((commission, index) => {
      const commissionValidation = validateCommissionData(commission);
      if (commissionValidation.hasErrors()) {
        commissionValidation.errors.forEach(error => {
          result.addError(`Commission ${index}: ${error.message}`, error.code, `commissions[${index}].${error.field}`);
        });
      }
    });
  }

  // Detect conflicts
  const conflictDetection = detectPricingConflicts(pricingData);
  if (conflictDetection.hasWarnings()) {
    conflictDetection.warnings.forEach(warning => {
      result.addWarning(warning.message, warning.code, warning.field);
    });
  }

  return result;
}

module.exports = {
  ValidationResult,
  validateProductPricing,
  validateCartItems,
  resolveCartItemUnitPriceForValidation,
  isProductIdReference,
  validateCouponData,
  validateCommissionData,
  validatePricingResult,
  detectPricingConflicts,
  validatePricingDataIntegrity,
  // Export validation rules for external use
  PRODUCT_PRICING_RULES,
  CART_VALIDATION_RULES,
  COUPON_VALIDATION_RULES,
  TAX_VALIDATION_RULES,
  COMMISSION_VALIDATION_RULES,
  SHIPPING_VALIDATION_RULES
};
