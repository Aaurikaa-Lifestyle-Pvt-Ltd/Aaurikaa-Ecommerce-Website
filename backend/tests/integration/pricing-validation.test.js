// Integration tests for pricing validation across controllers

const {
  validateProductPricing,
  validateCartItems,
  validateCouponData,
  validateCommissionData,
  validatePricingResult,
  detectPricingConflicts,
  validatePricingDataIntegrity
} = require('../../utils/pricingValidator');

describe('Pricing Validation Integration Tests', () => {
  describe('Cross-Validation Integration', () => {
    test('should validate cart items consistently', () => {
      const invalidCartItems = [
        { product: { price: -100 }, quantity: 2 }, // Invalid price
        { quantity: 0 } // Missing product and invalid quantity
      ];

      const result = validateCartItems(invalidCartItems);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('price must be at least');
    });

    test('should validate product pricing consistently', () => {
      const invalidProduct = {
        regularPrice: -50,
        salePrice: 200, // Higher than regular price
        stock: -10,
        weight: 'invalid'
      };

      const result = validateProductPricing(invalidProduct);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('Regular price must be at least');
    });

    test('should validate pricing result integrity', () => {
      const invalidPricing = {
        subtotal: -100, // Invalid negative subtotal
        discount: { total: 150 }, // Discount higher than subtotal
        tax: { amount: -10 }, // Negative tax
        shipping: { amount: -5 }, // Negative shipping
        total: -50 // Negative total
      };

      const result = validatePricingResult(invalidPricing);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('Subtotal cannot be negative');
    });

    test('should handle valid cart items successfully', () => {
      const validCartItems = [
        { product: { price: 100 }, quantity: 2 },
        { product: { salePrice: 80 }, quantity: 1 }
      ];

      const result = validateCartItems(validCartItems);
      expect(result.isValid).toBe(true);
      expect(result.data.totalCartValue).toBe(280);
      expect(result.data.itemCount).toBe(2);
    });

    test('should handle valid product pricing successfully', () => {
      const validProduct = {
        regularPrice: 100,
        salePrice: 80,
        stock: 50,
        weight: 1.5,
        taxRate: 5
      };

      const result = validateProductPricing(validProduct);
      expect(result.isValid).toBe(true);
      expect(result.hasErrors()).toBe(false);
    });
  });

  describe('Coupon Validation Integration', () => {
    test('should validate coupon data consistently', () => {
      const invalidCoupon = {
        code: 'AB', // Too short
        discountType: 'invalid',
        discountValue: -10,
        minOrder: -50,
        validFrom: new Date('2024-12-31'),
        validTo: new Date('2024-01-01') // Invalid date range
      };

      const result = validateCouponData(invalidCoupon);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('Coupon code must be at least 3 characters');
    });

    test('should validate percentage discount range', () => {
      const invalidCoupon = {
        code: 'TEST150',
        discountType: 'percentage',
        discountValue: 150, // Exceeds 100%
        minOrder: 100
      };

      const result = validateCouponData(invalidCoupon);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('Percentage discount cannot exceed');
    });

    test('should validate fixed discount value', () => {
      const invalidCoupon = {
        code: 'TESTFIXED',
        discountType: 'fixed',
        discountValue: -50, // Negative discount
        minOrder: 100
      };

      const result = validateCouponData(invalidCoupon);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('Discount value must be at least');
    });

    test('should handle valid coupon data successfully', () => {
      const validCoupon = {
        code: 'TEST10',
        discountType: 'percentage',
        discountValue: 10,
        minOrder: 100,
        validFrom: new Date(),
        validTo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      };

      const result = validateCouponData(validCoupon);
      expect(result.isValid).toBe(true);
      expect(result.hasErrors()).toBe(false);
    });

    test('should warn about high discount percentage', () => {
      const couponWithHighDiscount = {
        code: 'HIGH90',
        discountType: 'percentage',
        discountValue: 90, // High but valid discount
        minOrder: 100
      };

      const result = validateCouponData(couponWithHighDiscount);
      expect(result.isValid).toBe(true);
      // Warning should be logged but not block the request
    });
  });

  describe('Commission Validation Integration', () => {
    test('should validate commission data consistently', () => {
      const invalidCommission = {
        orderAmount: -1000, // Negative order amount
        commissionRate: 150, // Exceeds 100%
        commissionAmount: -100
      };

      const result = validateCommissionData(invalidCommission);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('Order amount cannot be negative');
    });

    test('should validate commission calculation consistency', () => {
      const inconsistentCommission = {
        orderAmount: 1000,
        commissionRate: 10,
        commissionAmount: 200 // Should be 100
      };

      const result = validateCommissionData(inconsistentCommission);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('Commission amount (₹200) does not match calculated amount');
    });

    test('should handle valid commission data successfully', () => {
      const validCommission = {
        orderAmount: 1000,
        commissionRate: 10,
        commissionAmount: 100
      };

      const result = validateCommissionData(validCommission);
      expect(result.isValid).toBe(true);
      expect(result.hasErrors()).toBe(false);
    });
  });

  describe('Cross-Validation Consistency', () => {
    test('should maintain consistent validation across all validators', () => {
      // Test that all validators use the same validation rules
      const testData = {
        price: -100,
        quantity: 0,
        discountValue: -50,
        commissionRate: 150
      };

      // Test cart validation
      const cartResult = validateCartItems([{ product: { price: testData.price }, quantity: testData.quantity }]);
      expect(cartResult.isValid).toBe(false);

      // Test coupon validation
      const couponResult = validateCouponData({
        code: 'TEST',
        discountType: 'fixed',
        discountValue: testData.discountValue
      });
      expect(couponResult.isValid).toBe(false);

      // Test commission validation
      const commissionResult = validateCommissionData({
        orderAmount: 1000,
        commissionRate: testData.commissionRate
      });
      expect(commissionResult.isValid).toBe(false);

      // All should have validation errors
      expect(cartResult.hasErrors()).toBe(true);
      expect(couponResult.hasErrors()).toBe(true);
      expect(commissionResult.hasErrors()).toBe(true);
    });

    test('should handle validation warnings consistently', () => {
      // Test that warnings are logged but don't block validation
      const warningData = {
        product: { regularPrice: 100, salePrice: 5 }, // High discount
        coupon: { code: 'HIGH90', discountType: 'percentage', discountValue: 90 }
      };

      // Test product pricing with high discount
      const productResult = validateProductPricing(warningData.product);
      expect(productResult.isValid).toBe(true);
      expect(productResult.hasWarnings()).toBe(true);

      // Test coupon with high discount
      const couponResult = validateCouponData(warningData.coupon);
      expect(couponResult.isValid).toBe(true);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle malformed data gracefully', () => {
      const result = validateCartItems('not an array');
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('Cart items must be an array');
    });

    test('should handle missing required fields', () => {
      const result = validateProductPricing(null);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('Product is required');
    });

    test('should handle extreme values gracefully', () => {
      const extremeCart = [{ product: { price: 999999999 }, quantity: 999999999 }];
      const result = validateCartItems(extremeCart);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('quantity cannot exceed');
    });

    test('should handle concurrent validation efficiently', () => {
      const requests = Array(10).fill().map(() => 
        validateCartItems([{ product: { price: 100 }, quantity: 1 }])
      );

      // All validations should succeed
      requests.forEach(result => {
        expect(result.isValid).toBe(true);
      });
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle large cart validation efficiently', () => {
      const largeCart = Array(100).fill().map((_, index) => ({
        product: { price: 100 + index },
        quantity: 1
      }));

      const startTime = Date.now();
      const result = validateCartItems(largeCart);
      const endTime = Date.now();

      expect(result.isValid).toBe(true);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete in less than 1 second
    });

    test('should handle complex validation scenarios efficiently', () => {
      const complexData = {
        products: Array(50).fill().map((_, index) => ({
          price: 100 + index,
          salePrice: 80 + index,
          stock: 50 + index,
          weight: 1 + index * 0.1,
          taxRate: 5 + (index % 10)
        })),
        cartItems: Array(50).fill().map((_, index) => ({
          product: { price: 100 + index },
          quantity: 1 + (index % 5)
        })),
        coupons: Array(10).fill().map((_, index) => ({
          code: `COUPON${index}`,
          discountType: 'percentage',
          discountValue: 10 + index
        }))
      };

      const startTime = Date.now();
      const result = validatePricingDataIntegrity(complexData);
      const endTime = Date.now();

      expect(result.isValid).toBe(true);
      expect(endTime - startTime).toBeLessThan(2000); // Should complete in less than 2 seconds
    });
  });
});
