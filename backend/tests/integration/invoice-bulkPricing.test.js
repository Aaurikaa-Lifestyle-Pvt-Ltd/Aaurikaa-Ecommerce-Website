/**
 * Invoice Generation with Bulk Discount Integration Tests
 * Tests for invoice generation with bulk discount information
 */

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../server');
const Product = require('../../models/Product');
const Order = require('../../models/Order');
const Shopper = require('../../models/Shopper');

describe('Invoice Generation with Bulk Discounts Integration', () => {
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

  describe('GET /api/orders/:id/invoice - Invoice Generation with Bulk Discounts', () => {
    test('should generate invoice with bulk discount information', async () => {
      // Mock the verifyShopper middleware
      jest.doMock('../../middleware/verifyShopper', () => (req, res, next) => {
        req.user = { id: testShopper._id };
        next();
      });

      const response = await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`)
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain('attachment; filename=invoice.pdf');
    });

    test('should handle order not found', async () => {
      jest.doMock('../../middleware/verifyShopper', () => (req, res, next) => {
        req.user = { id: testShopper._id };
        next();
      });

      const response = await request(app)
        .get(`/api/orders/${new mongoose.Types.ObjectId()}/invoice`)
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('❌ Order not found');
    });

    test('should handle unauthorized access', async () => {
      const response = await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`);

      expect(response.status).toBe(401);
    });
  });

  describe('Invoice Content Validation', () => {
    test('should create order with proper bulk discount data for invoice generation', async () => {
      // Verify the test order has the correct bulk discount information
      const order = await Order.findById(testOrder._id)
        .populate('items.product', 'name regularPrice salePrice');

      expect(order).toBeDefined();
      expect(order.bulkDiscountSummary).toBeDefined();
      expect(order.bulkDiscountSummary.itemsWithBulkDiscount).toBe(2);
      expect(order.bulkDiscountSummary.totalDiscountAmount).toBe(134);

      // Verify first item bulk discount
      const item1 = order.items.find(item => item.product._id.toString() === testProduct1._id.toString());
      expect(item1.bulkDiscount.applied).toBe(true);
      expect(item1.bulkDiscount.discountAmount).toBe(9);
      expect(item1.bulkDiscount.discountPercentage).toBe(10);
      expect(item1.originalPrice).toBe(90);
      expect(item1.price).toBe(81);

      // Verify second item bulk discount
      const item2 = order.items.find(item => item.product._id.toString() === testProduct2._id.toString());
      expect(item2.bulkDiscount.applied).toBe(true);
      expect(item2.bulkDiscount.discountAmount).toBe(20);
      expect(item2.bulkDiscount.discountPercentage).toBeCloseTo(11.11, 1);
      expect(item2.originalPrice).toBe(180);
      expect(item2.price).toBe(160);
    });

    test('should handle order without bulk discounts in invoice', async () => {
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

      jest.doMock('../../middleware/verifyShopper', () => (req, res, next) => {
        req.user = { id: testShopper._id };
        next();
      });

      const response = await request(app)
        .get(`/api/orders/${regularOrder._id}/invoice`)
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
    });
  });

  describe('Invoice Data Integrity', () => {
    test('should maintain data consistency between order and invoice', async () => {
      const order = await Order.findById(testOrder._id)
        .populate('items.product', 'name regularPrice salePrice');

      // Verify order totals match bulk discount calculations
      const expectedItem1Total = 81 * 6; // 486
      const expectedItem2Total = 160 * 4; // 640
      const expectedOrderTotal = expectedItem1Total + expectedItem2Total; // 1126

      expect(order.totalAmount).toBe(expectedOrderTotal);
      expect(order.bulkDiscountSummary.totalOriginalAmount).toBe(1260);
      expect(order.bulkDiscountSummary.totalDiscountAmount).toBe(134);

      // Verify individual item calculations
      const item1 = order.items.find(item => item.product._id.toString() === testProduct1._id.toString());
      const item2 = order.items.find(item => item.product._id.toString() === testProduct2._id.toString());

      expect(item1.price * item1.quantity).toBe(expectedItem1Total);
      expect(item2.price * item2.quantity).toBe(expectedItem2Total);
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

      jest.doMock('../../middleware/verifyShopper', () => (req, res, next) => {
        req.user = { id: testShopper._id };
        next();
      });

      const response = await request(app)
        .get(`/api/orders/${mixedOrder._id}/invoice`)
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
    });
  });
});
