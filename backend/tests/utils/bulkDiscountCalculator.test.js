const {
  calculateBulkDiscount,
  findApplicableTier,
  calculateTierPrice,
  validateBulkDiscountConfig,
  getBulkDiscountTiersInfo,
  calculateOrderBulkDiscount
} = require('../../utils/bulkDiscountCalculator');

describe('Bulk Discount Calculator', () => {
  const mockProduct = {
    _id: 'product123',
    name: 'Test Product',
    regularPrice: 100,
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
    }
  };

  const mockProductNoDiscount = {
    _id: 'product456',
    name: 'No Discount Product',
    regularPrice: 50,
    bulkDiscount: {
      enabled: false
    }
  };

  describe('calculateBulkDiscount', () => {
    test('should return error for invalid inputs', () => {
      const result = calculateBulkDiscount(null, 5);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid product or quantity');

      const result2 = calculateBulkDiscount(mockProduct, -1);
      expect(result2.success).toBe(false);
      expect(result2.error).toBe('Invalid product or quantity');
    });

    test('should return regular price when bulk discount disabled', () => {
      const result = calculateBulkDiscount(mockProductNoDiscount, 10);
      expect(result.success).toBe(true);
      expect(result.originalPrice).toBe(50);
      expect(result.discountedPrice).toBe(50);
      expect(result.discount).toBe(0);
      expect(result.savings).toBe(0);
      expect(result.applicableTier).toBeNull();
    });

    test('should return regular price when no tiers configured', () => {
      const productNoTiers = {
        ...mockProduct,
        bulkDiscount: { enabled: true, tiers: [] }
      };
      const result = calculateBulkDiscount(productNoTiers, 10);
      expect(result.success).toBe(true);
      expect(result.originalPrice).toBe(100);
      expect(result.discountedPrice).toBe(100);
      expect(result.message).toBe('No bulk discount configured');
    });

    test('should return regular price when quantity below minimum', () => {
      const result = calculateBulkDiscount(mockProduct, 3);
      expect(result.success).toBe(true);
      expect(result.originalPrice).toBe(100);
      expect(result.discountedPrice).toBe(100);
      expect(result.message).toBe('No applicable tier found for this quantity');
    });

    test('should calculate percentage discount correctly', () => {
      const result = calculateBulkDiscount(mockProduct, 7);
      expect(result.success).toBe(true);
      expect(result.originalPrice).toBe(100);
      expect(result.discountedPrice).toBe(90); // 100 * (1 - 0.1)
      expect(result.discount).toBe(10);
      expect(result.discountType).toBe('percentage');
      expect(result.savings).toBe(10);
      expect(result.savingsPercentage).toBe(10);
      expect(result.quantity).toBe(7);
      expect(result.totalSavings).toBe(70); // 10 * 7
      expect(result.totalPrice).toBe(630); // 90 * 7
    });

    test('should calculate fixed discount correctly', () => {
      const result = calculateBulkDiscount(mockProduct, 25);
      expect(result.success).toBe(true);
      expect(result.originalPrice).toBe(100);
      expect(result.discountedPrice).toBe(70); // 100 - 30
      expect(result.discount).toBe(30);
      expect(result.discountType).toBe('fixed');
      expect(result.savings).toBe(30);
      expect(result.savingsPercentage).toBe(30);
      expect(result.totalSavings).toBe(750); // 30 * 25
      expect(result.totalPrice).toBe(1750); // 70 * 25
    });

    test('should handle tier with no maxQuantity', () => {
      const result = calculateBulkDiscount(mockProduct, 100);
      expect(result.success).toBe(true);
      expect(result.discountedPrice).toBe(70); // Should use the highest tier
      expect(result.applicableTier.minQuantity).toBe(20);
    });
  });

  describe('findApplicableTier', () => {
    const tiers = mockProduct.bulkDiscount.tiers;

    test('should return null for empty tiers', () => {
      expect(findApplicableTier([], 10)).toBeNull();
      expect(findApplicableTier(null, 10)).toBeNull();
    });

    test('should find correct tier for quantity', () => {
      expect(findApplicableTier(tiers, 7).minQuantity).toBe(5);
      expect(findApplicableTier(tiers, 15).minQuantity).toBe(10);
      expect(findApplicableTier(tiers, 25).minQuantity).toBe(20);
    });

    test('should return null for quantity below minimum', () => {
      expect(findApplicableTier(tiers, 3)).toBeNull();
    });

    test('should handle unsorted tiers', () => {
      const unsortedTiers = [
        { minQuantity: 20, discountType: 'fixed', discountValue: 30 },
        { minQuantity: 5, maxQuantity: 9, discountType: 'percentage', discountValue: 10 },
        { minQuantity: 10, maxQuantity: 19, discountType: 'percentage', discountValue: 20 }
      ];
      expect(findApplicableTier(unsortedTiers, 7).minQuantity).toBe(5);
    });
  });

  describe('calculateTierPrice', () => {
    test('should calculate percentage discount correctly', () => {
      const tier = { discountType: 'percentage', discountValue: 15 };
      expect(calculateTierPrice(100, tier)).toBe(85); // 100 * (1 - 0.15)
    });

    test('should calculate fixed discount correctly', () => {
      const tier = { discountType: 'fixed', discountValue: 25 };
      expect(calculateTierPrice(100, tier)).toBe(75); // 100 - 25
    });

    test('should not allow negative prices for fixed discount', () => {
      const tier = { discountType: 'fixed', discountValue: 150 };
      expect(calculateTierPrice(100, tier)).toBe(0);
    });

    test('should return original price for invalid tier', () => {
      expect(calculateTierPrice(100, null)).toBe(100);
      expect(calculateTierPrice(100, {})).toBe(100);
      expect(calculateTierPrice(100, { discountType: 'invalid' })).toBe(100);
    });
  });

  describe('validateBulkDiscountConfig', () => {
    test('should return valid for null config', () => {
      const result = validateBulkDiscountConfig(null, 100);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('should return valid for disabled config', () => {
      const result = validateBulkDiscountConfig({ enabled: false }, 100);
      expect(result.isValid).toBe(true);
    });

    test('should return invalid for enabled config with no tiers', () => {
      const result = validateBulkDiscountConfig({ enabled: true }, 100);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Bulk discount is enabled but no tiers are configured');
    });

    test('should validate tier structure', () => {
      const invalidConfig = {
        enabled: true,
        tiers: [
          {
            minQuantity: -1,
            maxQuantity: 'invalid',
            discountType: 'invalid',
            discountValue: -5
          }
        ]
      };
      const result = validateBulkDiscountConfig(invalidConfig, 100);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should detect overlapping ranges', () => {
      const overlappingConfig = {
        enabled: true,
        tiers: [
          { minQuantity: 5, maxQuantity: 10, discountType: 'percentage', discountValue: 10 },
          { minQuantity: 8, maxQuantity: 15, discountType: 'percentage', discountValue: 15 }
        ]
      };
      const result = validateBulkDiscountConfig(overlappingConfig, 100);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Tier 2: Quantity ranges cannot overlap with previous tier');
    });

    test('should warn about gaps in ranges', () => {
      const gapConfig = {
        enabled: true,
        tiers: [
          { minQuantity: 5, maxQuantity: 9, discountType: 'percentage', discountValue: 10 },
          { minQuantity: 15, maxQuantity: 19, discountType: 'percentage', discountValue: 15 }
        ]
      };
      const result = validateBulkDiscountConfig(gapConfig, 100);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Tier 2: Gap in quantity ranges (10 to 14)');
    });
  });

  describe('getBulkDiscountTiersInfo', () => {
    test('should return empty array for product without bulk discount', () => {
      expect(getBulkDiscountTiersInfo(mockProductNoDiscount)).toEqual([]);
    });

    test('should return tier information for display', () => {
      const tiersInfo = getBulkDiscountTiersInfo(mockProduct);
      expect(tiersInfo).toHaveLength(3);
      
      expect(tiersInfo[0]).toMatchObject({
        minQuantity: 5,
        maxQuantity: 9,
        discountType: 'percentage',
        discountValue: 10,
        originalPrice: 100,
        discountedPrice: 90,
        savings: 10,
        savingsPercentage: 10,
        range: '5-9'
      });

      expect(tiersInfo[2]).toMatchObject({
        minQuantity: 20,
        maxQuantity: undefined,
        range: '20+'
      });
    });

    test('should sort tiers by minQuantity', () => {
      const unsortedProduct = {
        ...mockProduct,
        bulkDiscount: {
          enabled: true,
          tiers: [
            { minQuantity: 20, discountType: 'fixed', discountValue: 30 },
            { minQuantity: 5, maxQuantity: 9, discountType: 'percentage', discountValue: 10 },
            { minQuantity: 10, maxQuantity: 19, discountType: 'percentage', discountValue: 20 }
          ]
        }
      };
      const tiersInfo = getBulkDiscountTiersInfo(unsortedProduct);
      expect(tiersInfo[0].minQuantity).toBe(5);
      expect(tiersInfo[1].minQuantity).toBe(10);
      expect(tiersInfo[2].minQuantity).toBe(20);
    });
  });

  describe('calculateOrderBulkDiscount', () => {
    const orderItems = [
      {
        product: mockProduct,
        quantity: 7
      },
      {
        product: mockProductNoDiscount,
        quantity: 3
      }
    ];

    test('should return error for invalid input', () => {
      const result = calculateOrderBulkDiscount(null);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid order items');

      const result2 = calculateOrderBulkDiscount([]);
      expect(result2.success).toBe(false);
      expect(result2.error).toBe('Invalid order items');
    });

    test('should calculate total order discount', () => {
      const result = calculateOrderBulkDiscount(orderItems);
      expect(result.success).toBe(true);
      expect(result.itemCount).toBe(2);
      
      // First item: 7 * 90 = 630 (with 10% discount)
      // Second item: 3 * 50 = 150 (no discount)
      expect(result.totalDiscountedPrice).toBe(780);
      
      // First item: 7 * 100 = 700 (original)
      // Second item: 3 * 50 = 150 (original)
      expect(result.totalOriginalPrice).toBe(850);
      
      expect(result.totalSavings).toBe(70); // 700 - 630
      expect(result.totalSavingsPercentage).toBeCloseTo(8.24, 2); // 70/850 * 100
    });

    test('should include item-level discount details', () => {
      const result = calculateOrderBulkDiscount(orderItems);
      expect(result.itemDiscounts).toHaveLength(2);
      
      const firstItem = result.itemDiscounts[0];
      expect(firstItem.productName).toBe('Test Product');
      expect(firstItem.quantity).toBe(7);
      expect(firstItem.originalPrice).toBe(100);
      expect(firstItem.discountedPrice).toBe(90);
      expect(firstItem.savings).toBe(70); // 7 * 10
      
      const secondItem = result.itemDiscounts[1];
      expect(secondItem.productName).toBe('No Discount Product');
      expect(secondItem.originalPrice).toBe(50);
      expect(secondItem.discountedPrice).toBe(50);
      expect(secondItem.savings).toBe(0);
    });

    test('should handle items without products', () => {
      const invalidItems = [
        { quantity: 5 }, // No product
        { product: mockProduct }, // No quantity
        { product: mockProduct, quantity: 7 } // Valid
      ];
      
      const result = calculateOrderBulkDiscount(invalidItems);
      expect(result.success).toBe(true);
      expect(result.itemCount).toBe(1); // Only valid item
      expect(result.itemDiscounts).toHaveLength(1);
    });
  });
});
