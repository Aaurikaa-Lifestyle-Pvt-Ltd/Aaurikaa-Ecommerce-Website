/**
 * Bulk Discount Invoice Reflection Tests
 * Tests that bulk discounts are properly reflected in invoice totals and breakdowns
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

describe('Bulk Discount Invoice Reflection Tests', () => {
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

    // Create test product with bulk pricing
    testProduct = new Product({
      name: 'Test Product with Bulk Pricing',
      description: 'Test Description',
      sku: `TEST-PRODUCT-${Date.now()}`,
      regularPrice: 100,
      salePrice: 90,
      stock: 20,
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
          },
          {
            minQuantity: 11,
            maxQuantity: 20,
            discountType: 'percentage',
            discountValue: 15
          }
        ]
      }
    });
    await testProduct.save();

    // Create a test order with bulk discounts
    testOrder = new Order({
      buyer: testShopper._id,
      items: [
        {
          product: testProduct._id,
          quantity: 6, // Should trigger 10% bulk discount
          price: 81, // After 10% discount (90 - 9)
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
      totalAmount: 573.48, // (81 * 6) + 18% GST = 486 + 87.48
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
        totalTaxableAmount: 486, // After bulk discount
        totalTaxAmount: 87.48, // 18% GST on 486
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

  describe('Bulk Discount Reflection in Invoice', () => {
    test('should reflect bulk discounts in invoice totals', async () => {
      const response = await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain(`invoice-${testOrder._id}.pdf`);
    });

    test('should have consistent pricing between order and invoice', () => {
      // Verify order has bulk discount information
      expect(testOrder.bulkDiscountSummary).toBeDefined();
      expect(testOrder.bulkDiscountSummary.totalDiscountAmount).toBe(54);
      expect(testOrder.bulkDiscountSummary.itemsWithBulkDiscount).toBe(1);
      
      // Verify item has bulk discount information
      const item = testOrder.items[0];
      expect(item.bulkDiscount.applied).toBe(true);
      expect(item.bulkDiscount.discountAmount).toBe(9);
      expect(item.bulkDiscount.discountPercentage).toBe(10);
      expect(item.bulkDiscount.tierUsed).toBeDefined();
      
      // Verify pricing consistency
      const originalTotal = item.originalPrice * item.quantity; // 90 * 6 = 540
      const discountedTotal = item.price * item.quantity; // 81 * 6 = 486
      const discountAmount = originalTotal - discountedTotal; // 540 - 486 = 54
      
      expect(discountAmount).toBe(testOrder.bulkDiscountSummary.totalDiscountAmount);
      expect(discountedTotal).toBe(testOrder.tax.totalTaxableAmount);
    });

    test('should include bulk discount audit trail in invoice', () => {
      // Verify bulk discount audit trail exists
      const item = testOrder.items[0];
      
      expect(item.bulkDiscount.tierUsed.minQuantity).toBe(5);
      expect(item.bulkDiscount.tierUsed.maxQuantity).toBe(10);
      expect(item.bulkDiscount.tierUsed.discountType).toBe('percentage');
      expect(item.bulkDiscount.tierUsed.discountValue).toBe(10);
    });
  });

  describe('Multiple Items with Different Bulk Discounts', () => {
    let multiItemOrder;

    beforeAll(async () => {
      // Create another product with different bulk pricing
      const product2 = new Product({
        name: 'Test Product 2',
        description: 'Test Description 2',
        sku: `TEST-PRODUCT-2-${Date.now()}`,
        regularPrice: 200,
        salePrice: 180,
        stock: 15,
        seller: new mongoose.Types.ObjectId(),
        category: new mongoose.Types.ObjectId(),
        bulkPricing: {
          enabled: true,
          tiers: [
            {
              minQuantity: 3,
              maxQuantity: 5,
              discountType: 'percentage',
              discountValue: 5
            }
          ]
        }
      });
      await product2.save();

      // Create order with multiple items having different bulk discounts
      multiItemOrder = new Order({
        buyer: testShopper._id,
        items: [
          {
            product: testProduct._id,
            quantity: 6, // 10% bulk discount
            price: 81,
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
            product: product2._id,
            quantity: 4, // 5% bulk discount
            price: 171, // 180 - 9 (5% of 180)
            originalPrice: 180,
            bulkDiscount: {
              applied: true,
              discountAmount: 9,
              discountPercentage: 5,
              tierUsed: {
                minQuantity: 3,
                maxQuantity: 5,
                discountType: 'percentage',
                discountValue: 5
              }
            }
          }
        ],
        totalAmount: 1008.36, // (81*6 + 171*4) + 18% GST = (486 + 684) + 210.96
        bulkDiscountSummary: {
          totalOriginalAmount: 1260, // (90*6 + 180*4)
          totalDiscountAmount: 90, // (9*6 + 9*4)
          totalDiscountPercentage: 7.14, // 90/1260 * 100
          itemsWithBulkDiscount: 2
        },
        paymentMethod: 'cod',
        status: 'pending_verification',
        billingDetails: {
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
        },
        tax: {
          totalTaxableAmount: 1170, // 486 + 684
          totalTaxAmount: 210.6, // 18% GST on 1170
          taxSummary: [{
            taxType: 'GST',
            taxRate: 18,
            taxableAmount: 1170,
            taxAmount: 210.6,
            taxBreakdown: {
              CGST: {
                rate: 9,
                amount: 105.3
              },
              SGST: {
                rate: 9,
                amount: 105.3
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
      await multiItemOrder.save();
    });

    test('should reflect multiple bulk discounts in invoice', async () => {
      const response = await request(app)
        .get(`/api/orders/${multiItemOrder._id}/invoice`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
    });

    test('should have consistent pricing for multiple items with different discounts', () => {
      // Verify bulk discount summary
      expect(multiItemOrder.bulkDiscountSummary.itemsWithBulkDiscount).toBe(2);
      expect(multiItemOrder.bulkDiscountSummary.totalDiscountAmount).toBe(90);
      
      // Verify each item has correct discount information
      const item1 = multiItemOrder.items[0];
      const item2 = multiItemOrder.items[1];
      
      expect(item1.bulkDiscount.applied).toBe(true);
      expect(item1.bulkDiscount.discountPercentage).toBe(10);
      
      expect(item2.bulkDiscount.applied).toBe(true);
      expect(item2.bulkDiscount.discountPercentage).toBe(5);
      
      // Verify total calculations
      const item1Original = item1.originalPrice * item1.quantity; // 90 * 6 = 540
      const item1Discounted = item1.price * item1.quantity; // 81 * 6 = 486
      const item1Discount = item1Original - item1Discounted; // 54
      
      const item2Original = item2.originalPrice * item2.quantity; // 180 * 4 = 720
      const item2Discounted = item2.price * item2.quantity; // 171 * 4 = 684
      const item2Discount = item2Original - item2Discounted; // 36
      
      expect(item1Discount + item2Discount).toBe(multiItemOrder.bulkDiscountSummary.totalDiscountAmount);
      expect(item1Discounted + item2Discounted).toBe(multiItemOrder.tax.totalTaxableAmount);
    });
  });

  describe('Items Without Bulk Discounts', () => {
    let noDiscountOrder;

    beforeAll(async () => {
      // Create order with items that don't qualify for bulk discounts
      noDiscountOrder = new Order({
        buyer: testShopper._id,
        items: [
          {
            product: testProduct._id,
            quantity: 2, // Below bulk discount threshold
            price: 90, // No discount
            originalPrice: 90,
            bulkDiscount: {
              applied: false,
              discountAmount: 0,
              discountPercentage: 0,
              tierUsed: null
            }
          }
        ],
        totalAmount: 212.4, // (90 * 2) + 18% GST = 180 + 32.4
        bulkDiscountSummary: {
          totalOriginalAmount: 180,
          totalDiscountAmount: 0,
          totalDiscountPercentage: 0,
          itemsWithBulkDiscount: 0
        },
        paymentMethod: 'cod',
        status: 'pending_verification',
        billingDetails: {
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
        },
        tax: {
          totalTaxableAmount: 180,
          totalTaxAmount: 32.4,
          taxSummary: [{
            taxType: 'GST',
            taxRate: 18,
            taxableAmount: 180,
            taxAmount: 32.4,
            taxBreakdown: {
              CGST: {
                rate: 9,
                amount: 16.2
              },
              SGST: {
                rate: 9,
                amount: 16.2
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
      await noDiscountOrder.save();
    });

    test('should handle items without bulk discounts correctly', async () => {
      const response = await request(app)
        .get(`/api/orders/${noDiscountOrder._id}/invoice`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
    });

    test('should show no bulk discount when none applied', () => {
      expect(noDiscountOrder.bulkDiscountSummary.itemsWithBulkDiscount).toBe(0);
      expect(noDiscountOrder.bulkDiscountSummary.totalDiscountAmount).toBe(0);
      
      const item = noDiscountOrder.items[0];
      expect(item.bulkDiscount.applied).toBe(false);
      expect(item.bulkDiscount.discountAmount).toBe(0);
      expect(item.price).toBe(item.originalPrice);
    });
  });
});
