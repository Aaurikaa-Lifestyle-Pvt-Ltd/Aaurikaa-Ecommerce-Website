/**
 * Invoice Controller Tests
 * Tests for invoice generation with bulk discount information
 */

const mongoose = require('mongoose');
const Product = require('../../models/Product');
const Order = require('../../models/Order');
const Shopper = require('../../models/Shopper');

describe('Invoice Generation with Bulk Discounts', () => {
  let testProduct1, testProduct2, testShopper, testOrder;

  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test-multi-vendor-ecommerce');
    }
  });

  beforeEach(async () => {
    // Clear collections
    await Product.deleteMany({});
    await Order.deleteMany({});
    await Shopper.deleteMany({});

    // Create test shopper
    testShopper = new Shopper({
      firstName: 'Test',
      lastName: 'Shopper',
      username: 'testshopper',
      email: 'test@example.com',
      password: 'password123',
      phone: '1234567890'
    });
    await testShopper.save();

    // Create test products with bulk discounts
    testProduct1 = new Product({
      name: 'Bulk Product 1',
      sku: 'BULK-001',
      regularPrice: 100,
      salePrice: 90,
      stock: 50,
      bulkDiscount: {
        enabled: true,
        tiers: [
          { minQuantity: 5, maxQuantity: 10, discountType: 'percentage', discountValue: 10 },
          { minQuantity: 11, maxQuantity: 20, discountType: 'percentage', discountValue: 15 }
        ]
      }
    });
    await testProduct1.save();

    testProduct2 = new Product({
      name: 'Bulk Product 2',
      sku: 'BULK-002',
      regularPrice: 200,
      salePrice: 180,
      stock: 30,
      bulkDiscount: {
        enabled: true,
        tiers: [
          { minQuantity: 3, maxQuantity: 5, discountType: 'fixed', discountValue: 20 },
          { minQuantity: 6, maxQuantity: '', discountType: 'fixed', discountValue: 50 }
        ]
      }
    });
    await testProduct2.save();

    // Create test order with bulk discounts
    testOrder = new Order({
      buyer: testShopper._id,
      items: [
        {
          product: testProduct1._id,
          quantity: 6,
          price: 81, // After 10% discount
          originalPrice: 90,
          bulkDiscount: {
            applied: true,
            discountAmount: 9,
            discountPercentage: 10,
            tierUsed: {
              minQuantity: 5,
              maxQuantity: 10,
              discountType: 'percentage',
              discountValue: 10
            }
          }
        },
        {
          product: testProduct2._id,
          quantity: 4,
          price: 160, // After ₹20 fixed discount
          originalPrice: 180,
          bulkDiscount: {
            applied: true,
            discountAmount: 20,
            discountPercentage: 11.11,
            tierUsed: {
              minQuantity: 3,
              maxQuantity: 5,
              discountType: 'fixed',
              discountValue: 20
            }
          }
        }
      ],
      totalAmount: 1126, // (81 * 6) + (160 * 4)
      bulkDiscountSummary: {
        totalOriginalAmount: 1260, // (90 * 6) + (180 * 4)
        totalDiscountAmount: 134, // (9 * 6) + (20 * 4)
        totalDiscountPercentage: 10.63,
        itemsWithBulkDiscount: 2
      },
      paymentMethod: 'cod',
      status: 'pending_verification'
    });
    await testOrder.save();
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('Order Data for Invoice Generation', () => {
    test('should have proper bulk discount data structure for invoice', async () => {
      const order = await Order.findById(testOrder._id)
        .populate('items.product', 'name regularPrice salePrice')
        .populate('buyer', 'firstName lastName email');

      expect(order).toBeDefined();
      expect(order.bulkDiscountSummary).toBeDefined();
      expect(order.bulkDiscountSummary.itemsWithBulkDiscount).toBe(2);
      expect(order.bulkDiscountSummary.totalDiscountAmount).toBe(134);
      expect(order.bulkDiscountSummary.totalOriginalAmount).toBe(1260);
      expect(order.bulkDiscountSummary.totalDiscountPercentage).toBeCloseTo(10.63, 1);
    });

    test('should have item-level bulk discount information', async () => {
      const order = await Order.findById(testOrder._id)
        .populate('items.product', 'name regularPrice salePrice');

      // Debug: Check order structure
      expect(order.items).toHaveLength(2);
      
      // Verify first item bulk discount (by index since we know the order)
      const item1 = order.items[0];
      expect(item1.bulkDiscount.applied).toBe(true);
      expect(item1.bulkDiscount.discountAmount).toBe(9);
      expect(item1.bulkDiscount.discountPercentage).toBe(10);
      expect(item1.originalPrice).toBe(90);
      expect(item1.price).toBe(81);
      expect(item1.bulkDiscount.tierUsed).toBeDefined();
      expect(item1.bulkDiscount.tierUsed.discountType).toBe('percentage');
      expect(item1.bulkDiscount.tierUsed.discountValue).toBe(10);

      // Verify second item bulk discount (by index)
      const item2 = order.items[1];
      expect(item2.bulkDiscount.applied).toBe(true);
      expect(item2.bulkDiscount.discountAmount).toBe(20);
      expect(item2.bulkDiscount.discountPercentage).toBeCloseTo(11.11, 1);
      expect(item2.originalPrice).toBe(180);
      expect(item2.price).toBe(160);
      expect(item2.bulkDiscount.tierUsed).toBeDefined();
      expect(item2.bulkDiscount.tierUsed.discountType).toBe('fixed');
      expect(item2.bulkDiscount.tierUsed.discountValue).toBe(20);
    });

    test('should calculate correct totals for invoice', async () => {
      const order = await Order.findById(testOrder._id);

      // Verify individual item totals
      const item1Total = order.items[0].price * order.items[0].quantity; // 81 * 6 = 486
      const item2Total = order.items[1].price * order.items[1].quantity; // 160 * 4 = 640
      const expectedOrderTotal = item1Total + item2Total; // 1126

      expect(item1Total).toBe(486);
      expect(item2Total).toBe(640);
      expect(order.totalAmount).toBe(expectedOrderTotal);
      expect(order.totalAmount).toBe(1126);
    });

    test('should handle order without bulk discounts', async () => {
      // Create order without bulk discounts
      const regularOrder = new Order({
        buyer: testShopper._id,
        items: [
          {
            product: testProduct1._id,
            quantity: 2, // Below bulk discount threshold
            price: 90,
            originalPrice: 90,
            bulkDiscount: {
              applied: false,
              discountAmount: 0,
              discountPercentage: 0,
              tierUsed: null
            }
          }
        ],
        totalAmount: 180,
        bulkDiscountSummary: {
          totalOriginalAmount: 180,
          totalDiscountAmount: 0,
          totalDiscountPercentage: 0,
          itemsWithBulkDiscount: 0
        },
        paymentMethod: 'cod',
        status: 'pending_verification'
      });
      await regularOrder.save();

      const order = await Order.findById(regularOrder._id)
        .populate('items.product', 'name regularPrice salePrice');

      expect(order.bulkDiscountSummary.itemsWithBulkDiscount).toBe(0);
      expect(order.bulkDiscountSummary.totalDiscountAmount).toBe(0);
      expect(order.items[0].bulkDiscount.applied).toBe(false);
      expect(order.items[0].bulkDiscount.discountAmount).toBe(0);
    });

    test('should handle mixed bulk discount and regular items', async () => {
      // Create a product without bulk discounts
      const regularProduct = new Product({
        name: 'Regular Product',
        sku: 'REG-001',
        regularPrice: 50,
        salePrice: 45,
        stock: 100,
        bulkDiscount: {
          enabled: false,
          tiers: []
        }
      });
      await regularProduct.save();

      const mixedOrder = new Order({
        buyer: testShopper._id,
        items: [
          {
            product: testProduct1._id,
            quantity: 6,
            price: 81, // With bulk discount
            originalPrice: 90,
            bulkDiscount: {
              applied: true,
              discountAmount: 9,
              discountPercentage: 10,
              tierUsed: {
                minQuantity: 5,
                maxQuantity: 10,
                discountType: 'percentage',
                discountValue: 10
              }
            }
          },
          {
            product: regularProduct._id,
            quantity: 3,
            price: 45, // No bulk discount
            originalPrice: 45,
            bulkDiscount: {
              applied: false,
              discountAmount: 0,
              discountPercentage: 0,
              tierUsed: null
            }
          }
        ],
        totalAmount: 621, // (81 * 6) + (45 * 3)
        bulkDiscountSummary: {
          totalOriginalAmount: 675, // (90 * 6) + (45 * 3)
          totalDiscountAmount: 54, // (9 * 6) + (0 * 3)
          totalDiscountPercentage: 8,
          itemsWithBulkDiscount: 1
        },
        paymentMethod: 'cod',
        status: 'pending_verification'
      });
      await mixedOrder.save();

      const order = await Order.findById(mixedOrder._id)
        .populate('items.product', 'name regularPrice salePrice');

      expect(order.bulkDiscountSummary.itemsWithBulkDiscount).toBe(1);
      expect(order.bulkDiscountSummary.totalDiscountAmount).toBe(54);
      expect(order.totalAmount).toBe(621);

      // Verify bulk discount item
      const bulkItem = order.items.find(item => item.bulkDiscount.applied);
      expect(bulkItem.bulkDiscount.discountAmount).toBe(9);
      expect(bulkItem.price).toBe(81);

      // Verify regular item
      const regularItem = order.items.find(item => !item.bulkDiscount.applied);
      expect(regularItem.bulkDiscount.discountAmount).toBe(0);
      expect(regularItem.price).toBe(45);
    });
  });

  describe('Invoice Data Validation', () => {
    test('should validate bulk discount calculations match order totals', async () => {
      const order = await Order.findById(testOrder._id);

      // Calculate expected values
      const expectedOriginalTotal = order.items.reduce((sum, item) => sum + (item.originalPrice * item.quantity), 0);
      const expectedDiscountTotal = order.items.reduce((sum, item) => sum + (item.bulkDiscount.discountAmount * item.quantity), 0);
      const expectedFinalTotal = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const expectedDiscountPercentage = expectedOriginalTotal > 0 ? (expectedDiscountTotal / expectedOriginalTotal) * 100 : 0;

      // Verify calculations match stored values
      expect(order.bulkDiscountSummary.totalOriginalAmount).toBe(expectedOriginalTotal);
      expect(order.bulkDiscountSummary.totalDiscountAmount).toBe(expectedDiscountTotal);
      expect(order.totalAmount).toBe(expectedFinalTotal);
      expect(order.bulkDiscountSummary.totalDiscountPercentage).toBeCloseTo(expectedDiscountPercentage, 1);
    });

    test('should ensure all bulk discount items have proper tier information', async () => {
      const order = await Order.findById(testOrder._id);

      order.items.forEach(item => {
        if (item.bulkDiscount.applied) {
          expect(item.bulkDiscount.tierUsed).toBeDefined();
          expect(item.bulkDiscount.tierUsed.discountType).toBeDefined();
          expect(item.bulkDiscount.tierUsed.discountValue).toBeDefined();
          expect(item.bulkDiscount.discountAmount).toBeGreaterThan(0);
          expect(item.bulkDiscount.discountPercentage).toBeGreaterThan(0);
        } else {
          expect(item.bulkDiscount.discountAmount).toBe(0);
          expect(item.bulkDiscount.discountPercentage).toBe(0);
          expect(item.bulkDiscount.tierUsed).toBeNull();
        }
      });
    });
  });
});
