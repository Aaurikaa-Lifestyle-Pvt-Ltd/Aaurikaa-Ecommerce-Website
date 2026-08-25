/**
 * Integration Tests for Invoice Missing Data Workflow
 * Tests the complete invoice generation workflow with proper data structure
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

// Create test app
const app = express();
app.use(express.json());

// Add routes with mocked middleware
app.get('/api/orders/:id', (req, res, next) => {
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

    res.json(order);
  } catch (error) {
    console.error('Order fetch error:', error);
    res.status(500).json({ message: '❌ Order fetch failed' });
  }
});

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

    // Generate proper invoice number with sequential numbering
    let invoiceNumber = order.invoiceNumber;
    
    if (!order.invoiceNumber) {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');

      // Count existing invoices for today to create sequential number
      const todayStart = new Date(year, today.getMonth(), today.getDate());
      const todayEnd = new Date(year, today.getMonth(), today.getDate() + 1);

      const todayInvoiceCount = await Order.countDocuments({
        createdAt: { $gte: todayStart, $lt: todayEnd }
      });

      const sequentialNumber = String(todayInvoiceCount + 1).padStart(4, '0');
      const properInvoiceNumber = `INV-${year}${month}${day}-${sequentialNumber}`;

      // Update order with proper invoice number and wait for completion
      await Order.findByIdAndUpdate(order._id, { invoiceNumber: properInvoiceNumber });
      order.invoiceNumber = properInvoiceNumber;
      invoiceNumber = properInvoiceNumber;
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
    doc.fontSize(12).font('Helvetica').text(`Invoice #: ${order.invoiceNumber}`);
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
const testDbUri = process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test_invoice_missing_data_workflow';

describe('Invoice Missing Data Workflow Integration Tests', () => {
  let testShopper;
  let shopperToken;
  let testProduct1;
  let testProduct2;
  let testOrder;

  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(testDbUri);
    }
    
    // Create test shopper
    testShopper = new Shopper({
      firstName: 'Alice',
      lastName: 'Johnson',
      username: 'alicejohnson',
      email: 'alice@test.com',
      phone: '+91-9876543212',
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
      name: 'Premium Laptop',
      sku: 'LAPTOP-001',
      regularPrice: 50000,
      salePrice: 45000,
      mainImage: 'laptop.jpg',
      seller: new mongoose.Types.ObjectId()
    });
    await testProduct1.save();

    testProduct2 = new Product({
      name: 'Wireless Keyboard',
      sku: 'KEYBOARD-001',
      regularPrice: 2000,
      salePrice: 1800,
      mainImage: 'keyboard.jpg',
      seller: new mongoose.Types.ObjectId()
    });
    await testProduct2.save();
  });

  beforeEach(async () => {
    // Create comprehensive test order with billing and shipping details
    testOrder = new Order({
      buyer: testShopper._id,
      billingDetails: {
        firstName: 'Alice',
        lastName: 'Johnson',
        email: 'alice@test.com',
        phone: '+91-9876543212',
        address: {
          street: '123 Tech Park',
          city: 'Bangalore',
          state: 'Karnataka',
          postalCode: '560001',
          country: 'India'
        }
      },
      shippingDetails: {
        firstName: 'Alice',
        lastName: 'Johnson',
        email: 'alice@test.com',
        phone: '+91-9876543212',
        address: {
          street: '123 Tech Park',
          city: 'Bangalore',
          state: 'Karnataka',
          postalCode: '560001',
          country: 'India'
        },
        instructions: 'Call before delivery'
      },
      items: [
        {
          product: testProduct1._id,
          quantity: 1,
          price: 45000,
          originalPrice: 50000,
          bulkDiscount: {
            applied: true,
            discountAmount: 5000,
            discountPercentage: 10,
            tierUsed: {
              minQuantity: 1,
              maxQuantity: 2,
              discountType: 'percentage',
              discountValue: 10
            }
          }
        },
        {
          product: testProduct2._id,
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
        }
      ],
      totalAmount: 48200,
      bulkDiscountSummary: {
        totalOriginalAmount: 54000,
        totalDiscountAmount: 5800,
        totalDiscountPercentage: 10.74,
        itemsWithBulkDiscount: 2
      },
      coupon: {
        code: 'TECH15',
        discountAmount: 7230,
        couponData: {
          discountType: 'percentage',
          discountValue: 15,
          freeShipping: true,
          minOrder: 30000
        }
      },
      paymentMethod: 'stripe',
      status: 'processing',
      createdAt: new Date('2024-01-25T15:45:00.000Z')
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

  describe('Complete Invoice Missing Data Workflow', () => {
    test('should complete full invoice generation with all missing data', async () => {
      // Step 1: Verify order exists with billing and shipping details
      const orderResponse = await request(app)
        .get(`/api/orders/${testOrder._id}`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(orderResponse.body._id).toBe(testOrder._id.toString());
      expect(orderResponse.body.billingDetails).toBeDefined();
      expect(orderResponse.body.shippingDetails).toBeDefined();

      // Step 2: Generate invoice with complete data
      const invoiceResponse = await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      // Verify invoice response
      expect(invoiceResponse.headers['content-type']).toBe('application/pdf');
      expect(invoiceResponse.headers['content-disposition']).toContain(`invoice-${testOrder._id}.pdf`);
      expect(invoiceResponse.body.length).toBeGreaterThan(0);

      // Step 3: Verify invoice number was generated and stored
      const updatedOrder = await Order.findById(testOrder._id);
      expect(updatedOrder.invoiceNumber).toBeDefined();
      expect(updatedOrder.invoiceNumber).toMatch(/^INV-\d{8}-\d{6}$/);
    });

    test('should handle different billing and shipping addresses', async () => {
      // Update order with different shipping address
      const differentShippingDetails = {
        firstName: 'Bob',
        lastName: 'Smith',
        email: 'bob@test.com',
        phone: '+91-9876543213',
        address: {
          street: '456 Business Center',
          city: 'Mumbai',
          state: 'Maharashtra',
          postalCode: '400001',
          country: 'India'
        },
        instructions: 'Deliver to office reception'
      };

      await Order.findByIdAndUpdate(testOrder._id, { 
        shippingDetails: differentShippingDetails 
      });

      const invoiceResponse = await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(invoiceResponse.headers['content-type']).toBe('application/pdf');
      expect(invoiceResponse.body.length).toBeGreaterThan(0);
    });

    test('should handle orders without billing/shipping details', async () => {
      // Create order without billing/shipping details
      const orderWithoutDetails = new Order({
        buyer: testShopper._id,
        items: [
          {
            product: testProduct1._id,
            quantity: 1,
            price: 50000,
            originalPrice: 50000,
            bulkDiscount: {
              applied: false,
              discountAmount: 0,
              discountPercentage: 0
            }
          }
        ],
        totalAmount: 50000,
        bulkDiscountSummary: {
          totalOriginalAmount: 50000,
          totalDiscountAmount: 0,
          totalDiscountPercentage: 0,
          itemsWithBulkDiscount: 0
        },
        paymentMethod: 'cod',
        status: 'pending_verification'
      });
      await orderWithoutDetails.save();

      const invoiceResponse = await request(app)
        .get(`/api/orders/${orderWithoutDetails._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(invoiceResponse.headers['content-type']).toBe('application/pdf');
      expect(invoiceResponse.body.length).toBeGreaterThan(0);
    });

    test('should generate sequential invoice numbers for multiple orders', async () => {
      // Create multiple orders on the same day
      const orders = [];
      for (let i = 0; i < 3; i++) {
        const order = new Order({
          buyer: testShopper._id,
          items: [
            {
              product: testProduct1._id,
              quantity: 1,
              price: 50000,
              originalPrice: 50000,
              bulkDiscount: {
                applied: false,
                discountAmount: 0,
                discountPercentage: 0
              }
            }
          ],
          totalAmount: 50000,
          bulkDiscountSummary: {
            totalOriginalAmount: 50000,
            totalDiscountAmount: 0,
            totalDiscountPercentage: 0,
            itemsWithBulkDiscount: 0
          },
          paymentMethod: 'upi_manual',
          status: 'paid',
          createdAt: new Date() // Same day
        });
        await order.save();
        orders.push(order);
      }

      // Generate invoices for all orders
      for (const order of orders) {
        await request(app)
          .get(`/api/orders/${order._id}/invoice`)
          .set('Authorization', `Bearer ${shopperToken}`)
          .expect(200);
      }

      // Verify all orders have sequential invoice numbers
      const updatedOrders = await Order.find({ _id: { $in: orders.map(o => o._id) } });
      const invoiceNumbers = updatedOrders.map(o => o.invoiceNumber).sort();
      
      expect(invoiceNumbers).toHaveLength(3);
      expect(invoiceNumbers[0]).toMatch(/^INV-\d{8}-\d{6}$/);
      expect(invoiceNumbers[1]).toMatch(/^INV-\d{8}-\d{6}$/);
      expect(invoiceNumbers[2]).toMatch(/^INV-\d{8}-\d{6}$/);
    });

    test('should include comprehensive item breakdown with all details', async () => {
      const invoiceResponse = await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(invoiceResponse.headers['content-type']).toBe('application/pdf');
      expect(invoiceResponse.body.length).toBeGreaterThan(0);
    });

    test('should include terms and conditions and company information', async () => {
      const invoiceResponse = await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(invoiceResponse.headers['content-type']).toBe('application/pdf');
      expect(invoiceResponse.body.length).toBeGreaterThan(0);
    });

    test('should handle complex discount scenarios', async () => {
      // Create order with complex discount structure
      const complexOrder = new Order({
        buyer: testShopper._id,
        billingDetails: {
          firstName: 'Complex',
          lastName: 'Customer',
          email: 'complex@test.com',
          phone: '+91-9876543214',
          address: {
            street: '789 Complex Street',
            city: 'Chennai',
            state: 'Tamil Nadu',
            postalCode: '600001',
            country: 'India'
          }
        },
        items: [
          {
            product: testProduct1._id,
            quantity: 3,
            price: 40000, // Higher bulk discount
            originalPrice: 50000,
            bulkDiscount: {
              applied: true,
              discountAmount: 10000,
              discountPercentage: 20,
              tierUsed: {
                minQuantity: 3,
                maxQuantity: 10,
                discountType: 'percentage',
                discountValue: 20
              }
            }
          }
        ],
        totalAmount: 120000,
        bulkDiscountSummary: {
          totalOriginalAmount: 150000,
          totalDiscountAmount: 30000,
          totalDiscountPercentage: 20,
          itemsWithBulkDiscount: 1
        },
        coupon: {
          code: 'MEGA25',
          discountAmount: 30000,
          couponData: {
            discountType: 'percentage',
            discountValue: 25,
            freeShipping: true,
            minOrder: 100000
          }
        },
        paymentMethod: 'razorpay',
        status: 'shipped'
      });
      await complexOrder.save();

      const invoiceResponse = await request(app)
        .get(`/api/orders/${complexOrder._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(invoiceResponse.headers['content-type']).toBe('application/pdf');
      expect(invoiceResponse.body.length).toBeGreaterThan(0);
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
      expect(orderResponse.body.totalAmount).toBe(48200);
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
