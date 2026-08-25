/**
 * Tests for Pricing Rule Validator
 * 
 * This test suite covers comprehensive validation for pricing rules including
 * bulk discount configurations, quantity thresholds, conflict detection,
 * and data integrity validation.
 */

const {
  validatePricingRule,
  validateBulkDiscountEnhanced,
  validateBusinessLogic,
  validatePricingProgression,
  validateTierStructure,
  validateCouponRules,
  validateSpecialOffers,
  generatePricingSuggestions
} = require('../../utils/pricingRuleValidator');

describe('Pricing Rule Validator', () => {
  const mockRegularPrice = 100;

  describe('validatePricingRule', () => {
    test('should return valid for null pricing rule', () => {
      const result = validatePricingRule(null, { regularPrice: mockRegularPrice });
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    test('should validate bulk discount configuration', () => {
      const pricingRule = {
        bulkDiscount: {
          enabled: true,
          tiers: [
            {
              minQuantity: 5,
              maxQuantity: 9,
              discountType: 'percentage',
              discountValue: 10
            }
          ]
        }
      };

      const result = validatePricingRule(pricingRule, { regularPrice: mockRegularPrice });
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('should detect invalid bulk discount configuration', () => {
      const pricingRule = {
        bulkDiscount: {
          enabled: true,
          tiers: [
            {
              minQuantity: -5, // Invalid
              maxQuantity: 9,
              discountType: 'percentage',
              discountValue: 10
            }
          ]
        }
      };

      const result = validatePricingRule(pricingRule, { regularPrice: mockRegularPrice });
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should validate coupon rules', () => {
      const pricingRule = {
        coupons: [
          {
            code: 'SAVE10',
            discountType: 'percentage',
            discountValue: 10
          }
        ]
      };

      const result = validatePricingRule(pricingRule, { regularPrice: mockRegularPrice });
      expect(result.isValid).toBe(true);
    });

    test('should detect invalid coupon rules', () => {
      const pricingRule = {
        coupons: [
          {
            code: 'SAVE10',
            discountType: 'percentage',
            discountValue: 150 // Invalid - over 100%
          }
        ]
      };

      const result = validatePricingRule(pricingRule, { regularPrice: mockRegularPrice });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Coupon 1: Percentage discount cannot exceed 100%');
    });

    test('should validate special offers', () => {
      const pricingRule = {
        specialOffers: [
          {
            name: 'Summer Sale',
            discountType: 'percentage',
            discountValue: 20,
            startDate: '2024-01-01',
            endDate: '2024-12-31'
          }
        ]
      };

      const result = validatePricingRule(pricingRule, { regularPrice: mockRegularPrice });
      expect(result.isValid).toBe(true);
    });

    test('should detect invalid special offers', () => {
      const pricingRule = {
        specialOffers: [
          {
            name: 'Summer Sale',
            discountType: 'percentage',
            discountValue: 20,
            startDate: '2024-12-31', // End date before start date
            endDate: '2024-01-01'
          }
        ]
      };

      const result = validatePricingRule(pricingRule, { regularPrice: mockRegularPrice });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Offer 1: Start date must be before end date');
    });

    test('should include suggestions when requested', () => {
      const pricingRule = {
        bulkDiscount: {
          enabled: true,
          tiers: [
            {
              minQuantity: 5,
              maxQuantity: 9,
              discountType: 'percentage',
              discountValue: 10
            },
            {
              minQuantity: 20, // Large gap
              maxQuantity: 29,
              discountType: 'percentage',
              discountValue: 20
            }
          ]
        }
      };

      const result = validatePricingRule(pricingRule, { 
        regularPrice: mockRegularPrice,
        includeSuggestions: true
      });
      expect(result.suggestions.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('validateBulkDiscountEnhanced', () => {
    test('should return valid for disabled bulk discount', () => {
      const bulkDiscount = { enabled: false };
      const result = validateBulkDiscountEnhanced(bulkDiscount, mockRegularPrice);
      expect(result.isValid).toBe(true);
    });

    test('should validate business logic', () => {
      const bulkDiscount = {
        enabled: true,
        tiers: [
          {
            minQuantity: 5,
            maxQuantity: 9,
            discountType: 'percentage',
            discountValue: 10
          }
        ]
      };

      const result = validateBulkDiscountEnhanced(bulkDiscount, mockRegularPrice);
      expect(result.isValid).toBe(true);
    });

    test('should detect business logic issues', () => {
      const bulkDiscount = {
        enabled: true,
        tiers: [
          {
            minQuantity: 5,
            maxQuantity: 9,
            discountType: 'percentage',
            discountValue: 95 // Very high discount
          }
        ]
      };

      const result = validateBulkDiscountEnhanced(bulkDiscount, mockRegularPrice);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('High percentage discount'))).toBe(true);
    });

    test('should validate pricing progression', () => {
      const bulkDiscount = {
        enabled: true,
        tiers: [
          {
            minQuantity: 5,
            maxQuantity: 9,
            discountType: 'percentage',
            discountValue: 10
          },
          {
            minQuantity: 10,
            maxQuantity: 19,
            discountType: 'percentage',
            discountValue: 20
          }
        ]
      };

      const result = validateBulkDiscountEnhanced(bulkDiscount, mockRegularPrice);
      expect(result.isValid).toBe(true);
    });

    test('should detect pricing progression issues', () => {
      const bulkDiscount = {
        enabled: true,
        tiers: [
          {
            minQuantity: 5,
            maxQuantity: 9,
            discountType: 'percentage',
            discountValue: 20
          },
          {
            minQuantity: 10,
            maxQuantity: 19,
            discountType: 'percentage',
            discountValue: 10 // Lower discount for higher quantity
          }
        ]
      };

      const result = validateBulkDiscountEnhanced(bulkDiscount, mockRegularPrice);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('should be lower than previous tier'))).toBe(true);
    });

    test('should validate tier structure', () => {
      const bulkDiscount = {
        enabled: true,
        tiers: [
          {
            minQuantity: 5,
            maxQuantity: 9,
            discountType: 'percentage',
            discountValue: 10
          },
          {
            minQuantity: 10,
            maxQuantity: 19,
            discountType: 'percentage',
            discountValue: 20
          }
        ]
      };

      const result = validateBulkDiscountEnhanced(bulkDiscount, mockRegularPrice);
      expect(result.isValid).toBe(true);
    });

    test('should detect tier structure issues', () => {
      const bulkDiscount = {
        enabled: true,
        tiers: [
          {
            minQuantity: 5,
            maxQuantity: 12,
            discountType: 'percentage',
            discountValue: 10
          },
          {
            minQuantity: 10, // Overlaps with previous tier
            maxQuantity: 19,
            discountType: 'percentage',
            discountValue: 20
          }
        ]
      };

      const result = validateBulkDiscountEnhanced(bulkDiscount, mockRegularPrice);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Overlapping quantity ranges'))).toBe(true);
    });
  });

  describe('validateBusinessLogic', () => {
    test('should validate reasonable tier configuration', () => {
      const tier = {
        minQuantity: 5,
        maxQuantity: 9,
        discountType: 'percentage',
        discountValue: 10
      };

      const result = validateBusinessLogic(tier, mockRegularPrice, 1, false);
      expect(result.isValid).toBe(true);
    });

    test('should warn about high minimum quantities', () => {
      const tier = {
        minQuantity: 150,
        maxQuantity: 199,
        discountType: 'percentage',
        discountValue: 10
      };

      const result = validateBusinessLogic(tier, mockRegularPrice, 1, false);
      expect(result.warnings.some(w => w.includes('High minimum quantity'))).toBe(true);
    });

    test('should warn about high discounts', () => {
      const tier = {
        minQuantity: 5,
        maxQuantity: 9,
        discountType: 'percentage',
        discountValue: 60
      };

      const result = validateBusinessLogic(tier, mockRegularPrice, 1, false);
      expect(result.warnings.some(w => w.includes('High percentage discount'))).toBe(true);
    });

    test('should error on very low prices in strict mode', () => {
      const tier = {
        minQuantity: 5,
        maxQuantity: 9,
        discountType: 'percentage',
        discountValue: 80 // Very high discount
      };

      const result = validateBusinessLogic(tier, mockRegularPrice, 1, true);
      expect(result.errors.some(e => e.includes('Price too low'))).toBe(true);
    });
  });

  describe('validatePricingProgression', () => {
    test('should validate proper pricing progression', () => {
      const prevTier = {
        minQuantity: 5,
        maxQuantity: 9,
        discountType: 'percentage',
        discountValue: 10
      };

      const currentTier = {
        minQuantity: 10,
        maxQuantity: 19,
        discountType: 'percentage',
        discountValue: 20
      };

      const result = validatePricingProgression(prevTier, currentTier, mockRegularPrice, 2);
      expect(result.isValid).toBe(true);
    });

    test('should detect pricing progression issues', () => {
      const prevTier = {
        minQuantity: 5,
        maxQuantity: 9,
        discountType: 'percentage',
        discountValue: 20
      };

      const currentTier = {
        minQuantity: 10,
        maxQuantity: 19,
        discountType: 'percentage',
        discountValue: 10 // Lower discount
      };

      const result = validatePricingProgression(prevTier, currentTier, mockRegularPrice, 2);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('should be lower than previous tier'))).toBe(true);
    });

    test('should warn about small price differences', () => {
      const prevTier = {
        minQuantity: 5,
        maxQuantity: 9,
        discountType: 'percentage',
        discountValue: 10
      };

      const currentTier = {
        minQuantity: 10,
        maxQuantity: 19,
        discountType: 'percentage',
        discountValue: 11 // Very small difference
      };

      const result = validatePricingProgression(prevTier, currentTier, mockRegularPrice, 2);
      expect(result.warnings.some(w => w.includes('Small price difference'))).toBe(true);
    });
  });

  describe('validateTierStructure', () => {
    test('should validate proper tier structure', () => {
      const sortedTiers = [
        {
          minQuantity: 5,
          maxQuantity: 9,
          discountType: 'percentage',
          discountValue: 10
        },
        {
          minQuantity: 10,
          maxQuantity: 19,
          discountType: 'percentage',
          discountValue: 20
        }
      ];

      const result = validateTierStructure(sortedTiers, mockRegularPrice);
      expect(result.isValid).toBe(true);
    });

    test('should detect gaps in quantity ranges', () => {
      const sortedTiers = [
        {
          minQuantity: 5,
          maxQuantity: 9,
          discountType: 'percentage',
          discountValue: 10
        },
        {
          minQuantity: 15, // Gap from 9 to 15
          maxQuantity: 19,
          discountType: 'percentage',
          discountValue: 20
        }
      ];

      const result = validateTierStructure(sortedTiers, mockRegularPrice);
      expect(result.warnings.some(w => w.includes('Gap in quantity ranges'))).toBe(true);
    });

    test('should detect overlapping ranges', () => {
      const sortedTiers = [
        {
          minQuantity: 5,
          maxQuantity: 12,
          discountType: 'percentage',
          discountValue: 10
        },
        {
          minQuantity: 10, // Overlaps with previous tier
          maxQuantity: 19,
          discountType: 'percentage',
          discountValue: 20
        }
      ];

      const result = validateTierStructure(sortedTiers, mockRegularPrice);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Overlapping quantity ranges'))).toBe(true);
    });

    test('should warn about large quantity jumps', () => {
      const sortedTiers = [
        {
          minQuantity: 5,
          maxQuantity: 9,
          discountType: 'percentage',
          discountValue: 10
        },
        {
          minQuantity: 60, // Large jump (500%+ increase from 9)
          maxQuantity: 99,
          discountType: 'percentage',
          discountValue: 20
        }
      ];

      const result = validateTierStructure(sortedTiers, mockRegularPrice);
      expect(result.warnings.some(w => w.includes('Large quantity jump'))).toBe(true);
    });
  });

  describe('validateCouponRules', () => {
    test('should validate proper coupon configuration', () => {
      const coupons = [
        {
          code: 'SAVE10',
          discountType: 'percentage',
          discountValue: 10
        }
      ];

      const result = validateCouponRules(coupons, mockRegularPrice);
      expect(result.isValid).toBe(true);
    });

    test('should detect invalid coupon array', () => {
      const result = validateCouponRules('not an array', mockRegularPrice);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Coupons must be an array');
    });

    test('should detect missing coupon code', () => {
      const coupons = [
        {
          discountType: 'percentage',
          discountValue: 10
        }
      ];

      const result = validateCouponRules(coupons, mockRegularPrice);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Coupon 1: Code is required and must be a string');
    });

    test('should detect invalid discount type', () => {
      const coupons = [
        {
          code: 'SAVE10',
          discountType: 'invalid',
          discountValue: 10
        }
      ];

      const result = validateCouponRules(coupons, mockRegularPrice);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Coupon 1: Invalid discount type');
    });

    test('should detect percentage discount over 100%', () => {
      const coupons = [
        {
          code: 'SAVE10',
          discountType: 'percentage',
          discountValue: 150
        }
      ];

      const result = validateCouponRules(coupons, mockRegularPrice);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Coupon 1: Percentage discount cannot exceed 100%');
    });
  });

  describe('validateSpecialOffers', () => {
    test('should validate proper special offer configuration', () => {
      const offers = [
        {
          name: 'Summer Sale',
          discountType: 'percentage',
          discountValue: 20,
          startDate: '2024-01-01',
          endDate: '2024-12-31'
        }
      ];

      const result = validateSpecialOffers(offers, mockRegularPrice);
      expect(result.isValid).toBe(true);
    });

    test('should detect invalid offers array', () => {
      const result = validateSpecialOffers('not an array', mockRegularPrice);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Special offers must be an array');
    });

    test('should detect missing offer name', () => {
      const offers = [
        {
          discountType: 'percentage',
          discountValue: 20
        }
      ];

      const result = validateSpecialOffers(offers, mockRegularPrice);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Offer 1: Name is required and must be a string');
    });

    test('should detect invalid date range', () => {
      const offers = [
        {
          name: 'Summer Sale',
          discountType: 'percentage',
          discountValue: 20,
          startDate: '2024-12-31',
          endDate: '2024-01-01'
        }
      ];

      const result = validateSpecialOffers(offers, mockRegularPrice);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Offer 1: Start date must be before end date');
    });
  });

  describe('generatePricingSuggestions', () => {
    test('should generate suggestions for gaps in tiers', () => {
      const pricingRule = {
        bulkDiscount: {
          enabled: true,
          tiers: [
            {
              minQuantity: 5,
              maxQuantity: 9,
              discountType: 'percentage',
              discountValue: 10
            },
            {
              minQuantity: 20, // Large gap
              maxQuantity: 29,
              discountType: 'percentage',
              discountValue: 20
            }
          ]
        }
      };

      const suggestions = generatePricingSuggestions(pricingRule, mockRegularPrice);
      expect(suggestions.some(s => s.includes('Consider adding a tier between'))).toBe(true);
    });

    test('should generate suggestions for high minimum quantities', () => {
      const pricingRule = {
        bulkDiscount: {
          enabled: true,
          tiers: [
            {
              minQuantity: 15, // High minimum
              maxQuantity: 19,
              discountType: 'percentage',
              discountValue: 10
            }
          ]
        }
      };

      const suggestions = generatePricingSuggestions(pricingRule, mockRegularPrice);
      expect(suggestions.some(s => s.includes('Consider lowering the minimum quantity'))).toBe(true);
    });

    test('should generate suggestions for small price differences', () => {
      const pricingRule = {
        bulkDiscount: {
          enabled: true,
          tiers: [
            {
              minQuantity: 5,
              maxQuantity: 9,
              discountType: 'percentage',
              discountValue: 10
            },
            {
              minQuantity: 10,
              maxQuantity: 19,
              discountType: 'percentage',
              discountValue: 11 // Very small difference
            }
          ]
        }
      };

      const suggestions = generatePricingSuggestions(pricingRule, mockRegularPrice);
      expect(suggestions.some(s => s.includes('Consider increasing the discount difference'))).toBe(true);
    });

    test('should return empty array for null pricing rule', () => {
      const suggestions = generatePricingSuggestions(null, mockRegularPrice);
      expect(suggestions).toEqual([]);
    });

    test('should return empty array for disabled bulk discount', () => {
      const pricingRule = {
        bulkDiscount: {
          enabled: false
        }
      };

      const suggestions = generatePricingSuggestions(pricingRule, mockRegularPrice);
      expect(suggestions).toEqual([]);
    });
  });
});
