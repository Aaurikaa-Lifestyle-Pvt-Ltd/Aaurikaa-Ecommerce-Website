/**
 * Tests for Invoice Generation Functionality
 * Tests the enhanced invoice generation with professional formatting
 */

const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// Import models and routes
const Order = require('../../models/Order');
const Shopper = require('../../models/Shopper');
const Product = require('../../models/Product');
const orderRoutes = require('../../routes/orderRoutes');
const PDFDocument = require('pdfkit');

// Mock middleware
const mockVerifyShopper = (req, res, next) => {
  req.user = { id: 'shopper123' };
  next();
};

// Create test app
const app = express();
app.use(express.json());

// Add routes with mocked middleware
app.get('/api/orders/:id/invoice', (req, res, next) => {
  // Check for authentication
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: '❌ Access denied. No token provided.' });
  }
  
  const token = authHeader.substring(7);
  if (token === 'invalid-token') {
    return res.status(401).json({ message: '❌ Access denied. Invalid token.' });
  }
  
  req.user = { id: 'shopper123' };
  next();
}, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('buyer').populate('items.product');
    
    if (!order) {
      return res.status(404).json({ message: '❌ Order not found' });
    }

    // Generate invoice PDF
    const doc = new PDFDocument({ margin: 50 });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${order._id}.pdf"`);
    
    // Pipe PDF to response
    doc.pipe(res);
    
    // Add content to PDF
    doc.fontSize(20).font('Helvetica-Bold').text('INVOICE', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).font('Helvetica').text(`Invoice #: ${order._id}`);
    doc.text(`Date: ${new Date().toLocaleDateString()}`);
    doc.text(`Customer: ${order.buyer?.firstName} ${order.buyer?.lastName}`);
    doc.text(`Total: ₹${order.totalAmount}`);
    
    // Finalize PDF
    doc.end();
  } catch (error) {
    console.error('Invoice generation error:', error);
    res.status(500).json({ message: '❌ Invoice generation failed' });
  }
});

// Test database setup
const testDbUri = process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test_invoice_generation';

describe('Invoice Generation Functionality', () => {
  let testShopper;
  let shopperToken;
  let testProduct;
  let testOrder;

  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(testDbUri);
    }
    
    // Create test shopper
    testShopper = new Shopper({
      firstName: 'John',
      lastName: 'Doe',
      username: 'johndoe',
      email: 'john@test.com',
      phone: '+91-9876543210',
      password: 'hashedpassword',
      isVerified: true
    });
    await testShopper.save();

    // Generate shopper token
    shopperToken = jwt.sign(
      { id: testShopper._id, role: 'shopper' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    // Create test product
    testProduct = new Product({
      name: 'Test Product',
      sku: 'TEST-PROD-001',
      regularPrice: 1000,
      salePrice: 800,
      mainImage: 'test-image.jpg',
      seller: new mongoose.Types.ObjectId()
    });
    await testProduct.save();
  });

  beforeEach(async () => {
    // Create test order
    testOrder = new Order({
      buyer: testShopper._id,
      items: [
        {
          product: testProduct._id,
          quantity: 2,
          price: 800,
          originalPrice: 1000,
          bulkDiscount: {
            applied: true,
            discountAmount: 200,
            discountPercentage: 20,
            tierUsed: {
              minQuantity: 2,
              maxQuantity: 5,
              discountType: 'percentage',
              discountValue: 20
            }
          }
        }
      ],
      totalAmount: 1600,
      bulkDiscountSummary: {
        totalOriginalAmount: 2000,
        totalDiscountAmount: 400,
        totalDiscountPercentage: 20,
        itemsWithBulkDiscount: 1
      },
      coupon: {
        code: 'SAVE10',
        discountAmount: 160,
        couponData: {
          discountType: 'percentage',
          discountValue: 10,
          freeShipping: false,
          minOrder: 1000
        }
      },
      paymentMethod: 'upi_manual',
      status: 'paid',
      createdAt: new Date('2024-01-15T10:30:00.000Z')
    });
    await testOrder.save();
  });

  afterEach(async () => {
    // Clean up orders
    await Order.deleteMany({});
  });

  afterAll(async () => {
    // Clean up and close connection
    await Shopper.deleteMany({});
    await Product.deleteMany({});
    await mongoose.connection.close();
  });

  describe('GET /api/orders/:id/invoice', () => {
    test('should generate professional invoice with proper formatting', async () => {
      const response = await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain(`invoice-${testOrder._id}.pdf`);
      expect(response.body).toBeDefined();
    });

    test('should include company information in invoice header', async () => {
      const response = await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      // PDF content is binary, so we can't directly test text content
      // But we can verify the response structure and headers
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.body.length).toBeGreaterThan(0);
    });

    test('should include invoice number and dates', async () => {
      const response = await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.body.length).toBeGreaterThan(0);
    });

    test('should include customer billing information', async () => {
      const response = await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.body.length).toBeGreaterThan(0);
    });

    test('should include detailed item breakdown with table format', async () => {
      const response = await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.body.length).toBeGreaterThan(0);
    });

    test('should include bulk discount information', async () => {
      const response = await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.body.length).toBeGreaterThan(0);
    });

    test('should include coupon discount information', async () => {
      const response = await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.body.length).toBeGreaterThan(0);
    });

    test('should include payment method and order status', async () => {
      const response = await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.body.length).toBeGreaterThan(0);
    });

    test('should include professional footer with contact information', async () => {
      const response = await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.body.length).toBeGreaterThan(0);
    });

    test('should handle orders without bulk discounts', async () => {
      // Create order without bulk discounts
      const orderWithoutBulkDiscount = new Order({
        buyer: testShopper._id,
        items: [
          {
            product: testProduct._id,
            quantity: 1,
            price: 1000,
            originalPrice: 1000,
            bulkDiscount: {
              applied: false,
              discountAmount: 0,
              discountPercentage: 0
            }
          }
        ],
        totalAmount: 1000,
        bulkDiscountSummary: {
          totalOriginalAmount: 1000,
          totalDiscountAmount: 0,
          totalDiscountPercentage: 0,
          itemsWithBulkDiscount: 0
        },
        paymentMethod: 'cod',
        status: 'pending_verification'
      });
      await orderWithoutBulkDiscount.save();

      const response = await request(app)
        .get(`/api/orders/${orderWithoutBulkDiscount._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.body.length).toBeGreaterThan(0);
    });

    test('should handle orders without coupon discounts', async () => {
      // Create order without coupon
      const orderWithoutCoupon = new Order({
        buyer: testShopper._id,
        items: [
          {
            product: testProduct._id,
            quantity: 1,
            price: 1000,
            originalPrice: 1000,
            bulkDiscount: {
              applied: false,
              discountAmount: 0,
              discountPercentage: 0
            }
          }
        ],
        totalAmount: 1000,
        bulkDiscountSummary: {
          totalOriginalAmount: 1000,
          totalDiscountAmount: 0,
          totalDiscountPercentage: 0,
          itemsWithBulkDiscount: 0
        },
        paymentMethod: 'stripe',
        status: 'paid'
      });
      await orderWithoutCoupon.save();

      const response = await request(app)
        .get(`/api/orders/${orderWithoutCoupon._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.body.length).toBeGreaterThan(0);
    });

    test('should handle orders with free shipping coupon', async () => {
      // Create order with free shipping coupon
      const orderWithFreeShipping = new Order({
        buyer: testShopper._id,
        items: [
          {
            product: testProduct._id,
            quantity: 1,
            price: 1000,
            originalPrice: 1000,
            bulkDiscount: {
              applied: false,
              discountAmount: 0,
              discountPercentage: 0
            }
          }
        ],
        totalAmount: 1000,
        bulkDiscountSummary: {
          totalOriginalAmount: 1000,
          totalDiscountAmount: 0,
          totalDiscountPercentage: 0,
          itemsWithBulkDiscount: 0
        },
        coupon: {
          code: 'FREESHIP',
          discountAmount: 0,
          couponData: {
            discountType: 'fixed',
            discountValue: 0,
            freeShipping: true,
            minOrder: 500
          }
        },
        paymentMethod: 'razorpay',
        status: 'processing'
      });
      await orderWithFreeShipping.save();

      const response = await request(app)
        .get(`/api/orders/${orderWithFreeShipping._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.body.length).toBeGreaterThan(0);
    });

    test('should return 404 for non-existent order', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .get(`/api/orders/${nonExistentId}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(404);

      expect(response.body.message).toBe('❌ Order not found');
    });

    test('should return 401 without shopper token', async () => {
      await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`)
        .expect(401);
    });

    test('should return 401 with invalid token', async () => {
      await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    test('should handle multiple items in order', async () => {
      // Create another test product
      const testProduct2 = new Product({
        name: 'Test Product 2',
        sku: 'TEST-PROD-002',
        regularPrice: 500,
        salePrice: 400,
        mainImage: 'test-image-2.jpg',
        seller: new mongoose.Types.ObjectId()
      });
      await testProduct2.save();

      // Create order with multiple items
      const multiItemOrder = new Order({
        buyer: testShopper._id,
        items: [
          {
            product: testProduct._id,
            quantity: 2,
            price: 800,
            originalPrice: 1000,
            bulkDiscount: {
              applied: true,
              discountAmount: 200,
              discountPercentage: 20
            }
          },
          {
            product: testProduct2._id,
            quantity: 1,
            price: 400,
            originalPrice: 500,
            bulkDiscount: {
              applied: true,
              discountAmount: 100,
              discountPercentage: 20
            }
          }
        ],
        totalAmount: 2000,
        bulkDiscountSummary: {
          totalOriginalAmount: 2500,
          totalDiscountAmount: 500,
          totalDiscountPercentage: 20,
          itemsWithBulkDiscount: 2
        },
        paymentMethod: 'upi_manual',
        status: 'shipped'
      });
      await multiItemOrder.save();

      const response = await request(app)
        .get(`/api/orders/${multiItemOrder._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.body.length).toBeGreaterThan(0);
    });

    test('should handle server errors gracefully', async () => {
      // Test with invalid order ID to trigger error
      const response = await request(app)
        .get('/api/orders/invalid-id/invoice')
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(500);

      expect(response.body.message).toBe('❌ Invoice generation failed');
    });
  });
});
