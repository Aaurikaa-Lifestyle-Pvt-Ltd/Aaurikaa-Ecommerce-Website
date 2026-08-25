/**
 * Tests for Bulk Discount Validation Middleware
 * 
 * This test suite covers comprehensive validation for bulk discount configurations
 * including rule validation, quantity threshold validation, conflict detection,
 * and data integrity checks.
 */

const {
  validateBulkDiscount,
  validateBulkDiscountForProduct,
  validateBulkDiscountConfig,
  validateBulkDiscountWithConflicts,
  detectPricingConflicts,
  detectQuantityThresholdConflicts,
  checkDataIntegrity
} = require('../../middleware/validateBulkDiscount');

const { sendErrorResponse, ERROR_CODES, HTTP_STATUS } = require('../../utils/errorHandler');

// Mock the error handler
jest.mock('../../utils/errorHandler', () => ({
  sendErrorResponse: jest.fn(),
  ERROR_CODES: {
    VALIDATION_FAILED: 'VALIDATION_FAILED',
    INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR'
  },
  HTTP_STATUS: {
    BAD_REQUEST: 400,
    INTERNAL_SERVER_ERROR: 500
  }
}));

describe('Bulk Discount Validation Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      body: {},
      params: {},
      bulkDiscountValidation: undefined
    };
    res = {};
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('validateBulkDiscountWithConflicts', () => {
    test('should return valid for null bulk discount', () => {
      const result = validateBulkDiscountWithConflicts(null, 100);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    test('should return valid for disabled bulk discount', () => {
      const result = validateBulkDiscountWithConflicts({ enabled: false }, 100);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    test('should detect pricing conflicts', () => {
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
            discountValue: 5 // Lower discount for higher quantity - conflict
          }
        ]
      };

      const result = validateBulkDiscountWithConflicts(bulkDiscount, 100);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Tier 2: Price (95) should not be higher than previous tier (90)');
    });

    test('should detect quantity threshold conflicts', () => {
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
            minQuantity: 15, // Gap in quantity ranges
            maxQuantity: 19,
            discountType: 'percentage',
            discountValue: 20
          }
        ]
      };

      const result = validateBulkDiscountWithConflicts(bulkDiscount, 100);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Tier 2: Gap in quantity ranges (9 to 15)');
    });

    test('should detect data integrity issues', () => {
      const bulkDiscount = {
        enabled: true,
        tiers: [
          {
            minQuantity: -5, // Invalid negative quantity
            maxQuantity: 9,
            discountType: 'percentage',
            discountValue: 10
          }
        ]
      };

      const result = validateBulkDiscountWithConflicts(bulkDiscount, 100);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Tier 1: minQuantity must be a positive number');
    });

    test('should warn about excessive discounts', () => {
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

      const result = validateBulkDiscountWithConflicts(bulkDiscount, 100);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Tier 1: Very high discount (95%) - ensure profitability');
    });
  });

  describe('detectPricingConflicts', () => {
    test('should detect negative pricing', () => {
      const tiers = [
        {
          minQuantity: 5,
          maxQuantity: 9,
          discountType: 'fixed',
          discountValue: 150 // More than regular price
        }
      ];

      const result = detectPricingConflicts(tiers, 100);
      expect(result.errors).toContain('Tier 1: Calculated price cannot be negative (-50)');
    });

    test('should warn about zero pricing', () => {
      const tiers = [
        {
          minQuantity: 5,
          maxQuantity: 9,
          discountType: 'fixed',
          discountValue: 100 // Exactly the regular price
        }
      ];

      const result = detectPricingConflicts(tiers, 100);
      expect(result.warnings).toContain('Tier 1: Calculated price is zero - consider minimum price limits');
    });

    test('should detect pricing progression issues', () => {
      const tiers = [
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
      ];

      const result = detectPricingConflicts(tiers, 100);
      expect(result.errors).toContain('Tier 2: Price (90) should not be higher than previous tier (80)');
    });

    test('should warn about excessive fixed discounts', () => {
      const tiers = [
        {
          minQuantity: 5,
          maxQuantity: 9,
          discountType: 'fixed',
          discountValue: 85 // 85% of regular price
        }
      ];

      const result = detectPricingConflicts(tiers, 100);
      expect(result.warnings).toContain('Tier 1: Very high fixed discount (85) - ensure profitability');
    });
  });

  describe('detectQuantityThresholdConflicts', () => {
    test('should warn about very high minimum quantities', () => {
      const tiers = [
        {
          minQuantity: 1500,
          maxQuantity: 2000,
          discountType: 'percentage',
          discountValue: 10
        }
      ];

      const result = detectQuantityThresholdConflicts(tiers);
      expect(result.warnings).toContain('Tier 1: Very high minimum quantity (1500) - may limit customer adoption');
    });

    test('should warn about very high maximum quantities', () => {
      const tiers = [
        {
          minQuantity: 5,
          maxQuantity: 15000,
          discountType: 'percentage',
          discountValue: 10
        }
      ];

      const result = detectQuantityThresholdConflicts(tiers);
      expect(result.warnings).toContain('Tier 1: Very high maximum quantity (15000) - consider practical limits');
    });

    test('should detect gaps in quantity ranges', () => {
      const tiers = [
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

      const result = detectQuantityThresholdConflicts(tiers);
      expect(result.warnings).toContain('Tier 2: Gap in quantity ranges (9 to 15)');
    });

    test('should detect overlapping ranges', () => {
      const tiers = [
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

      const result = detectQuantityThresholdConflicts(tiers);
      expect(result.errors).toContain('Tier 2: Quantity ranges overlap with previous tier');
    });
  });

  describe('checkDataIntegrity', () => {
    test('should detect missing required fields', () => {
      const tiers = [
        {
          // Missing minQuantity
          maxQuantity: 9,
          discountType: 'percentage',
          discountValue: 10
        }
      ];

      const result = checkDataIntegrity(tiers, 100);
      expect(result.errors).toContain('Tier 1: minQuantity is required');
    });

    test('should detect invalid data types', () => {
      const tiers = [
        {
          minQuantity: '5', // Should be number
          maxQuantity: 9,
          discountType: 'percentage',
          discountValue: 10
        }
      ];

      const result = checkDataIntegrity(tiers, 100);
      expect(result.errors).toContain('Tier 1: minQuantity must be a number');
    });

    test('should detect invalid discount types', () => {
      const tiers = [
        {
          minQuantity: 5,
          maxQuantity: 9,
          discountType: 'invalid', // Invalid discount type
          discountValue: 10
        }
      ];

      const result = checkDataIntegrity(tiers, 100);
      expect(result.errors).toContain('Tier 1: discountType must be \'percentage\' or \'fixed\'');
    });

    test('should detect negative values', () => {
      const tiers = [
        {
          minQuantity: -5,
          maxQuantity: 9,
          discountType: 'percentage',
          discountValue: 10
        }
      ];

      const result = checkDataIntegrity(tiers, 100);
      expect(result.errors).toContain('Tier 1: minQuantity cannot be negative');
    });

    test('should detect percentage discount over 100%', () => {
      const tiers = [
        {
          minQuantity: 5,
          maxQuantity: 9,
          discountType: 'percentage',
          discountValue: 150 // Over 100%
        }
      ];

      const result = checkDataIntegrity(tiers, 100);
      expect(result.errors).toContain('Tier 1: Percentage discount cannot exceed 100%');
    });

    test('should detect fixed discount exceeding regular price', () => {
      const tiers = [
        {
          minQuantity: 5,
          maxQuantity: 9,
          discountType: 'fixed',
          discountValue: 150 // More than regular price
        }
      ];

      const result = checkDataIntegrity(tiers, 100);
      expect(result.errors).toContain('Tier 1: Fixed discount cannot exceed regular price');
    });
  });

  describe('validateBulkDiscount middleware', () => {
    test('should call next() for valid bulk discount', () => {
      req.body = {
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
        },
        regularPrice: 100
      };

      validateBulkDiscount(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.bulkDiscountValidation).toBeDefined();
      expect(req.bulkDiscountValidation.isValid).toBe(true);
    });

    test('should return error for invalid regular price', () => {
      req.body = {
        bulkDiscount: {
          enabled: true,
          tiers: []
        },
        regularPrice: -10 // Invalid price
      };

      validateBulkDiscount(req, res, next);

      expect(sendErrorResponse).toHaveBeenCalledWith(
        res,
        HTTP_STATUS.BAD_REQUEST,
        'Invalid regular price',
        ERROR_CODES.VALIDATION_FAILED,
        { errors: ['Regular price must be a positive number'] }
      );
      expect(next).not.toHaveBeenCalled();
    });

    test('should return error for invalid bulk discount', () => {
      req.body = {
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
        },
        regularPrice: 100
      };

      validateBulkDiscount(req, res, next);

      expect(sendErrorResponse).toHaveBeenCalledWith(
        res,
        HTTP_STATUS.BAD_REQUEST,
        'Bulk discount validation failed',
        ERROR_CODES.VALIDATION_FAILED,
        expect.objectContaining({
          errors: expect.arrayContaining(['Tier 1: minQuantity must be a positive number']),
          warnings: expect.any(Array),
          conflicts: expect.any(Object)
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    test('should handle internal server error', () => {
      req.body = null; // This will cause an error

      validateBulkDiscount(req, res, next);

      expect(sendErrorResponse).toHaveBeenCalledWith(
        res,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        'Internal server error during bulk discount validation',
        ERROR_CODES.INTERNAL_SERVER_ERROR
      );
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('validateBulkDiscountForProduct middleware', () => {
    test('should skip validation when no bulk discount provided', () => {
      req.body = {
        regularPrice: 100
        // No bulkDiscount
      };

      validateBulkDiscountForProduct(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('should validate bulk discount when provided', () => {
      req.body = {
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
        },
        regularPrice: 100
      };
      req.params.id = 'product123';

      validateBulkDiscountForProduct(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.bulkDiscountValidation).toBeDefined();
    });

    test('should return error for invalid regular price', () => {
      req.body = {
        bulkDiscount: {
          enabled: true,
          tiers: []
        },
        regularPrice: 0 // Invalid price
      };

      validateBulkDiscountForProduct(req, res, next);

      expect(sendErrorResponse).toHaveBeenCalledWith(
        res,
        HTTP_STATUS.BAD_REQUEST,
        'Invalid regular price',
        ERROR_CODES.VALIDATION_FAILED,
        { errors: ['Regular price must be a positive number'] }
      );
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('validateBulkDiscountConfig utility', () => {
    test('should work as wrapper function', () => {
      const result = validateBulkDiscountConfig(null, 100);
      expect(result.isValid).toBe(true);
    });

    test('should pass through all parameters', () => {
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

      const result = validateBulkDiscountConfig(bulkDiscount, 100, 'product123');
      expect(result.isValid).toBe(true);
    });
  });
});
