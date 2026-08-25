// Tests for Centralized Pricing Validation System

const {
  ValidationResult,
  validateProductPricing,
  validateCartItems,
  validateCouponData,
  validateCommissionData,
  validatePricingResult,
  detectPricingConflicts,
  validatePricingDataIntegrity,
  PRODUCT_PRICING_RULES,
  CART_VALIDATION_RULES,
  COUPON_VALIDATION_RULES,
  TAX_VALIDATION_RULES,
  COMMISSION_VALIDATION_RULES,
  SHIPPING_VALIDATION_RULES
} = require('../../utils/pricingValidator');

describe('Pricing Validator', () => {
  describe('ValidationResult', () => {
    test('should create valid result by default', () => {
      const result = new ValidationResult();
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.data).toBeNull();
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    test('should add errors correctly', () => {
      const result = new ValidationResult();
      result.addError('Test error', 'TEST_ERROR', 'testField');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        message: 'Test error',
        code: 'TEST_ERROR',
        field: 'testField',
        timestamp: expect.any(Date)
      });
    });

    test('should add warnings correctly', () => {
      const result = new ValidationResult();
      result.addWarning('Test warning', 'TEST_WARNING', 'testField');
      
      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toEqual({
        message: 'Test warning',
        code: 'TEST_WARNING',
        field: 'testField',
        timestamp: expect.any(Date)
      });
    });

    test('should check for errors and warnings correctly', () => {
      const result = new ValidationResult();
      expect(result.hasErrors()).toBe(false);
      expect(result.hasWarnings()).toBe(false);
      
      result.addError('Error');
      result.addWarning('Warning');
      
      expect(result.hasErrors()).toBe(true);
      expect(result.hasWarnings()).toBe(true);
    });
  });

  describe('validateProductPricing', () => {
    test('should validate valid product pricing', () => {
      const product = {
        regularPrice: 100,
        salePrice: 80,
        stock: 50,
        weight: 1.5,
        length: 10,
        width: 5,
        height: 3,
        taxRate: 5,
        shippingCharge: 20
      };

      const result = validateProductPricing(product);
      expect(result.isValid).toBe(true);
      expect(result.hasErrors()).toBe(false);
    });

    test('should reject missing product', () => {
      const result = validateProductPricing(null);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Product is required');
    });

    test('should validate regular price', () => {
      const product = { regularPrice: -10 };
      const result = validateProductPricing(product);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('Regular price must be at least');
    });

    test('should validate sale price', () => {
      const product = { salePrice: 'invalid' };
      const result = validateProductPricing(product);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Sale price must be a valid number');
    });

    test('should validate price relationship', () => {
      const product = { regularPrice: 100, salePrice: 120 };
      const result = validateProductPricing(product);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Sale price cannot be higher than regular price');
    });

    test('should warn about high discount percentage', () => {
      const product = { regularPrice: 100, salePrice: 5 };
      const result = validateProductPricing(product);
      expect(result.isValid).toBe(true);
      expect(result.hasWarnings()).toBe(true);
      expect(result.warnings[0].message).toContain('Discount percentage');
    });

    test('should validate stock', () => {
      const product = { stock: -5 };
      const result = validateProductPricing(product);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Stock cannot be negative');
    });

    test('should validate weight', () => {
      const product = { weight: 'invalid' };
      const result = validateProductPricing(product);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Weight must be a valid number');
    });

    test('should validate dimensions', () => {
      const product = { length: -5 };
      const result = validateProductPricing(product);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('length cannot be negative');
    });

    test('should validate tax rate', () => {
      const product = { taxRate: 150 };
      const result = validateProductPricing(product);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('Tax rate cannot exceed');
    });

    test('should validate shipping charge', () => {
      const product = { shippingCharge: -10 };
      const result = validateProductPricing(product);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Shipping charge cannot be negative');
    });
  });

  describe('validateCartItems', () => {
    test('should validate valid cart items', () => {
      const cartItems = [
        { product: { price: 100 }, quantity: 2 },
        { product: { salePrice: 80 }, quantity: 1 }
      ];

      const result = validateCartItems(cartItems);
      expect(result.isValid).toBe(true);
      expect(result.data.totalCartValue).toBe(280);
      expect(result.data.itemCount).toBe(2);
    });

    test('should reject non-array input', () => {
      const result = validateCartItems('invalid');
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Cart items must be an array');
    });

    test('should reject empty cart', () => {
      const result = validateCartItems([]);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Cart cannot be empty');
    });

    test('should reject too many items', () => {
      const cartItems = Array(101).fill({ product: { price: 100 }, quantity: 1 });
      const result = validateCartItems(cartItems);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('Cart cannot contain more than');
    });

    test('should validate item structure', () => {
      const cartItems = [{ quantity: 1 }]; // Missing product and price
      const result = validateCartItems(cartItems);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('must have either product object or price');
    });

    test('should validate quantity', () => {
      const cartItems = [{ product: { price: 100 }, quantity: 0 }];
      const result = validateCartItems(cartItems);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('quantity must be at least');
    });

    test('should validate item price', () => {
      const cartItems = [{ product: { price: -10 }, quantity: 1 }];
      const result = validateCartItems(cartItems);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('price must be at least');
    });

    test('should handle different quantity field names', () => {
      const cartItems = [{ product: { price: 100 }, qty: 2 }];
      const result = validateCartItems(cartItems);
      expect(result.isValid).toBe(true);
    });

    test('should validate total cart value', () => {
      const cartItems = [{ product: { price: 0.001 }, quantity: 1 }];
      const result = validateCartItems(cartItems);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('price must be at least');
    });

    test('should accept product ID-only lines (checkout quote shape)', () => {
      const cartItems = [
        { product: '507f1f77bcf86cd799439011', quantity: 1 },
      ];
      const result = validateCartItems(cartItems);
      expect(result.isValid).toBe(true);
      expect(result.data.pricesDeferredToEngine).toBe(true);
    });

    test('should use regularPrice when salePrice is missing (Emerald Crest shape)', () => {
      const cartItems = [
        { product: { regularPrice: 4190, name: 'Emerald Crest Statement Ring' }, quantity: 1 },
      ];
      const result = validateCartItems(cartItems);
      expect(result.isValid).toBe(true);
      expect(result.data.totalCartValue).toBe(4190);
    });

    test('should prefer valid salePrice over regularPrice', () => {
      const cartItems = [
        { product: { regularPrice: 4190, salePrice: 3990 }, quantity: 1 },
      ];
      const result = validateCartItems(cartItems);
      expect(result.isValid).toBe(true);
      expect(result.data.totalCartValue).toBe(3990);
    });

    test('should fall back to regularPrice when salePrice is zero', () => {
      const cartItems = [
        { product: { regularPrice: 4190, salePrice: 0 }, quantity: 1 },
      ];
      const result = validateCartItems(cartItems);
      expect(result.isValid).toBe(true);
      expect(result.data.totalCartValue).toBe(4190);
    });
  });

  describe('validateCouponData', () => {
    test('should validate valid coupon data', () => {
      const coupon = {
        code: 'TEST10',
        discountType: 'percentage',
        discountValue: 10,
        minOrder: 100,
        validFrom: new Date(),
        validTo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      };

      const result = validateCouponData(coupon);
      expect(result.isValid).toBe(true);
    });

    test('should reject missing coupon', () => {
      const result = validateCouponData(null);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Coupon is required');
    });

    test('should validate coupon code', () => {
      const coupon = { code: 'AB' }; // Too short
      const result = validateCouponData(coupon);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('Coupon code must be at least 3 characters');
    });

    test('should validate discount type', () => {
      const coupon = { code: 'TEST', discountType: 'invalid' };
      const result = validateCouponData(coupon);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('Discount type must be one of');
    });

    test('should validate discount value', () => {
      const coupon = { code: 'TEST', discountType: 'percentage', discountValue: -10 };
      const result = validateCouponData(coupon);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('Discount value must be at least');
    });

    test('should validate percentage discount range', () => {
      const coupon = { code: 'TEST', discountType: 'percentage', discountValue: 150 };
      const result = validateCouponData(coupon);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('Percentage discount cannot exceed');
    });

    test('should validate minimum order amount', () => {
      const coupon = { code: 'TEST', discountType: 'percentage', discountValue: 10, minOrder: -50 };
      const result = validateCouponData(coupon);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('Minimum order amount must be at least');
    });

    test('should validate date range', () => {
      const coupon = {
        code: 'TEST',
        discountType: 'percentage',
        discountValue: 10,
        validFrom: new Date('2024-12-31'),
        validTo: new Date('2024-01-01')
      };
      const result = validateCouponData(coupon);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('Valid from date must be before valid to date');
    });
  });

  describe('validateCommissionData', () => {
    test('should validate valid commission data', () => {
      const commission = {
        orderAmount: 1000,
        commissionRate: 10,
        commissionAmount: 100
      };

      const result = validateCommissionData(commission);
      expect(result.isValid).toBe(true);
    });

    test('should reject missing commission', () => {
      const result = validateCommissionData(null);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Commission is required');
    });

    test('should validate order amount', () => {
      const commission = { orderAmount: -100 };
      const result = validateCommissionData(commission);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Order amount cannot be negative');
    });

    test('should validate commission rate', () => {
      const commission = { commissionRate: 150 };
      const result = validateCommissionData(commission);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('Commission rate cannot exceed');
    });

    test('should validate commission amount', () => {
      const commission = { commissionAmount: -50 };
      const result = validateCommissionData(commission);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Commission amount cannot be negative');
    });

    test('should validate commission calculation consistency', () => {
      const commission = {
        orderAmount: 1000,
        commissionRate: 10,
        commissionAmount: 150 // Should be 100
      };
      const result = validateCommissionData(commission);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('Commission amount (₹150) does not match calculated amount');
    });
  });

  describe('validatePricingResult', () => {
    test('should validate valid pricing result', () => {
      const pricing = {
        subtotal: 100,
        discount: { total: 10 },
        tax: { amount: 5 },
        shipping: { amount: 20 },
        total: 115
      };

      const result = validatePricingResult(pricing);
      expect(result.isValid).toBe(true);
    });

    test('should reject missing pricing result', () => {
      const result = validatePricingResult(null);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Pricing result is required');
    });

    test('should validate subtotal', () => {
      const pricing = { subtotal: -50 };
      const result = validatePricingResult(pricing);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Subtotal cannot be negative');
    });

    test('should validate discount', () => {
      const pricing = { subtotal: 100, discount: { total: 150 } };
      const result = validatePricingResult(pricing);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Discount cannot exceed subtotal');
    });

    test('should validate tax amount', () => {
      const pricing = { tax: { amount: -10 } };
      const result = validatePricingResult(pricing);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Tax amount cannot be negative');
    });

    test('should validate shipping amount', () => {
      const pricing = { shipping: { amount: -5 } };
      const result = validatePricingResult(pricing);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Shipping amount cannot be negative');
    });

    test('should validate total calculation', () => {
      const pricing = {
        subtotal: 100,
        discount: { total: 10 },
        tax: { amount: 5 },
        shipping: { amount: 20 },
        total: 200 // Should be 115
      };
      const result = validatePricingResult(pricing);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('Total (₹200) does not match calculated total');
    });
  });

  describe('detectPricingConflicts', () => {
    test('should detect coupon value conflicts', () => {
      const pricingData = {
        coupons: [
          { code: 'COUPON1', discountType: 'percentage', discountValue: 10, isActive: true },
          { code: 'COUPON2', discountType: 'percentage', discountValue: 10, isActive: true }
        ]
      };

      const result = detectPricingConflicts(pricingData);
      expect(result.hasWarnings()).toBe(true);
      expect(result.warnings[0].message).toContain('Potential conflict');
    });

    test('should detect coupon minimum order conflicts', () => {
      const pricingData = {
        coupons: [
          { code: 'COUPON1', minOrder: 100, isActive: true },
          { code: 'COUPON2', minOrder: 105, isActive: true }
        ]
      };

      const result = detectPricingConflicts(pricingData);
      expect(result.hasWarnings()).toBe(true);
      expect(result.warnings[0].message).toContain('similar minimum order requirements');
    });

    test('should detect tax rate variations', () => {
      const pricingData = {
        products: [
          { taxRate: 5 },
          { taxRate: 30 } // 25% difference, should trigger warning
        ]
      };

      const result = detectPricingConflicts(pricingData);
      expect(result.hasWarnings()).toBe(true);
      expect(result.warnings[0].message).toContain('Wide variation in tax rates');
    });

    test('should detect shipping cost variations', () => {
      const pricingData = {
        shipping: [
          { cost: 50 },
          { cost: 600 }
        ]
      };

      const result = detectPricingConflicts(pricingData);
      expect(result.hasWarnings()).toBe(true);
      expect(result.warnings[0].message).toContain('Wide variation in shipping costs');
    });

    test('should handle missing pricing data', () => {
      const result = detectPricingConflicts(null);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Pricing data is required');
    });
  });

  describe('validatePricingDataIntegrity', () => {
    test('should validate complete pricing data', () => {
      const pricingData = {
        products: [
          { regularPrice: 100, salePrice: 80, stock: 50 }
        ],
        cartItems: [
          { product: { price: 100 }, quantity: 2 }
        ],
        coupons: [
          { code: 'TEST10', discountType: 'percentage', discountValue: 10 }
        ],
        commissions: [
          { orderAmount: 1000, commissionRate: 10, commissionAmount: 100 }
        ]
      };

      const result = validatePricingDataIntegrity(pricingData);
      expect(result.isValid).toBe(true);
    });

    test('should aggregate validation errors from all components', () => {
      const pricingData = {
        products: [
          { regularPrice: -100 } // Invalid price
        ],
        cartItems: [
          { quantity: 0 } // Invalid quantity
        ],
        coupons: [
          { code: 'AB' } // Invalid code
        ]
      };

      const result = validatePricingDataIntegrity(pricingData);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should handle missing pricing data', () => {
      const result = validatePricingDataIntegrity(null);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Pricing data is required');
    });
  });

  describe('Validation Rules Constants', () => {
    test('should export validation rules', () => {
      expect(PRODUCT_PRICING_RULES).toBeDefined();
      expect(CART_VALIDATION_RULES).toBeDefined();
      expect(COUPON_VALIDATION_RULES).toBeDefined();
      expect(TAX_VALIDATION_RULES).toBeDefined();
      expect(COMMISSION_VALIDATION_RULES).toBeDefined();
      expect(SHIPPING_VALIDATION_RULES).toBeDefined();
    });

    test('should have reasonable rule values', () => {
      expect(PRODUCT_PRICING_RULES.MIN_PRICE).toBeGreaterThan(0);
      expect(PRODUCT_PRICING_RULES.MAX_PRICE).toBeGreaterThan(PRODUCT_PRICING_RULES.MIN_PRICE);
      expect(CART_VALIDATION_RULES.MAX_ITEMS).toBeGreaterThan(0);
      expect(COUPON_VALIDATION_RULES.MAX_DISCOUNT_PERCENTAGE).toBeLessThanOrEqual(100);
      expect(TAX_VALIDATION_RULES.MAX_TAX_RATE).toBeLessThanOrEqual(100);
      expect(COMMISSION_VALIDATION_RULES.MAX_COMMISSION_RATE).toBeLessThanOrEqual(100);
    });
  });
});
