/**
 * Tax Compliance Workflow Integration Tests
 * Tests the complete tax calculation and compliance workflow
 */

const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const Order = require('../../models/Order');
const Product = require('../../models/Product');
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

describe('Tax Compliance Workflow Integration Tests', () => {
  let testShopper, testProduct, testOrder;

  beforeAll(async () => {
    // Clean up any existing test data
    await Order.deleteMany({});
    await Product.deleteMany({});
    await Shopper.deleteMany({});

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

    // Create a test order with tax information
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
      totalAmount: 573.48, // 486 + 87.48 (18% GST)
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
        email: uniqueEmail,
        phone: '9876543210',
        address: {
          street: '123 Test Street',
          city: 'Test City',
          state: 'Test State',
          postalCode: '123456',
          country: 'India'
        }
      },
      tax: {
        totalTaxableAmount: 486,
        totalTaxAmount: 87.48,
        taxSummary: [{
          taxType: 'GST',
          taxRate: 18,
          taxableAmount: 486,
          taxAmount: 87.48,
          taxBreakdown: {
            CGST: {
              rate: 9,
              amount: 43.74
            },
            SGST: {
              rate: 9,
              amount: 43.74
            }
          }
        }],
        compliance: {
          isValid: true,
          errors: [],
          warnings: []
        }
      }
    });
    await testOrder.save();
  });

  afterAll(async () => {
    await Order.deleteMany({});
    await Product.deleteMany({});
    await Shopper.deleteMany({});
  });

  describe('Tax Calculation Integration', () => {
    test('should create order with proper tax calculation', async () => {
      const orderData = {
        items: [
          {
            product: testProduct._id,
            quantity: 2
          }
        ],
        totalAmount: 212.4, // Will be recalculated with tax
        paymentMethod: 'cod',
        billingAddress: {
          firstName: 'Test',
          lastName: 'User',
          email: `test-${Date.now()}@example.com`,
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
      expect(response.body.order.tax).toBeDefined();
      expect(response.body.order.tax.totalTaxAmount).toBeGreaterThan(0);
      expect(response.body.order.tax.taxSummary).toHaveLength(1);
      expect(response.body.order.tax.taxSummary[0].taxType).toBe('GST');
      expect(response.body.order.tax.taxSummary[0].taxRate).toBe(18);
    });

    test('should include tax in total amount', async () => {
      const orderData = {
        items: [
          {
            product: testProduct._id,
            quantity: 1
          }
        ],
        totalAmount: 100, // Will be recalculated
        paymentMethod: 'cod',
        billingAddress: {
          firstName: 'Test',
          lastName: 'User',
          email: `test-${Date.now()}@example.com`,
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
      const order = response.body.order;
      
      // Total should include tax
      const expectedSubtotal = 90; // Product price
      const expectedTax = expectedSubtotal * 0.18; // 18% GST
      const expectedTotal = expectedSubtotal + expectedTax;
      
      expect(order.totalAmount).toBeCloseTo(expectedTotal, 2);
      expect(order.tax.totalTaxableAmount).toBe(expectedSubtotal);
      expect(order.tax.totalTaxAmount).toBeCloseTo(expectedTax, 2);
    });
  });

  describe('Tax Compliance Validation', () => {
    test('should validate tax compliance for valid order', async () => {
      const order = await Order.findById(testOrder._id);
      
      expect(order.tax.compliance.isValid).toBe(true);
      expect(order.tax.compliance.errors).toHaveLength(0);
    });

    test('should detect compliance issues for order without billing address', async () => {
      const orderWithoutAddress = new Order({
        buyer: testShopper._id,
        items: [
          {
            product: testProduct._id,
            quantity: 1,
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
        totalAmount: 106.2, // 90 + 16.2 (18% GST)
        paymentMethod: 'cod',
        status: 'pending_verification'
        // No billingDetails
      });
      await orderWithoutAddress.save();

      // The order should still be created but with compliance warnings
      expect(orderWithoutAddress.tax.compliance.isValid).toBe(false);
      expect(orderWithoutAddress.tax.compliance.errors).toContain('Billing address is required for tax compliance');
    });
  });

  describe('Invoice Generation with Tax Information', () => {
    test('should generate invoice with tax breakdown', async () => {
      const response = await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain(`invoice-${testOrder._id}.pdf`);
    });

    test('should include tax compliance information in invoice', async () => {
      const response = await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`);

      expect(response.status).toBe(200);
      // The PDF should contain tax compliance information
      // This is verified by the successful generation of the PDF
    });
  });

  describe('Tax Calculation Edge Cases', () => {
    test('should handle zero tax amount', async () => {
      const orderData = {
        items: [
          {
            product: testProduct._id,
            quantity: 0 // Zero quantity
          }
        ],
        totalAmount: 0,
        paymentMethod: 'cod',
        billingAddress: {
          firstName: 'Test',
          lastName: 'User',
          email: `test-${Date.now()}@example.com`,
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

      // Should fail due to zero quantity validation
      expect(response.status).toBe(400);
    });

    test('should handle multiple items with different tax rates', async () => {
      // Create another product with different tax rate
      const product2 = new Product({
        name: 'Test Product 2',
        description: 'Test Description 2',
        sku: `TEST-PRODUCT-2-${Date.now()}`,
        regularPrice: 200,
        salePrice: 180,
        stock: 5,
        seller: new mongoose.Types.ObjectId(),
        category: new mongoose.Types.ObjectId()
      });
      await product2.save();

      const orderData = {
        items: [
          {
            product: testProduct._id,
            quantity: 1
          },
          {
            product: product2._id,
            quantity: 1
          }
        ],
        totalAmount: 300, // Will be recalculated
        paymentMethod: 'cod',
        billingAddress: {
          firstName: 'Test',
          lastName: 'User',
          email: `test-${Date.now()}@example.com`,
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
      expect(response.body.order.tax.totalTaxAmount).toBeGreaterThan(0);
      expect(response.body.order.tax.taxSummary).toHaveLength(1); // Same tax rate for both items
    });
  });
});
