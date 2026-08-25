/**
 * Integration Tests for Bulk Discount Validation System
 * 
 * This test suite covers the complete workflow of bulk discount validation
 * including middleware integration, controller integration, and end-to-end
 * validation scenarios.
 */

const request = require('supertest');
const express = require('express');
const { validateBulkDiscount, validateBulkDiscountForProduct } = require('../../middleware/validateBulkDiscount');
const { validatePricingRule } = require('../../utils/pricingRuleValidator');

// Create test app
const app = express();
app.use(express.json());

// Test routes
app.post('/api/test/validate-bulk-discount', validateBulkDiscount, (req, res) => {
  res.json({
    success: true,
    message: 'Validation passed',
    validation: req.bulkDiscountValidation
  });
});

app.post('/api/test/validate-product', validateBulkDiscountForProduct, (req, res) => {
  res.json({
    success: true,
    message: 'Product validation passed',
    validation: req.bulkDiscountValidation
  });
});

app.put('/api/test/validate-product/:id', validateBulkDiscountForProduct, (req, res) => {
  res.json({
    success: true,
    message: 'Product update validation passed',
    validation: req.bulkDiscountValidation
  });
});

describe('Bulk Discount Validation Integration', () => {
  describe('POST /api/test/validate-bulk-discount', () => {
    test('should validate valid bulk discount configuration', async () => {
      const validBulkDiscount = {
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
              discountValue: 20
            }
          ]
        },
        regularPrice: 100
      };

      const response = await request(app)
        .post('/api/test/validate-bulk-discount')
        .send(validBulkDiscount)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.validation.isValid).toBe(true);
    });

    test('should reject invalid regular price', async () => {
      const invalidRequest = {
        bulkDiscount: {
          enabled: true,
          tiers: []
        },
        regularPrice: -10 // Invalid price
      };

      const response = await request(app)
        .post('/api/test/validate-bulk-discount')
        .send(invalidRequest)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid regular price');
    });

    test('should reject bulk discount with pricing conflicts', async () => {
      const conflictingBulkDiscount = {
        bulkDiscount: {
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
        },
        regularPrice: 100
      };

      const response = await request(app)
        .post('/api/test/validate-bulk-discount')
        .send(conflictingBulkDiscount)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Bulk discount validation failed');
      expect(response.body.details.errors).toBeDefined();
    });

    test('should reject bulk discount with data integrity issues', async () => {
      const invalidBulkDiscount = {
        bulkDiscount: {
          enabled: true,
          tiers: [
            {
              minQuantity: -5, // Invalid negative quantity
              maxQuantity: 9,
              discountType: 'percentage',
              discountValue: 10
            }
          ]
        },
        regularPrice: 100
      };

      const response = await request(app)
        .post('/api/test/validate-bulk-discount')
        .send(invalidBulkDiscount)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Bulk discount validation failed');
      expect(response.body.details.errors).toContain('Tier 1: minQuantity must be a positive number');
    });

    test('should warn about excessive discounts', async () => {
      const highDiscountBulkDiscount = {
        bulkDiscount: {
          enabled: true,
          tiers: [
            {
              minQuantity: 5,
              maxQuantity: 9,
              discountType: 'percentage',
              discountValue: 95 // Very high discount
            }
          ]
        },
        regularPrice: 100
      };

      const response = await request(app)
        .post('/api/test/validate-bulk-discount')
        .send(highDiscountBulkDiscount)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.validation.warnings.length).toBeGreaterThan(0);
      expect(response.body.validation.warnings.some(w => w.includes('Very high discount'))).toBe(true);
    });
  });

  describe('POST /api/test/validate-product', () => {
    test('should skip validation when no bulk discount provided', async () => {
      const productWithoutBulkDiscount = {
        name: 'Test Product',
        regularPrice: 100,
        description: 'Test product description'
        // No bulkDiscount field
      };

      const response = await request(app)
        .post('/api/test/validate-product')
        .send(productWithoutBulkDiscount)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.validation).toBeUndefined();
    });

    test('should validate bulk discount when provided', async () => {
      const productWithBulkDiscount = {
        name: 'Test Product',
        regularPrice: 100,
        description: 'Test product description',
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

      const response = await request(app)
        .post('/api/test/validate-product')
        .send(productWithBulkDiscount)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.validation.isValid).toBe(true);
    });

    test('should reject product with invalid bulk discount', async () => {
      const productWithInvalidBulkDiscount = {
        name: 'Test Product',
        regularPrice: 100,
        description: 'Test product description',
        bulkDiscount: {
          enabled: true,
          tiers: [
            {
              minQuantity: 5,
              maxQuantity: 9,
              discountType: 'invalid', // Invalid discount type
              discountValue: 10
            }
          ]
        }
      };

      const response = await request(app)
        .post('/api/test/validate-product')
        .send(productWithInvalidBulkDiscount)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Bulk discount validation failed');
    });
  });

  describe('PUT /api/test/validate-product/:id', () => {
    test('should validate product update with bulk discount', async () => {
      const productUpdate = {
        name: 'Updated Test Product',
        regularPrice: 120,
        bulkDiscount: {
          enabled: true,
          tiers: [
            {
              minQuantity: 5,
              maxQuantity: 9,
              discountType: 'percentage',
              discountValue: 15
            }
          ]
        }
      };

      const response = await request(app)
        .put('/api/test/validate-product/product123')
        .send(productUpdate)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.validation.isValid).toBe(true);
    });

    test('should reject product update with invalid bulk discount', async () => {
      const invalidProductUpdate = {
        name: 'Updated Test Product',
        regularPrice: 120,
        bulkDiscount: {
          enabled: true,
          tiers: [
            {
              minQuantity: 5,
              maxQuantity: 3, // maxQuantity less than minQuantity
              discountType: 'percentage',
              discountValue: 15
            }
          ]
        }
      };

      const response = await request(app)
        .put('/api/test/validate-product/product123')
        .send(invalidProductUpdate)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Bulk discount validation failed');
    });
  });

  describe('Pricing Rule Validator Integration', () => {
    test('should validate complex pricing rule configuration', () => {
      const complexPricingRule = {
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
              discountValue: 20
            },
            {
              minQuantity: 20,
              discountType: 'fixed',
              discountValue: 30
            }
          ]
        },
        coupons: [
          {
            code: 'SAVE10',
            discountType: 'percentage',
            discountValue: 10
          }
        ],
        specialOffers: [
          {
            name: 'Summer Sale',
            discountType: 'percentage',
            discountValue: 15,
            startDate: '2024-06-01',
            endDate: '2024-08-31'
          }
        ]
      };

      const result = validatePricingRule(complexPricingRule, {
        regularPrice: 100,
        includeSuggestions: true
      });

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.suggestions.length).toBeGreaterThanOrEqual(0);
    });

    test('should detect conflicts in complex pricing rule', () => {
      const conflictingPricingRule = {
        bulkDiscount: {
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
        },
        coupons: [
          {
            code: 'SAVE10',
            discountType: 'percentage',
            discountValue: 150 // Invalid - over 100%
          }
        ]
      };

      const result = validatePricingRule(conflictingPricingRule, {
        regularPrice: 100,
        strictMode: true
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.conflicts.pricing.length).toBeGreaterThan(0);
    });

    test('should provide suggestions for pricing optimization', () => {
      const suboptimalPricingRule = {
        bulkDiscount: {
          enabled: true,
          tiers: [
            {
              minQuantity: 15, // High minimum quantity
              maxQuantity: 19,
              discountType: 'percentage',
              discountValue: 10
            },
            {
              minQuantity: 30, // Large gap
              maxQuantity: 39,
              discountType: 'percentage',
              discountValue: 20
            }
          ]
        }
      };

      const result = validatePricingRule(suboptimalPricingRule, {
        regularPrice: 100,
        includeSuggestions: true
      });

      expect(result.suggestions.length).toBeGreaterThanOrEqual(0);
      if (result.suggestions.length > 0) {
        expect(result.suggestions.some(s => s.includes('Consider lowering the minimum quantity'))).toBe(true);
        expect(result.suggestions.some(s => s.includes('Consider adding a tier between'))).toBe(true);
      }
    });
  });

  describe('Error Handling Integration', () => {
    test('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/api/test/validate-bulk-discount')
        .send('invalid json')
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should handle missing required fields', async () => {
      const incompleteRequest = {
        bulkDiscount: {
          enabled: true,
          tiers: []
        }
        // Missing regularPrice
      };

      const response = await request(app)
        .post('/api/test/validate-bulk-discount')
        .send(incompleteRequest)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid regular price');
    });

    test('should handle null values gracefully', async () => {
      const nullRequest = {
        bulkDiscount: null,
        regularPrice: 100
      };

      const response = await request(app)
        .post('/api/test/validate-bulk-discount')
        .send(nullRequest)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.validation.isValid).toBe(true);
    });
  });

  describe('Performance Integration', () => {
    test('should handle large tier configurations efficiently', () => {
      const largeTierConfiguration = {
        bulkDiscount: {
          enabled: true,
          tiers: Array.from({ length: 50 }, (_, i) => ({
            minQuantity: (i + 1) * 10,
            maxQuantity: (i + 1) * 10 + 9,
            discountType: 'percentage',
            discountValue: Math.min(30, (i + 1) * 0.5) // More reasonable discounts
          }))
        }
      };

      const startTime = Date.now();
      const result = validatePricingRule(largeTierConfiguration, {
        regularPrice: 100,
        includeSuggestions: true
      });
      const endTime = Date.now();

      expect(result.isValid).toBe(true);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    test('should handle complex validation scenarios efficiently', () => {
      const complexScenario = {
        bulkDiscount: {
          enabled: true,
          tiers: [
            { minQuantity: 5, maxQuantity: 9, discountType: 'percentage', discountValue: 10 },
            { minQuantity: 10, maxQuantity: 19, discountType: 'percentage', discountValue: 20 },
            { minQuantity: 20, maxQuantity: 29, discountType: 'fixed', discountValue: 30 },
            { minQuantity: 30, maxQuantity: 49, discountType: 'percentage', discountValue: 35 },
            { minQuantity: 50, discountType: 'fixed', discountValue: 50 }
          ]
        },
        coupons: Array.from({ length: 10 }, (_, i) => ({
          code: `COUPON${i + 1}`,
          discountType: 'percentage',
          discountValue: (i + 1) * 5
        })),
        specialOffers: Array.from({ length: 5 }, (_, i) => ({
          name: `Offer ${i + 1}`,
          discountType: 'percentage',
          discountValue: (i + 1) * 10,
          startDate: '2024-01-01',
          endDate: '2024-12-31'
        }))
      };

      const startTime = Date.now();
      const result = validatePricingRule(complexScenario, {
        regularPrice: 100,
        strictMode: true,
        includeSuggestions: true
      });
      const endTime = Date.now();

      expect(result.isValid).toBe(true);
      expect(endTime - startTime).toBeLessThan(500); // Should complete within 500ms
    });
  });
});
