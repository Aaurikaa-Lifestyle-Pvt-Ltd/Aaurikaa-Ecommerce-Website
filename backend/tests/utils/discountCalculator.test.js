// Tests for Standardized Discount Calculation Utility

const {
  calculateOrderTotal,
  calculateCommissionAmount,
  calculateSellerRevenue,
  calculateProductTotal,
  validateDiscountApplication,
  getPricingSummary
} = require('../../utils/discountCalculator');

// Mock the pricing engine
jest.mock('../../utils/pricingEngine', () => ({
  calculatePricing: jest.fn().mockResolvedValue({
    subtotal: 100,
    discount: { total: 10, type: 'percentage', value: 10 },
    tax: { amount: 5 },
    shipping: { amount: 20 },
    total: 115,
    breakdown: { subtotal: 100, discount: 10, tax: 5, shipping: 20, total: 115 },
    metadata: { calculatedAt: new Date(), cartItemCount: 1 }
  }),
  validateCoupon: jest.fn().mockResolvedValue({
    valid: true,
    message: 'Coupon applied successfully',
    coupon: { code: 'TEST10', discountType: 'percentage', discountValue: 10 }
  })
}));

describe('Discount Calculator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateOrderTotal', () => {
    test('should calculate order total with standardized pricing', async () => {
      const items = [
        { product: { price: 50 }, quantity: 2 },
        { product: { price: 30 }, quantity: 1 }
      ];

      const result = await calculateOrderTotal(items, 'TEST10');

      expect(result.subtotal).toBe(100);
      expect(result.discount).toBe(10);
      expect(result.discountType).toBe('percentage');
      expect(result.discountValue).toBe(10);
      expect(result.tax).toBe(5);
      expect(result.shipping).toBe(20);
      expect(result.total).toBe(115);
    });

    test('should handle empty items array', async () => {
      const result = await calculateOrderTotal([]);

      expect(result.subtotal).toBe(100);
      expect(result.total).toBe(115);
    });

    test('should handle items without product object', async () => {
      const items = [
        { price: 50, quantity: 2 }
      ];

      const result = await calculateOrderTotal(items);

      expect(result.subtotal).toBe(100);
      expect(result.total).toBe(115);
    });
  });

  describe('calculateCommissionAmount', () => {
    test('should calculate commission amount correctly', () => {
      const result = calculateCommissionAmount(1000, 10);
      expect(result).toBe(100);
    });

    test('should round commission to 2 decimal places', () => {
      const result = calculateCommissionAmount(1000, 7.5);
      expect(result).toBe(75);
    });

    test('should handle zero commission rate', () => {
      const result = calculateCommissionAmount(1000, 0);
      expect(result).toBe(0);
    });

    test('should handle 100% commission rate', () => {
      const result = calculateCommissionAmount(1000, 100);
      expect(result).toBe(1000);
    });

    test('should throw error for invalid order amount', () => {
      expect(() => calculateCommissionAmount(-100, 10)).toThrow('Order amount must be a positive number');
      expect(() => calculateCommissionAmount(0, 10)).toThrow('Order amount must be a positive number');
      expect(() => calculateCommissionAmount('invalid', 10)).toThrow('Order amount must be a positive number');
    });

    test('should throw error for invalid commission rate', () => {
      expect(() => calculateCommissionAmount(1000, -10)).toThrow('Commission rate must be between 0 and 100');
      expect(() => calculateCommissionAmount(1000, 150)).toThrow('Commission rate must be between 0 and 100');
      expect(() => calculateCommissionAmount(1000, 'invalid')).toThrow('Commission rate must be between 0 and 100');
    });
  });

  describe('calculateSellerRevenue', () => {
    test('should calculate seller revenue correctly', () => {
      const orderItems = [
        {
          product: { _id: 'product1', seller: 'seller1', price: 100, salePrice: 90 },
          quantity: 2
        },
        {
          product: { _id: 'product2', seller: 'seller2', price: 50 },
          quantity: 1
        },
        {
          product: { _id: 'product3', seller: 'seller1', price: 30 },
          quantity: 3
        }
      ];

      const result = calculateSellerRevenue(orderItems, 'seller1');

      expect(result.itemCount).toBe(2);
      expect(result.totalRevenue).toBe(270); // (90 * 2) + (30 * 3)
      expect(result.items).toHaveLength(2);
      expect(result.items[0].total).toBe(180); // 90 * 2
      expect(result.items[1].total).toBe(90); // 30 * 3
    });

    test('should handle items without seller', () => {
      const orderItems = [
        {
          product: { _id: 'product1', price: 100 },
          quantity: 2
        }
      ];

      const result = calculateSellerRevenue(orderItems, 'seller1');

      expect(result.itemCount).toBe(0);
      expect(result.totalRevenue).toBe(0);
      expect(result.items).toHaveLength(0);
    });

    test('should handle items with different quantity field names', () => {
      const orderItems = [
        {
          product: { _id: 'product1', seller: 'seller1', price: 100 },
          qty: 2
        }
      ];

      const result = calculateSellerRevenue(orderItems, 'seller1');

      expect(result.itemCount).toBe(1);
      expect(result.totalRevenue).toBe(200);
    });

    test('should throw error for invalid order items', () => {
      expect(() => calculateSellerRevenue('invalid', 'seller1')).toThrow('Order items must be an array');
      expect(() => calculateSellerRevenue(null, 'seller1')).toThrow('Order items must be an array');
    });
  });

  describe('calculateProductTotal', () => {
    test('should calculate product total with pricing engine', async () => {
      const product = { _id: 'product1', price: 100, salePrice: 90 };
      const quantity = 2;

      const result = await calculateProductTotal(product, quantity, 'TEST10');

      expect(result.productId).toBe('product1');
      expect(result.quantity).toBe(2);
      expect(result.unitPrice).toBe(90);
      expect(result.subtotal).toBe(100);
      expect(result.discount).toBe(10);
      expect(result.tax).toBe(5);
      expect(result.shipping).toBe(20);
      expect(result.total).toBe(115);
    });

    test('should handle product without salePrice', async () => {
      const product = { _id: 'product1', price: 100 };
      const quantity = 1;

      const result = await calculateProductTotal(product, quantity);

      expect(result.unitPrice).toBe(100);
      expect(result.subtotal).toBe(100);
    });
  });

  describe('validateDiscountApplication', () => {
    test('should validate valid coupon', async () => {
      const result = await validateDiscountApplication('TEST10', 1000);

      expect(result.valid).toBe(true);
      expect(result.message).toBe('Coupon applied successfully');
      expect(result.coupon.code).toBe('TEST10');
    });

    test('should handle no coupon code', async () => {
      const result = await validateDiscountApplication(null, 1000);

      expect(result.valid).toBe(true);
      expect(result.message).toBe('No coupon applied');
    });

    test('should handle invalid coupon', async () => {
      const { validateCoupon } = require('../../utils/pricingEngine');
      validateCoupon.mockResolvedValueOnce({
        valid: false,
        message: 'Invalid coupon code'
      });

      const result = await validateDiscountApplication('INVALID', 1000);

      expect(result.valid).toBe(false);
      expect(result.message).toBe('Invalid coupon code');
      expect(result.error).toBe('INVALID_COUPON');
    });
  });

  describe('getPricingSummary', () => {
    test('should calculate pricing summary for orders', () => {
      const orders = [
        {
          totalAmount: 1000,
          discount: 100,
          tax: 50,
          shipping: 20,
          items: [{ product: { seller: 'seller1' } }]
        },
        {
          totalAmount: 500,
          discount: 50,
          tax: 25,
          shipping: 10,
          items: [{ product: { seller: 'seller1' } }]
        }
      ];

      const result = getPricingSummary(orders);

      expect(result.totalOrders).toBe(2);
      expect(result.totalRevenue).toBe(1500);
      expect(result.totalDiscounts).toBe(150);
      expect(result.totalTax).toBe(75);
      expect(result.totalShipping).toBe(30);
      expect(result.averageOrderValue).toBe(750);
    });

    test('should filter by seller ID', () => {
      const orders = [
        {
          totalAmount: 1000,
          discount: 100,
          tax: 50,
          shipping: 20,
          items: [{ product: { seller: 'seller1' } }]
        },
        {
          totalAmount: 500,
          discount: 50,
          tax: 25,
          shipping: 10,
          items: [{ product: { seller: 'seller2' } }]
        }
      ];

      const result = getPricingSummary(orders, 'seller1');

      expect(result.totalOrders).toBe(1);
      expect(result.totalRevenue).toBe(1000);
      expect(result.totalDiscounts).toBe(100);
    });

    test('should handle orders with missing pricing fields', () => {
      const orders = [
        {
          totalAmount: 1000,
          items: [{ product: { seller: 'seller1' } }]
        }
      ];

      const result = getPricingSummary(orders);

      expect(result.totalOrders).toBe(1);
      expect(result.totalRevenue).toBe(1000);
      expect(result.totalDiscounts).toBe(0);
      expect(result.totalTax).toBe(0);
      expect(result.totalShipping).toBe(0);
    });

    test('should handle empty orders array', () => {
      const result = getPricingSummary([]);

      expect(result.totalOrders).toBe(0);
      expect(result.totalRevenue).toBe(0);
      expect(result.averageOrderValue).toBe(0);
    });

    test('should throw error for invalid orders', () => {
      expect(() => getPricingSummary('invalid')).toThrow('Orders must be an array');
      expect(() => getPricingSummary(null)).toThrow('Orders must be an array');
    });
  });

  describe('Error Handling', () => {
    test('should handle pricing engine errors in calculateOrderTotal', async () => {
      const { calculatePricing } = require('../../utils/pricingEngine');
      calculatePricing.mockRejectedValueOnce(new Error('Pricing engine error'));

      await expect(calculateOrderTotal([{ product: { price: 100 }, quantity: 1 }]))
        .rejects.toThrow('Order total calculation failed: Pricing engine error');
    });

    test('should handle pricing engine errors in calculateProductTotal', async () => {
      const { calculatePricing } = require('../../utils/pricingEngine');
      calculatePricing.mockRejectedValueOnce(new Error('Pricing engine error'));

      await expect(calculateProductTotal({ _id: 'product1', price: 100 }, 1))
        .rejects.toThrow('Product total calculation failed: Pricing engine error');
    });

    test('should handle validation errors in validateDiscountApplication', async () => {
      const { validateCoupon } = require('../../utils/pricingEngine');
      validateCoupon.mockRejectedValueOnce(new Error('Validation error'));

      const result = await validateDiscountApplication('TEST10', 1000);

      expect(result.valid).toBe(false);
      expect(result.message).toBe('Error validating discount');
      expect(result.error).toBe('VALIDATION_ERROR');
    });
  });
});
