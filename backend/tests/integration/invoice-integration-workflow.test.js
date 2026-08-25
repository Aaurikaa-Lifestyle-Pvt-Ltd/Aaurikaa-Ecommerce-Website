/**
 * Invoice Integration Workflow Tests
 * Tests the complete integration between order creation and invoice generation
 */

const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const Order = require('../../models/Order');
const Product = require('../../models/Product');
const Shopper = require('../../models/Shopper');
const Coupon = require('../../models/Coupon');

// Create a test app without starting the server
const app = express();
app.use(express.json());

// Mock the verifyShopper middleware
let testShopperId = 'test-shopper-id';
const mockVerifyShopper = (req, res, next) => {
  req.user = { id: testShopperId };
  next();
};

// Mock the middleware module
jest.mock('../../middleware/verifyShopper', () => mockVerifyShopper);

// Import routes for testing
const orderRoutes = require('../../routes/orderRoutes');
app.use('/api/orders', orderRoutes);

// Mock shopper routes for login
const shopperRoutes = require('../../routes/shopperRoutes');
app.use('/api/shoppers', shopperRoutes);

// Mock PDF generation
jest.mock('pdfkit', () => {
  return jest.fn().mockImplementation(() => ({
    fontSize: jest.fn().mockReturnThis(),
    font: jest.fn().mockReturnThis(),
    text: jest.fn().mockReturnThis(),
    moveDown: jest.fn().mockReturnThis(),
    moveTo: jest.fn().mockReturnThis(),
    lineTo: jest.fn().mockReturnThis(),
    stroke: jest.fn().mockReturnThis(),
    addPage: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
    pipe: jest.fn().mockReturnThis(),
    y: 100,
  }));
});

describe('Invoice Integration Workflow Tests', () => {
  let testShopper, testProduct;

  beforeAll(async () => {
    // Clean up any existing test data
    await Order.deleteMany({});
    await Product.deleteMany({});
    await Shopper.deleteMany({});
    await Coupon.deleteMany({});

    // Create test shopper with unique email
    const uniqueEmail = `test-${Date.now()}@example.com`;
    testShopper = new Shopper({
      firstName: 'Test',
      lastName: 'User',
      username: `testuser-${Date.now()}`,
      email: uniqueEmail,
      phone: '9876543210',
      password: 'password123'
    });
    await testShopper.save();

    // Set the test shopper ID for the mock
    testShopperId = testShopper._id.toString();

    // Create test product with unique SKU
    testProduct = new Product({
      name: 'Test Product',
      description: 'Test Description',
      sku: `TEST-PRODUCT-${Date.now()}`,
      regularPrice: 100,
      salePrice: 90,
      stock: 10,
      seller: new mongoose.Types.ObjectId(),
      category: new mongoose.Types.ObjectId(),
      bulkPricing: {
        enabled: true,
        tiers: [
          {
            minQuantity: 5,
            maxQuantity: 10,
            discountType: 'percentage',
            discountValue: 10
          }
        ]
      }
    });
    await testProduct.save();
  });

  afterAll(async () => {
    await Order.deleteMany({});
    await Product.deleteMany({});
    await Shopper.deleteMany({});
    await Coupon.deleteMany({});
  });

  describe('Order Creation with Invoice Integration', () => {
    test('should create order with immediate invoice number generation', async () => {
      const orderData = {
        items: [
          {
            product: testProduct._id,
            quantity: 6
          }
        ],
        totalAmount: 486, // Will be recalculated
        paymentMethod: 'cod',
        billingAddress: {
          firstName: 'Test',
          lastName: 'User',
          email: 'test@example.com',
          phone: '9876543210',
          address: {
            street: '123 Test Street',
            city: 'Test City',
            state: 'Test State',
            postalCode: '123456',
            country: 'India'
          }
        },
        shippingAddress: {
          firstName: 'Test',
          lastName: 'User',
          email: 'test@example.com',
          phone: '9876543210',
          address: {
            street: '123 Test Street',
            city: 'Test City',
            state: 'Test State',
            postalCode: '123456',
            country: 'India'
          }
        }
      };

      const response = await request(app)
        .post('/api/orders')
        .send(orderData);

      expect(response.status).toBe(201);
      expect(response.body.message).toContain('invoice integration');
      expect(response.body.invoiceNumber).toBeDefined();
      expect(response.body.invoiceNumber).toMatch(/^INV-\d{8}-\d{4}$/);
      expect(response.body.order.invoiceNumber).toBe(response.body.invoiceNumber);
    });

    test('should generate sequential invoice numbers for multiple orders', async () => {
      const orderData = {
        items: [{ product: testProduct._id, quantity: 2 }],
        totalAmount: 180,
        paymentMethod: 'cod',
        billingAddress: {
          firstName: 'Test',
          lastName: 'User',
          email: 'test@example.com',
          phone: '9876543210',
          address: {
            street: '123 Test Street',
            city: 'Test City',
            state: 'Test State',
            postalCode: '123456',
            country: 'India'
          }
        }
      };

      // Create multiple orders
      const orders = [];
      for (let i = 0; i < 3; i++) {
        const response = await request(app)
          .post('/api/orders')
          .send(orderData);
        
        expect(response.status).toBe(201);
        orders.push(response.body.order);
      }

      // Verify sequential invoice numbers
      const invoiceNumbers = orders.map(order => order.invoiceNumber).sort();
      expect(invoiceNumbers[0]).toMatch(/^INV-\d{8}-0001$/);
      expect(invoiceNumbers[1]).toMatch(/^INV-\d{8}-0002$/);
      expect(invoiceNumbers[2]).toMatch(/^INV-\d{8}-0003$/);
    });
  });

  describe('Invoice Generation with Order Integration', () => {
    let testOrder;

    beforeEach(async () => {
      // Create a test order
      testOrder = new Order({
        buyer: testShopper._id,
        items: [
          {
            product: testProduct._id,
            quantity: 6,
            price: 81, // After 10% bulk discount
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
          }
        ],
        totalAmount: 486, // 81 * 6
        bulkDiscountSummary: {
          totalOriginalAmount: 540, // 90 * 6
          totalDiscountAmount: 54, // 9 * 6
          totalDiscountPercentage: 10,
          itemsWithBulkDiscount: 1
        },
        paymentMethod: 'cod',
        status: 'pending_verification',
        billingDetails: {
          firstName: 'Test',
          lastName: 'User',
          email: 'test@example.com',
          phone: '9876543210',
          address: {
            street: '123 Test Street',
            city: 'Test City',
            state: 'Test State',
            postalCode: '123456',
            country: 'India'
          }
        }
      });
      await testOrder.save();
    });

    test('should generate invoice with proper order integration', async () => {
      const response = await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain(`invoice-${testOrder._id}.pdf`);
    });

    test('should validate order ownership for invoice generation', async () => {
      // Create another shopper
      const anotherShopper = new Shopper({
        firstName: 'Another',
        lastName: 'User',
        username: `anotheruser-${Date.now()}`,
        email: `another-${Date.now()}@example.com`,
        phone: '9876543211',
        password: 'password123'
      });
      await anotherShopper.save();

      // Set the test shopper ID to a different user for this test
      const originalShopperId = testShopperId;
      testShopperId = anotherShopper._id.toString();

      // Try to access invoice of different user's order
      const response = await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`);

      // Restore original shopper ID
      testShopperId = originalShopperId;

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('Access denied');
    });

    test('should validate order data integrity for invoice generation', async () => {
      // Create order with invalid data
      const invalidOrder = new Order({
        buyer: testShopper._id,
        items: [], // No items
        totalAmount: 0, // Invalid amount
        paymentMethod: 'cod',
        status: 'pending_verification'
      });
      await invalidOrder.save();

      const response = await request(app)
        .get(`/api/orders/${invalidOrder._id}/invoice`);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Invalid order');
    });

    test('should handle missing order gracefully', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      
      const response = await request(app)
        .get(`/api/orders/${nonExistentId}/invoice`);

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('Order not found');
    });
  });

  describe('Invoice Data Consistency', () => {
    test('should maintain consistency between order and invoice data', async () => {
      const orderData = {
        items: [
          {
            product: testProduct._id,
            quantity: 6
          }
        ],
        totalAmount: 486,
        paymentMethod: 'cod',
        billingAddress: {
          firstName: 'Test',
          lastName: 'User',
          email: 'test@example.com',
          phone: '9876543210',
          address: {
            street: '123 Test Street',
            city: 'Test City',
            state: 'Test State',
            postalCode: '123456',
            country: 'India'
          }
        }
      };

      // Create order
      const createResponse = await request(app)
        .post('/api/orders')
        .send(orderData);

      expect(createResponse.status).toBe(201);
      const createdOrder = createResponse.body.order;

      // Generate invoice
      const invoiceResponse = await request(app)
        .get(`/api/orders/${createdOrder._id}/invoice`);

      expect(invoiceResponse.status).toBe(200);

      // Verify order still has the same data
      const updatedOrder = await Order.findById(createdOrder._id);
      expect(updatedOrder.invoiceNumber).toBe(createdOrder.invoiceNumber);
      expect(updatedOrder.totalAmount).toBe(createdOrder.totalAmount);
      expect(updatedOrder.items.length).toBe(createdOrder.items.length);
    });
  });
});
