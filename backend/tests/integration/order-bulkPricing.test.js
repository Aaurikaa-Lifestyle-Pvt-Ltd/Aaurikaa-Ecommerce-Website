/**
 * Order Processing Integration Tests
 * Tests for order creation and processing with bulk discount integration
 */

const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const Product = require('../../models/Product');
const Order = require('../../models/Order');
const Shopper = require('../../models/Shopper');

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

describe('Order Processing with Bulk Discounts Integration', () => {
  let testProduct1, testProduct2, testShopper, shopperToken;
  let testStateId;
  let testCountryId;

  const productIdOf = (item) =>
    item.product && item.product._id ? item.product._id : item.product;

  const sampleAddresses = () => ({
    billingAddress: {
      name: 'Test User',
      email: 'test@example.com',
      phone: '1234567890',
      address1: '123 Test St',
      city: 'Test City',
      zip: '400001',
      stateId: testStateId,
      countryId: testCountryId,
    },
    shippingAddress: {
      name: 'Test User',
      email: 'test@example.com',
      phone: '1234567890',
      address1: '123 Test St',
      city: 'Test City',
      zip: '400001',
      stateId: testStateId,
      countryId: testCountryId,
    },
  });

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

    testStateId = new mongoose.Types.ObjectId();
    testCountryId = new mongoose.Types.ObjectId();

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
    
    // Update the mock to use the actual test shopper ID
    testShopperId = testShopper._id.toString();

    // Create test products with bulk discounts
    testProduct1 = new Product({
      name: 'Bulk Product 1',
      sku: `BULK-001-${Date.now()}`,
      regularPrice: 100,
      salePrice: 90,
      stock: 50,
      category: new mongoose.Types.ObjectId(),
      subcategory: new mongoose.Types.ObjectId(),
      brand: new mongoose.Types.ObjectId(),
      description: 'Test',
      mainImage: 'x.jpg',
      images: ['x.jpg'],
      isActive: true,
      taxRate: 18,
      weight: 500,
      bulkDiscount: {
        enabled: true,
        tiers: [
          { minQuantity: 5, maxQuantity: 10, discountType: 'percentage', discountValue: 10 },
          { minQuantity: 11, maxQuantity: 20, discountType: 'percentage', discountValue: 15 },
          { minQuantity: 21, maxQuantity: '', discountType: 'percentage', discountValue: 20 }
        ]
      }
    });
    await testProduct1.save();

    testProduct2 = new Product({
      name: 'Bulk Product 2',
      sku: `BULK-002-${Date.now()}`,
      regularPrice: 200,
      salePrice: 180,
      stock: 30,
      category: new mongoose.Types.ObjectId(),
      subcategory: new mongoose.Types.ObjectId(),
      brand: new mongoose.Types.ObjectId(),
      description: 'Test',
      mainImage: 'x.jpg',
      images: ['x.jpg'],
      isActive: true,
      taxRate: 18,
      weight: 500,
      bulkDiscount: {
        enabled: true,
        tiers: [
          { minQuantity: 3, maxQuantity: 5, discountType: 'fixed', discountValue: 20 },
          { minQuantity: 6, maxQuantity: '', discountType: 'fixed', discountValue: 50 }
        ]
      }
    });
    await testProduct2.save();

    // Mock authentication token
    shopperToken = 'mock-shopper-token';
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('POST /api/orders - Order Creation with Bulk Discounts', () => {
    test('should create order with bulk discounts applied', async () => {
      const orderData = {
        items: [
          { product: testProduct1._id, quantity: 6 }, // Should get 10% discount
          { product: testProduct2._id, quantity: 4 }  // Should get ₹20 fixed discount
        ],
        paymentMethod: 'cod',
        ...sampleAddresses(),
      };

      // Mock is already set up globally

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${shopperToken}`)
        .send(orderData);

      // No need to restore since we're using global mock

      if (response.status !== 201) {
        console.log('Error response:', JSON.stringify(response.body, null, 2));
        console.log('Response status:', response.status);
        console.log('Response headers:', response.headers);
      }
      expect(response.status).toBe(201);
      expect(response.body.message).toContain('Order created successfully with bulk discount processing');
      expect(response.body.order).toBeDefined();
      expect(response.body.bulkDiscountSummary).toBeDefined();

      const order = response.body.order;
      expect(order.items).toHaveLength(2);
      expect(order.bulkDiscountSummary.itemsWithBulkDiscount).toBe(2);
      expect(order.bulkDiscountSummary.totalDiscountAmount).toBeGreaterThan(0);

      // Verify first item (percentage discount)
      const item1 = order.items.find(item => String(productIdOf(item)) === String(testProduct1._id));
      expect(item1.bulkDiscount.applied).toBe(true);
      expect(item1.bulkDiscount.discountPercentage).toBe(10);
      expect(item1.price).toBe(81); // 90 - 10% = 81

      // Verify second item (fixed discount)
      const item2 = order.items.find(item => String(productIdOf(item)) === String(testProduct2._id));
      expect(item2.bulkDiscount.applied).toBe(true);
      expect(item2.bulkDiscount.discountAmount).toBe(20);
      expect(item2.price).toBe(160); // 180 - 20 = 160
    });

    test('should handle order with mixed bulk discount and regular items', async () => {
      // Create a product without bulk discounts
      const regularProduct = new Product({
        name: 'Regular Product',
        sku: `REG-001-${Date.now()}`,
        regularPrice: 50,
        salePrice: 45,
        stock: 100,
        category: new mongoose.Types.ObjectId(),
        subcategory: new mongoose.Types.ObjectId(),
        brand: new mongoose.Types.ObjectId(),
        description: 'Test',
        mainImage: 'x.jpg',
        images: ['x.jpg'],
        isActive: true,
        taxRate: 18,
        weight: 500,
        bulkDiscount: {
          enabled: false,
          tiers: []
        }
      });
      await regularProduct.save();

      const orderData = {
        items: [
          { product: testProduct1._id, quantity: 5 }, // Should get bulk discount
          { product: regularProduct._id, quantity: 3 } // No bulk discount
        ],
        paymentMethod: 'upi_manual',
        upiTxnId: 'UPI123456789',
        ...sampleAddresses(),
      };

      // Mock is already set up globally

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${shopperToken}`)
        .send(orderData);

      // Mock is already set up globally

      expect(response.status).toBe(201);
      expect(response.body.order.bulkDiscountSummary.itemsWithBulkDiscount).toBe(1);

      const order = response.body.order;
      const bulkItem = order.items.find(item => String(productIdOf(item)) === String(testProduct1._id));
      const regularItem = order.items.find(item => String(productIdOf(item)) === String(regularProduct._id));

      expect(bulkItem.bulkDiscount.applied).toBe(true);
      expect(regularItem.bulkDiscount.applied).toBe(false);
    });

    test('should reject order with insufficient stock', async () => {
      const orderData = {
        items: [
          { product: testProduct1._id, quantity: 100 } // More than available stock (50)
        ],
        paymentMethod: 'cod'
      };

      // Mock is already set up globally

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${shopperToken}`)
        .send(orderData);

      // Mock is already set up globally

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Insufficient stock');
    });

    test('should reject order with invalid product', async () => {
      const orderData = {
        items: [
          { product: new mongoose.Types.ObjectId(), quantity: 1 } // Non-existent product
        ],
        paymentMethod: 'cod'
      };

      // Mock is already set up globally

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${shopperToken}`)
        .send(orderData);

      // Mock is already set up globally

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Product not found');
    });
  });

  describe('GET /api/orders/:id/invoice - Invoice with Bulk Discount Information', () => {
    test('should generate invoice with bulk discount details', async () => {
      // Create an order with bulk discounts
      const order = new Order({
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
        shippingCharge: 0,
        tax: { totalTaxAmount: 0, totalTaxableAmount: 0, taxSummary: [] },
      });
      await order.save();

      // Mock is already set up globally

      const response = await request(app)
        .get(`/api/orders/${order._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`);

      // Mock is already set up globally

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
    });
  });

  describe('Order Database Persistence', () => {
    test('should persist order with bulk discount information in database', async () => {
      const orderData = {
        items: [
          { product: testProduct1._id, quantity: 8 }, // Should get 10% discount
          { product: testProduct2._id, quantity: 6 }  // Should get ₹50 fixed discount
        ],
        paymentMethod: 'cod',
        ...sampleAddresses(),
      };

      // Mock is already set up globally

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${shopperToken}`)
        .send(orderData);

      // Mock is already set up globally

      expect(response.status).toBe(201);

      // Verify order was saved to database
      const savedOrder = await Order.findById(response.body.order._id);
      expect(savedOrder).toBeDefined();
      expect(savedOrder.bulkDiscountSummary).toBeDefined();
      expect(savedOrder.bulkDiscountSummary.itemsWithBulkDiscount).toBe(2);

      // Verify item-level bulk discount information
      const item1 = savedOrder.items.find(item => item.product.toString() === testProduct1._id.toString());
      expect(item1.bulkDiscount.applied).toBe(true);
      expect(item1.bulkDiscount.discountPercentage).toBe(10);
      expect(item1.originalPrice).toBe(90);
      expect(item1.price).toBe(81);

      const item2 = savedOrder.items.find(item => item.product.toString() === testProduct2._id.toString());
      expect(item2.bulkDiscount.applied).toBe(true);
      expect(item2.bulkDiscount.discountAmount).toBe(50);
      expect(item2.originalPrice).toBe(180);
      expect(item2.price).toBe(130);
    });
  });
});
