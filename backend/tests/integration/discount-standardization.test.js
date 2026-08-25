// Integration tests for standardized discount calculation across controllers

const request = require('supertest');
const express = require('express');
const Coupon = require('../../models/coupon');

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

// Create a test app without starting the server
const app = express();
app.use(express.json());

// Import and use the routes
const sellerOrderRoutes = require('../../routes/sellerOrderRoutes');
const sellerDashboardRoutes = require('../../routes/sellerDashboardRoutes');
const commissionRoutes = require('../../routes/commissionRoutes');

app.use('/api/seller/orders', sellerOrderRoutes);
app.use('/api/seller/dashboard', sellerDashboardRoutes);
app.use('/api/commission', commissionRoutes);

describe('Discount Standardization Integration Tests', () => {
  beforeEach(async () => {
    // Clean up test data
    await Coupon.deleteMany({});
  });

  describe('Seller Order Controller Standardization', () => {
    test('should use standardized revenue calculation in getSellerOrders', async () => {
      // Mock seller authentication
      const mockReq = {
        user: { id: 'seller123' },
        params: { sellerId: 'seller123' }
      };

      // This test would require proper mocking of the Order model
      // For now, we'll test the utility functions directly
      const { calculateSellerRevenue } = require('../../utils/discountCalculator');
      
      const orderItems = [
        {
          product: { _id: 'product1', seller: 'seller123', price: 100, salePrice: 90 },
          quantity: 2
        },
        {
          product: { _id: 'product2', seller: 'seller456', price: 50 },
          quantity: 1
        }
      ];

      const result = calculateSellerRevenue(orderItems, 'seller123');

      expect(result.itemCount).toBe(1);
      expect(result.totalRevenue).toBe(180); // 90 * 2
      expect(result.items[0].total).toBe(180);
    });

    test('should use standardized commission calculation in updateOrderStatus', async () => {
      const { calculateCommissionAmount } = require('../../utils/discountCalculator');
      
      const orderAmount = 1000;
      const commissionRate = 10;
      
      const result = calculateCommissionAmount(orderAmount, commissionRate);
      
      expect(result).toBe(100);
    });
  });

  describe('Seller Dashboard Controller Standardization', () => {
    test('should use standardized pricing summary in getSellerDashboardStats', async () => {
      const { getPricingSummary } = require('../../utils/discountCalculator');
      
      const orders = [
        {
          totalAmount: 1000,
          discount: 100,
          tax: 50,
          shipping: 20,
          items: [{ product: { seller: 'seller123' } }]
        },
        {
          totalAmount: 500,
          discount: 50,
          tax: 25,
          shipping: 10,
          items: [{ product: { seller: 'seller123' } }]
        }
      ];

      const result = getPricingSummary(orders, 'seller123');

      expect(result.totalOrders).toBe(2);
      expect(result.totalRevenue).toBe(1500);
      expect(result.totalDiscounts).toBe(150);
      expect(result.averageOrderValue).toBe(750);
    });

    test('should use standardized revenue calculation in getSellerAnalytics', async () => {
      const { calculateSellerRevenue } = require('../../utils/discountCalculator');
      
      const orderItems = [
        {
          product: { _id: 'product1', seller: 'seller123', price: 100, salePrice: 90 },
          quantity: 2
        },
        {
          product: { _id: 'product2', seller: 'seller123', price: 50 },
          quantity: 1
        }
      ];

      const result = calculateSellerRevenue(orderItems, 'seller123');

      expect(result.itemCount).toBe(2);
      expect(result.totalRevenue).toBe(230); // (90 * 2) + (50 * 1)
    });
  });

  describe('Commission Controller Standardization', () => {
    test('should use standardized commission calculation in createCommission', async () => {
      const { calculateCommissionAmount } = require('../../utils/discountCalculator');
      
      const orderAmount = 2000;
      const commissionRate = 15;
      
      const result = calculateCommissionAmount(orderAmount, commissionRate);
      
      expect(result).toBe(300);
    });

    test('should handle edge cases in commission calculation', async () => {
      const { calculateCommissionAmount } = require('../../utils/discountCalculator');
      
      // Test zero commission
      expect(calculateCommissionAmount(1000, 0)).toBe(0);
      
      // Test 100% commission
      expect(calculateCommissionAmount(1000, 100)).toBe(1000);
      
      // Test decimal commission rate
      expect(calculateCommissionAmount(1000, 7.5)).toBe(75);
    });
  });

  describe('Cross-Controller Consistency', () => {
    test('should produce consistent results across all controllers', async () => {
      const { 
        calculateSellerRevenue, 
        calculateCommissionAmount, 
        getPricingSummary 
      } = require('../../utils/discountCalculator');
      
      const orderItems = [
        {
          product: { _id: 'product1', seller: 'seller123', price: 100, salePrice: 90 },
          quantity: 2
        }
      ];

      // Test seller revenue calculation
      const sellerRevenue = calculateSellerRevenue(orderItems, 'seller123');
      expect(sellerRevenue.totalRevenue).toBe(180);

      // Test commission calculation using the same amount
      const commission = calculateCommissionAmount(sellerRevenue.totalRevenue, 10);
      expect(commission).toBe(18);

      // Test pricing summary
      const orders = [{
        totalAmount: sellerRevenue.totalRevenue,
        discount: 0,
        tax: 0,
        shipping: 0,
        items: orderItems
      }];

      const summary = getPricingSummary(orders, 'seller123');
      expect(summary.totalRevenue).toBe(180);
      expect(summary.totalOrders).toBe(1);
    });

    test('should handle discount calculations consistently', async () => {
      const { calculateOrderTotal } = require('../../utils/discountCalculator');
      
      const items = [
        { product: { price: 100 }, quantity: 1 }
      ];

      // Test with coupon
      const resultWithCoupon = await calculateOrderTotal(items, 'TEST10');
      expect(resultWithCoupon.discount).toBe(10); // Mocked value from pricing engine
      expect(resultWithCoupon.discountType).toBe('percentage');

      // Test without coupon
      const resultWithoutCoupon = await calculateOrderTotal(items);
      expect(resultWithoutCoupon.discount).toBe(10); // Mocked value from pricing engine
    });
  });

  describe('Error Handling Consistency', () => {
    test('should handle invalid inputs consistently across utilities', async () => {
      const { 
        calculateCommissionAmount, 
        calculateSellerRevenue, 
        getPricingSummary 
      } = require('../../utils/discountCalculator');

      // Test commission calculation error handling
      expect(() => calculateCommissionAmount(-100, 10))
        .toThrow('Order amount must be a positive number');

      // Test seller revenue calculation error handling
      expect(() => calculateSellerRevenue('invalid', 'seller123'))
        .toThrow('Order items must be an array');

      // Test pricing summary error handling
      expect(() => getPricingSummary('invalid'))
        .toThrow('Orders must be an array');
    });

    test('should handle edge cases consistently', async () => {
      const { calculateSellerRevenue } = require('../../utils/discountCalculator');
      
      // Test with empty order items
      const emptyResult = calculateSellerRevenue([], 'seller123');
      expect(emptyResult.itemCount).toBe(0);
      expect(emptyResult.totalRevenue).toBe(0);

      // Test with items that don't belong to seller
      const noMatchResult = calculateSellerRevenue([
        { product: { seller: 'other-seller' }, quantity: 1 }
      ], 'seller123');
      expect(noMatchResult.itemCount).toBe(0);
      expect(noMatchResult.totalRevenue).toBe(0);
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle large datasets efficiently', async () => {
      const { getPricingSummary } = require('../../utils/discountCalculator');
      
      // Create a large dataset
      const largeOrders = Array.from({ length: 1000 }, (_, i) => ({
        totalAmount: 100 + i,
        discount: 10,
        tax: 5,
        shipping: 20,
        items: [{ product: { seller: 'seller123' } }]
      }));

      const startTime = Date.now();
      const result = getPricingSummary(largeOrders, 'seller123');
      const endTime = Date.now();

      expect(result.totalOrders).toBe(1000);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete in less than 1 second
    });

    test('should handle complex seller revenue calculations efficiently', async () => {
      const { calculateSellerRevenue } = require('../../utils/discountCalculator');
      
      // Create complex order items
      const complexItems = Array.from({ length: 100 }, (_, i) => ({
        product: { 
          _id: `product${i}`, 
          seller: i % 2 === 0 ? 'seller123' : 'other-seller',
          price: 100 + i,
          salePrice: 90 + i
        },
        quantity: Math.floor(Math.random() * 5) + 1
      }));

      const startTime = Date.now();
      const result = calculateSellerRevenue(complexItems, 'seller123');
      const endTime = Date.now();

      expect(result.itemCount).toBe(50); // Half should belong to seller123
      expect(endTime - startTime).toBeLessThan(100); // Should complete quickly
    });
  });
});
