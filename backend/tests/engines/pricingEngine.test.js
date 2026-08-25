// Tests for Unified Pricing Calculation Engine

const {
  calculatePricing,
  calculateSubtotal,
  calculateDiscounts,
  calculateTax,
  validateCoupon,
  calculateProductPricing,
  createEmptyPricingResult
} = require('../../utils/pricingEngine');

const Coupon = require('../../models/coupon');

// Mock the tax and shipping engine module
jest.mock('../../utils/taxShippingEngine', () => ({
  calculateTax: jest.fn((subtotal, shippingAddress, options) => {
    const defaultRate = 0.05; // 5%
    const stateRates = {
      'Delhi': 0.06, // 6%
      'Maharashtra': 0.07 // 7%
    };
    const stateId = shippingAddress?.stateId;
    const rate = stateRates[stateId] || defaultRate;
    return {
      amount: subtotal * rate,
      rate: rate,
      included: options?.taxIncluded || false
    };
  }),
  calculateShipping: jest.fn().mockResolvedValue({
    method: 'flat',
    label: 'Standard Shipping',
    amount: 50,
    breakdown: { zone: 'metro', weightClass: 'standard' }
  })
}));

// Mock the bulk discount calculator module
jest.mock('../../utils/bulkDiscountCalculator', () => ({
  calculateBulkDiscount: jest.fn((product, quantity) => {
    // If product has bulk discount enabled and quantity meets tier requirements
    if (product.bulkDiscount?.enabled && product.bulkDiscount?.tiers?.length > 0) {
      const tier = product.bulkDiscount.tiers[0];
      const meetsMin = quantity >= tier.minQuantity;
      const meetsMax = !tier.maxQuantity || quantity <= tier.maxQuantity;
      
      if (meetsMin && meetsMax) {
        const originalPrice = product.salePrice || product.regularPrice;
        let discountedPrice = originalPrice;
        
        if (tier.discountType === 'percentage') {
          discountedPrice = originalPrice * (1 - tier.discountValue / 100);
        } else if (tier.discountType === 'fixed') {
          discountedPrice = Math.max(0, originalPrice - tier.discountValue);
        }
        
        const savings = originalPrice - discountedPrice;
        
        return {
          success: true,
          originalPrice,
          discountedPrice,
          discount: tier.discountValue,
          discountType: tier.discountType,
          savings,
          savingsPercentage: (savings / originalPrice) * 100,
          applicableTier: tier,
          quantity,
          totalSavings: savings * quantity,
          totalPrice: discountedPrice * quantity
        };
      }
    }
    
    // No bulk discount applicable
    const originalPrice = product.salePrice || product.regularPrice || product.price || 0;
    return {
      success: true,
      originalPrice,
      discountedPrice: originalPrice,
      discount: 0,
      savings: 0,
      savingsPercentage: 0,
      applicableTier: null,
      quantity,
      totalSavings: 0,
      totalPrice: originalPrice * quantity
    };
  })
}));

describe('Pricing Engine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateSubtotal', () => {
    test('should calculate subtotal correctly for cart items (without bulk discounts)', () => {
      const cartItems = [
        { product: { regularPrice: 100 }, quantity: 2 },
        { product: { regularPrice: 50, salePrice: 50 }, quantity: 1 },
        { product: { regularPrice: 75 }, quantity: 3 }
      ];

      const result = calculateSubtotal(cartItems);
      expect(result.subtotal).toBe(475); // (100*2) + (50*1) + (75*3) = 200 + 50 + 225 = 475
      expect(result.originalSubtotal).toBe(475);
      expect(result.bulkDiscountAmount).toBe(0);
      expect(result.bulkDiscountBreakdown).toEqual([]);
    });

    test('should handle empty cart', () => {
      const result = calculateSubtotal([]);
      expect(result.subtotal).toBe(0);
      expect(result.originalSubtotal).toBe(0);
      expect(result.bulkDiscountAmount).toBe(0);
      expect(result.bulkDiscountBreakdown).toEqual([]);
    });

    test('should handle items with missing prices', () => {
      const cartItems = [
        { product: {}, quantity: 2 },
        { quantity: 1 }
      ];

      const result = calculateSubtotal(cartItems);
      expect(result.subtotal).toBe(0);
      expect(result.originalSubtotal).toBe(0);
      expect(result.bulkDiscountAmount).toBe(0);
    });

    test('should apply bulk discounts when configured', () => {
      const cartItems = [
        { 
          product: { 
            regularPrice: 100,
            bulkDiscount: {
              enabled: true,
              tiers: [{
                minQuantity: 5,
                maxQuantity: 10,
                discountType: 'percentage',
                discountValue: 10,
                price: 90 // 100 * (1 - 0.1)
              }]
            }
          }, 
          quantity: 5 
        }
      ];

      const result = calculateSubtotal(cartItems);
      // Original: 100 * 5 = 500
      // With bulk discount: 90 * 5 = 450
      // Savings: 50
      expect(result.subtotal).toBe(450);
      expect(result.originalSubtotal).toBe(500);
      expect(result.bulkDiscountAmount).toBe(50);
      expect(result.bulkDiscountBreakdown).toHaveLength(1);
      expect(result.bulkDiscountBreakdown[0].savings).toBe(50);
    });

    test('should not apply bulk discount when quantity is below tier minimum', () => {
      const cartItems = [
        { 
          product: { 
            regularPrice: 100,
            bulkDiscount: {
              enabled: true,
              tiers: [{
                minQuantity: 5,
                maxQuantity: 10,
                discountType: 'percentage',
                discountValue: 10,
                price: 90
              }]
            }
          }, 
          quantity: 3 // Below minimum
        }
      ];

      const result = calculateSubtotal(cartItems);
      expect(result.subtotal).toBe(300); // 100 * 3 (no discount applied)
      expect(result.originalSubtotal).toBe(300);
      expect(result.bulkDiscountAmount).toBe(0);
      expect(result.bulkDiscountBreakdown).toEqual([]);
    });
  });

  describe('calculateTax', () => {
    test('should calculate tax with default rate', () => {
      const result = calculateTax(1000, null);
      expect(result.amount).toBe(50); // 5% of 1000
      expect(result.rate).toBe(0.05);
      expect(result.included).toBe(false);
    });

    test('should calculate tax with state-specific rate', () => {
      const shippingAddress = { stateId: 'Delhi' };
      const result = calculateTax(1000, shippingAddress);
      expect(result.amount).toBe(60); // 6% of 1000 for Delhi
      expect(result.rate).toBe(0.06);
    });

    test('should handle tax included option', () => {
      const options = { taxIncluded: true };
      const result = calculateTax(1000, null, options);
      expect(result.included).toBe(true);
    });
  });

  describe('calculateDiscounts', () => {
    test('should return zero discount when no coupon provided', async () => {
      const result = await calculateDiscounts(1000, null, []);
      
      expect(result.totalDiscount).toBe(0);
      expect(result.couponDiscount).toBe(0);
      expect(result.discountType).toBe('none');
      expect(result.freeShipping).toBe(false);
    });

    test('should calculate percentage discount correctly', async () => {
      // Mock coupon
      const mockCoupon = {
        code: 'DISCOUNT10',
        discountType: 'percentage',
        discountValue: 10,
        minOrder: 500,
        freeShipping: false,
        isActive: true,
        validFrom: new Date(Date.now() - 86400000), // 1 day ago
        validTo: new Date(Date.now() + 86400000) // 1 day from now
      };

      Coupon.findOne = jest.fn().mockResolvedValue(mockCoupon);

      const result = await calculateDiscounts(1000, 'DISCOUNT10', []);
      
      expect(result.totalDiscount).toBe(100); // 10% of 1000
      expect(result.couponDiscount).toBe(100);
      expect(result.discountType).toBe('percentage');
      expect(result.discountValue).toBe(10);
    });

    test('should calculate fixed discount correctly', async () => {
      const mockCoupon = {
        code: 'SAVE50',
        discountType: 'fixed',
        discountValue: 50,
        minOrder: 200,
        freeShipping: false,
        isActive: true,
        validFrom: new Date(Date.now() - 86400000),
        validTo: new Date(Date.now() + 86400000)
      };

      Coupon.findOne = jest.fn().mockResolvedValue(mockCoupon);

      const result = await calculateDiscounts(1000, 'SAVE50', []);
      
      expect(result.totalDiscount).toBe(50);
      expect(result.couponDiscount).toBe(50);
      expect(result.discountType).toBe('fixed');
      expect(result.discountValue).toBe(50);
    });

    test('should handle free shipping coupon', async () => {
      const mockCoupon = {
        code: 'FREESHIP',
        discountType: 'none',
        discountValue: 0,
        minOrder: 1000,
        freeShipping: true,
        isActive: true,
        validFrom: new Date(Date.now() - 86400000),
        validTo: new Date(Date.now() + 86400000)
      };

      Coupon.findOne = jest.fn().mockResolvedValue(mockCoupon);

      const result = await calculateDiscounts(1000, 'FREESHIP', []);
      
      expect(result.totalDiscount).toBe(0);
      expect(result.freeShipping).toBe(true);
    });

    test('should handle invalid coupon', async () => {
      Coupon.findOne = jest.fn().mockResolvedValue(null);

      const result = await calculateDiscounts(1000, 'INVALID', []);
      
      expect(result.totalDiscount).toBe(0);
      expect(result.breakdown.error).toBe('Invalid or expired coupon');
    });

    test('should handle minimum order requirement not met', async () => {
      const mockCoupon = {
        code: 'MIN500',
        discountType: 'percentage',
        discountValue: 10,
        minOrder: 500,
        freeShipping: false,
        isActive: true,
        validFrom: new Date(Date.now() - 86400000),
        validTo: new Date(Date.now() + 86400000)
      };

      Coupon.findOne = jest.fn().mockResolvedValue(mockCoupon);

      const result = await calculateDiscounts(300, 'MIN500', []);
      
      expect(result.totalDiscount).toBe(0);
      expect(result.breakdown.error).toBe('Minimum order amount of ₹500 required');
    });
  });

  describe('validateCoupon', () => {
    test('should validate valid coupon', async () => {
      const mockCoupon = {
        code: 'VALID10',
        discountType: 'percentage',
        discountValue: 10,
        minOrder: 500,
        freeShipping: false,
        isActive: true,
        validFrom: new Date(Date.now() - 86400000),
        validTo: new Date(Date.now() + 86400000)
      };

      Coupon.findOne = jest.fn().mockResolvedValue(mockCoupon);

      const result = await validateCoupon('VALID10', 1000);
      
      expect(result.valid).toBe(true);
      expect(result.coupon.code).toBe('VALID10');
    });

    test('should reject invalid coupon', async () => {
      Coupon.findOne = jest.fn().mockResolvedValue(null);

      const result = await validateCoupon('INVALID', 1000);
      
      expect(result.valid).toBe(false);
      expect(result.message).toBe('Invalid or expired coupon code');
    });

    test('should reject coupon when minimum order not met', async () => {
      const mockCoupon = {
        code: 'MIN500',
        discountType: 'percentage',
        discountValue: 10,
        minOrder: 500,
        freeShipping: false,
        isActive: true,
        validFrom: new Date(Date.now() - 86400000),
        validTo: new Date(Date.now() + 86400000)
      };

      Coupon.findOne = jest.fn().mockResolvedValue(mockCoupon);

      const result = await validateCoupon('MIN500', 300);
      
      expect(result.valid).toBe(false);
      expect(result.message).toBe('Minimum order amount of ₹500 required for this coupon');
    });
  });

  describe('calculateProductPricing', () => {
    test('should calculate product pricing correctly (without bulk discount)', () => {
      const product = {
        regularPrice: 100,
        taxRate: 0.05,
        shippingCharge: 20
      };

      const result = calculateProductPricing(product, 2);
      
      expect(result.price).toBe(100);
      expect(result.originalPrice).toBe(100);
      expect(result.quantity).toBe(2);
      expect(result.subtotal).toBe(200);
      expect(result.originalSubtotal).toBe(200);
      expect(result.bulkDiscount).toBe(0);
      expect(result.bulkDiscountInfo).toBe(null);
      expect(result.tax.amount).toBe(10); // 5% of 200
      expect(result.shipping.amount).toBe(20);
      expect(result.total).toBe(230); // 200 + 10 + 20
    });

    test('should apply bulk discount when configured', () => {
      const product = {
        regularPrice: 100,
        taxRate: 0.05,
        shippingCharge: 20,
        bulkDiscount: {
          enabled: true,
          tiers: [{
            minQuantity: 5,
            maxQuantity: 10,
            discountType: 'percentage',
            discountValue: 10,
            price: 90
          }]
        }
      };

      const result = calculateProductPricing(product, 5);
      
      expect(result.price).toBe(90); // Discounted price
      expect(result.originalPrice).toBe(100);
      expect(result.quantity).toBe(5);
      expect(result.subtotal).toBe(450); // 90 * 5
      expect(result.originalSubtotal).toBe(500); // 100 * 5
      expect(result.bulkDiscount).toBe(50); // 10 * 5
      expect(result.bulkDiscountInfo).toBeDefined();
      expect(result.bulkDiscountInfo.discountType).toBe('percentage');
      expect(result.bulkDiscountInfo.discountValue).toBe(10);
      expect(result.tax.amount).toBe(22.5); // 5% of 450
      expect(result.shipping.amount).toBe(20);
      expect(result.total).toBe(492.5); // 450 + 22.5 + 20
    });

    test('should handle product with default values', () => {
      const product = {};

      const result = calculateProductPricing(product, 1);
      
      expect(result.subtotal).toBe(0);
      expect(result.originalSubtotal).toBe(0);
      expect(result.bulkDiscount).toBe(0);
      expect(result.tax.amount).toBe(0);
      expect(result.shipping.amount).toBe(0);
      expect(result.total).toBe(0);
    });
  });

  describe('createEmptyPricingResult', () => {
    test('should create empty pricing result', () => {
      const result = createEmptyPricingResult();
      
      expect(result.subtotal).toBe(0);
      expect(result.originalSubtotal).toBe(0);
      expect(result.discount.total).toBe(0);
      expect(result.discount.bulk).toBe(0);
      expect(result.discount.coupon).toBe(0);
      expect(result.tax.amount).toBe(0);
      expect(result.shipping.amount).toBe(0);
      expect(result.total).toBe(0);
      expect(result.metadata.cartItemCount).toBe(0);
      expect(result.metadata.bulkDiscountApplied).toBe(false);
    });
  });

  describe('calculatePricing - Integration Tests', () => {
    test('should calculate complete pricing for cart with coupon', async () => {
      const cartItems = [
        { product: { regularPrice: 100 }, quantity: 2 },
        { product: { regularPrice: 50, salePrice: 50 }, quantity: 1 }
      ];

      const mockCoupon = {
        code: 'DISCOUNT10',
        discountType: 'percentage',
        discountValue: 10,
        minOrder: 200,
        freeShipping: false,
        isActive: true,
        validFrom: new Date(Date.now() - 86400000),
        validTo: new Date(Date.now() + 86400000)
      };

      Coupon.findOne = jest.fn().mockResolvedValue(mockCoupon);

      const result = await calculatePricing({
        cartItems,
        couponCode: 'DISCOUNT10',
        shippingAddress: { stateId: 'Delhi' },
        options: {}
      });

      expect(result.subtotal).toBe(250); // (100*2) + (50*1)
      expect(result.originalSubtotal).toBe(250);
      expect(result.discount.total).toBe(25); // 10% of 250 (coupon only, no bulk discount)
      expect(result.discount.bulk).toBe(0); // No bulk discount
      expect(result.discount.coupon).toBe(25); // Coupon discount
      expect(result.tax.amount).toBe(13.5); // 6% of (250-25) = 6% of 225 = 13.5
      expect(result.shipping.amount).toBe(50); // Mocked shipping
      expect(result.total).toBe(288.5); // 250 - 25 + 13.5 + 50
      expect(result.metadata.couponApplied).toBe(true);
      expect(result.metadata.bulkDiscountApplied).toBe(false);
    });

    test('should handle empty cart', async () => {
      const result = await calculatePricing({
        cartItems: [],
        couponCode: null,
        shippingAddress: null,
        options: {}
      });

      expect(result.subtotal).toBe(0);
      expect(result.total).toBe(0);
      expect(result.metadata.cartItemCount).toBe(0);
    });

    test('should handle cart with free shipping coupon', async () => {
      const cartItems = [
        { product: { regularPrice: 100 }, quantity: 1 }
      ];

      const mockCoupon = {
        code: 'FREESHIP',
        discountType: 'none',
        discountValue: 0,
        minOrder: 100,
        freeShipping: true,
        isActive: true,
        validFrom: new Date(Date.now() - 86400000),
        validTo: new Date(Date.now() + 86400000)
      };

      Coupon.findOne = jest.fn().mockResolvedValue(mockCoupon);

      const result = await calculatePricing({
        cartItems,
        couponCode: 'FREESHIP',
        shippingAddress: null,
        options: {}
      });

      expect(result.subtotal).toBe(100);
      expect(result.discount.freeShipping).toBe(true);
      expect(result.shipping.amount).toBe(0); // Free shipping applied
      expect(result.total).toBe(105); // 100 + 5% tax
    });
  });
});
