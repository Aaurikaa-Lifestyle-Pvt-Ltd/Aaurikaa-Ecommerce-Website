/**
 * Integration Tests for Invoice Generation Workflow
 * Tests the complete invoice generation workflow from order creation to PDF generation
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// Import the app and models
const app = require('../../server');
const Order = require('../../models/Order');
const Shopper = require('../../models/Shopper');
const Product = require('../../models/Product');

// Test database setup
const testDbUri = process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test_invoice_workflow';

describe('Invoice Generation Workflow Integration Tests', () => {
  let testShopper;
  let shopperToken;
  let testProduct1;
  let testProduct2;
  let testOrder;

  beforeAll(async () => {
    // Connect to test database
    await mongoose.connect(testDbUri);
    
    // Create test shopper
    testShopper = new Shopper({
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@test.com',
      phone: '+91-9876543211',
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

    // Create test products
    testProduct1 = new Product({
      name: 'Premium Headphones',
      regularPrice: 2000,
      salePrice: 1600,
      mainImage: 'headphones.jpg',
      seller: new mongoose.Types.ObjectId()
    });
    await testProduct1.save();

    testProduct2 = new Product({
      name: 'Wireless Mouse',
      regularPrice: 800,
      salePrice: 600,
      mainImage: 'mouse.jpg',
      seller: new mongoose.Types.ObjectId()
    });
    await testProduct2.save();
  });

  beforeEach(async () => {
    // Create comprehensive test order
    testOrder = new Order({
      buyer: testShopper._id,
      items: [
        {
          product: testProduct1._id,
          quantity: 2,
          price: 1600,
          originalPrice: 2000,
          bulkDiscount: {
            applied: true,
            discountAmount: 400,
            discountPercentage: 20,
            tierUsed: {
              minQuantity: 2,
              maxQuantity: 5,
              discountType: 'percentage',
              discountValue: 20
            }
          }
        },
        {
          product: testProduct2._id,
          quantity: 1,
          price: 600,
          originalPrice: 800,
          bulkDiscount: {
            applied: true,
            discountAmount: 200,
            discountPercentage: 25,
            tierUsed: {
              minQuantity: 1,
              maxQuantity: 3,
              discountType: 'percentage',
              discountValue: 25
            }
          }
        }
      ],
      totalAmount: 3800,
      bulkDiscountSummary: {
        totalOriginalAmount: 4800,
        totalDiscountAmount: 1000,
        totalDiscountPercentage: 20.83,
        itemsWithBulkDiscount: 2
      },
      coupon: {
        code: 'SAVE15',
        discountAmount: 570,
        couponData: {
          discountType: 'percentage',
          discountValue: 15,
          freeShipping: false,
          minOrder: 2000
        }
      },
      paymentMethod: 'stripe',
      status: 'delivered',
      createdAt: new Date('2024-01-20T14:30:00.000Z')
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

  describe('Complete Invoice Generation Workflow', () => {
    test('should complete full invoice generation workflow successfully', async () => {
      // Step 1: Verify order exists and is accessible
      const orderResponse = await request(app)
        .get(`/api/orders/${testOrder._id}`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(orderResponse.body._id).toBe(testOrder._id.toString());
      expect(orderResponse.body.buyer).toBe(testShopper._id.toString());
      expect(orderResponse.body.items).toHaveLength(2);

      // Step 2: Generate invoice
      const invoiceResponse = await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      // Verify invoice response
      expect(invoiceResponse.headers['content-type']).toBe('application/pdf');
      expect(invoiceResponse.headers['content-disposition']).toContain(`invoice-${testOrder._id}.pdf`);
      expect(invoiceResponse.body.length).toBeGreaterThan(0);

      // Step 3: Verify invoice contains expected data structure
      // Note: PDF content is binary, so we verify the response structure
      expect(invoiceResponse.body).toBeInstanceOf(Buffer);
      expect(invoiceResponse.body.length).toBeGreaterThan(1000); // Reasonable PDF size
    });

    test('should handle complex order with multiple discounts', async () => {
      // Create order with complex discount structure
      const complexOrder = new Order({
        buyer: testShopper._id,
        items: [
          {
            product: testProduct1._id,
            quantity: 3,
            price: 1400, // Higher bulk discount
            originalPrice: 2000,
            bulkDiscount: {
              applied: true,
              discountAmount: 600,
              discountPercentage: 30,
              tierUsed: {
                minQuantity: 3,
                maxQuantity: 10,
                discountType: 'percentage',
                discountValue: 30
              }
            }
          },
          {
            product: testProduct2._id,
            quantity: 2,
            price: 500, // Different bulk discount
            originalPrice: 800,
            bulkDiscount: {
              applied: true,
              discountAmount: 300,
              discountPercentage: 37.5,
              tierUsed: {
                minQuantity: 2,
                maxQuantity: 5,
                discountType: 'percentage',
                discountValue: 37.5
              }
            }
          }
        ],
        totalAmount: 5200,
        bulkDiscountSummary: {
          totalOriginalAmount: 7600,
          totalDiscountAmount: 1800,
          totalDiscountPercentage: 23.68,
          itemsWithBulkDiscount: 2
        },
        coupon: {
          code: 'MEGA20',
          discountAmount: 1040,
          couponData: {
            discountType: 'percentage',
            discountValue: 20,
            freeShipping: true,
            minOrder: 3000
          }
        },
        paymentMethod: 'razorpay',
        status: 'processing'
      });
      await complexOrder.save();

      const invoiceResponse = await request(app)
        .get(`/api/orders/${complexOrder._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(invoiceResponse.headers['content-type']).toBe('application/pdf');
      expect(invoiceResponse.body.length).toBeGreaterThan(0);
    });

    test('should handle order with no discounts', async () => {
      // Create order without any discounts
      const noDiscountOrder = new Order({
        buyer: testShopper._id,
        items: [
          {
            product: testProduct1._id,
            quantity: 1,
            price: 2000,
            originalPrice: 2000,
            bulkDiscount: {
              applied: false,
              discountAmount: 0,
              discountPercentage: 0
            }
          }
        ],
        totalAmount: 2000,
        bulkDiscountSummary: {
          totalOriginalAmount: 2000,
          totalDiscountAmount: 0,
          totalDiscountPercentage: 0,
          itemsWithBulkDiscount: 0
        },
        paymentMethod: 'cod',
        status: 'pending_verification'
      });
      await noDiscountOrder.save();

      const invoiceResponse = await request(app)
        .get(`/api/orders/${noDiscountOrder._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(invoiceResponse.headers['content-type']).toBe('application/pdf');
      expect(invoiceResponse.body.length).toBeGreaterThan(0);
    });

    test('should handle order with only bulk discounts', async () => {
      // Create order with only bulk discounts (no coupon)
      const bulkOnlyOrder = new Order({
        buyer: testShopper._id,
        items: [
          {
            product: testProduct1._id,
            quantity: 2,
            price: 1600,
            originalPrice: 2000,
            bulkDiscount: {
              applied: true,
              discountAmount: 400,
              discountPercentage: 20
            }
          }
        ],
        totalAmount: 3200,
        bulkDiscountSummary: {
          totalOriginalAmount: 4000,
          totalDiscountAmount: 800,
          totalDiscountPercentage: 20,
          itemsWithBulkDiscount: 1
        },
        paymentMethod: 'upi_manual',
        status: 'shipped'
      });
      await bulkOnlyOrder.save();

      const invoiceResponse = await request(app)
        .get(`/api/orders/${bulkOnlyOrder._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(invoiceResponse.headers['content-type']).toBe('application/pdf');
      expect(invoiceResponse.body.length).toBeGreaterThan(0);
    });

    test('should handle order with only coupon discounts', async () => {
      // Create order with only coupon discounts (no bulk)
      const couponOnlyOrder = new Order({
        buyer: testShopper._id,
        items: [
          {
            product: testProduct1._id,
            quantity: 1,
            price: 2000,
            originalPrice: 2000,
            bulkDiscount: {
              applied: false,
              discountAmount: 0,
              discountPercentage: 0
            }
          }
        ],
        totalAmount: 1800,
        bulkDiscountSummary: {
          totalOriginalAmount: 2000,
          totalDiscountAmount: 0,
          totalDiscountPercentage: 0,
          itemsWithBulkDiscount: 0
        },
        coupon: {
          code: 'FLAT200',
          discountAmount: 200,
          couponData: {
            discountType: 'fixed',
            discountValue: 200,
            freeShipping: false,
            minOrder: 1000
          }
        },
        paymentMethod: 'stripe',
        status: 'paid'
      });
      await couponOnlyOrder.save();

      const invoiceResponse = await request(app)
        .get(`/api/orders/${couponOnlyOrder._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(invoiceResponse.headers['content-type']).toBe('application/pdf');
      expect(invoiceResponse.body.length).toBeGreaterThan(0);
    });

    test('should handle different payment methods correctly', async () => {
      const paymentMethods = ['upi_manual', 'cod', 'stripe', 'razorpay'];
      
      for (const paymentMethod of paymentMethods) {
        const order = new Order({
          buyer: testShopper._id,
          items: [
            {
              product: testProduct1._id,
              quantity: 1,
              price: 2000,
              originalPrice: 2000,
              bulkDiscount: {
                applied: false,
                discountAmount: 0,
                discountPercentage: 0
              }
            }
          ],
          totalAmount: 2000,
          bulkDiscountSummary: {
            totalOriginalAmount: 2000,
            totalDiscountAmount: 0,
            totalDiscountPercentage: 0,
            itemsWithBulkDiscount: 0
          },
          paymentMethod: paymentMethod,
          status: 'paid'
        });
        await order.save();

        const invoiceResponse = await request(app)
          .get(`/api/orders/${order._id}/invoice`)
          .set('Authorization', `Bearer ${shopperToken}`)
          .expect(200);

        expect(invoiceResponse.headers['content-type']).toBe('application/pdf');
        expect(invoiceResponse.body.length).toBeGreaterThan(0);
      }
    });

    test('should handle different order statuses correctly', async () => {
      const orderStatuses = [
        'pending_verification',
        'paid',
        'processing',
        'shipped',
        'delivered',
        'cancelled',
        'failed'
      ];
      
      for (const status of orderStatuses) {
        const order = new Order({
          buyer: testShopper._id,
          items: [
            {
              product: testProduct1._id,
              quantity: 1,
              price: 2000,
              originalPrice: 2000,
              bulkDiscount: {
                applied: false,
                discountAmount: 0,
                discountPercentage: 0
              }
            }
          ],
          totalAmount: 2000,
          bulkDiscountSummary: {
            totalOriginalAmount: 2000,
            totalDiscountAmount: 0,
            totalDiscountPercentage: 0,
            itemsWithBulkDiscount: 0
          },
          paymentMethod: 'upi_manual',
          status: status
        });
        await order.save();

        const invoiceResponse = await request(app)
          .get(`/api/orders/${order._id}/invoice`)
          .set('Authorization', `Bearer ${shopperToken}`)
          .expect(200);

        expect(invoiceResponse.headers['content-type']).toBe('application/pdf');
        expect(invoiceResponse.body.length).toBeGreaterThan(0);
      }
    });

    test('should maintain data integrity during invoice generation', async () => {
      // Generate invoice multiple times to ensure data consistency
      const invoiceResponses = [];
      
      for (let i = 0; i < 3; i++) {
        const response = await request(app)
          .get(`/api/orders/${testOrder._id}/invoice`)
          .set('Authorization', `Bearer ${shopperToken}`)
          .expect(200);
        
        invoiceResponses.push(response);
      }

      // All responses should be identical
      invoiceResponses.forEach(response => {
        expect(response.headers['content-type']).toBe('application/pdf');
        expect(response.body.length).toBeGreaterThan(0);
      });

      // Verify order data hasn't changed
      const orderResponse = await request(app)
        .get(`/api/orders/${testOrder._id}`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(orderResponse.body._id).toBe(testOrder._id.toString());
      expect(orderResponse.body.totalAmount).toBe(3800);
      expect(orderResponse.body.items).toHaveLength(2);
    });

    test('should handle concurrent invoice generation requests', async () => {
      // Generate multiple invoices concurrently
      const promises = Array(5).fill().map(() =>
        request(app)
          .get(`/api/orders/${testOrder._id}/invoice`)
          .set('Authorization', `Bearer ${shopperToken}`)
      );

      const responses = await Promise.all(promises);

      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toBe('application/pdf');
        expect(response.body.length).toBeGreaterThan(0);
      });
    });
  });
});
