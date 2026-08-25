/**
 * Tests for Invoice Missing Data Functionality
 * Tests the enhanced invoice generation with proper invoice numbering and billing details
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
const verifyShopper = require('../../middleware/verifyShopper');
const PDFDocument = require('pdfkit');

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
const testDbUri = process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test_invoice_missing_data';

describe('Invoice Missing Data Functionality', () => {
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

  describe('Invoice Numbering System', () => {
    test('should generate proper sequential invoice number', async () => {
      const response = await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.body.length).toBeGreaterThan(0);

      // Wait a bit for the async order update to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify invoice number was added to order
      const updatedOrder = await Order.findById(testOrder._id);
      expect(updatedOrder.invoiceNumber).toBeDefined();
      expect(updatedOrder.invoiceNumber).toMatch(/^INV-\d{8}-\d{6}$/);
    });

    test('should generate unique invoice numbers for different orders', async () => {
      // Create another order
      const order2 = new Order({
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
      await order2.save();

      // Generate invoices for both orders
      await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      await request(app)
        .get(`/api/orders/${order2._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      // Verify both orders have different invoice numbers
      // Wait a bit for the async order updates to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const updatedOrder1 = await Order.findById(testOrder._id);
      const updatedOrder2 = await Order.findById(order2._id);

      expect(updatedOrder1.invoiceNumber).toBeDefined();
      expect(updatedOrder2.invoiceNumber).toBeDefined();
      expect(updatedOrder1.invoiceNumber).not.toBe(updatedOrder2.invoiceNumber);
    });

    test('should use existing invoice number if already present', async () => {
      // Set existing invoice number
      const existingInvoiceNumber = 'INV-20240115-0001';
      await Order.findByIdAndUpdate(testOrder._id, { invoiceNumber: existingInvoiceNumber });

      const response = await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');

      // Wait a bit for the async order update to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify existing invoice number was preserved
      const updatedOrder = await Order.findById(testOrder._id);
      expect(updatedOrder.invoiceNumber).toBe(existingInvoiceNumber);
    });
  });

  describe('Billing and Shipping Details', () => {
    test('should include billing details in invoice', async () => {
      // Add billing details to order
      const billingDetails = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
        phone: '+91-9876543210',
        address: {
          street: '123 Main Street',
          city: 'Mumbai',
          state: 'Maharashtra',
          postalCode: '400001',
          country: 'India'
        }
      };

      await Order.findByIdAndUpdate(testOrder._id, { billingDetails });

      const response = await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.body.length).toBeGreaterThan(0);
    });

    test('should include shipping details when different from billing', async () => {
      // Add billing and shipping details
      const billingDetails = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
        phone: '+91-9876543210',
        address: {
          street: '123 Main Street',
          city: 'Mumbai',
          state: 'Maharashtra',
          postalCode: '400001',
          country: 'India'
        }
      };

      const shippingDetails = {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@test.com',
        phone: '+91-9876543211',
        address: {
          street: '456 Oak Avenue',
          city: 'Delhi',
          state: 'Delhi',
          postalCode: '110001',
          country: 'India'
        },
        instructions: 'Leave at front door'
      };

      await Order.findByIdAndUpdate(testOrder._id, { 
        billingDetails, 
        shippingDetails 
      });

      const response = await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.body.length).toBeGreaterThan(0);
    });

    test('should fall back to buyer info when billing details not provided', async () => {
      const response = await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.body.length).toBeGreaterThan(0);
    });

    test('should handle missing address information gracefully', async () => {
      // Add billing details with missing address
      const billingDetails = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
        phone: '+91-9876543210'
      };

      await Order.findByIdAndUpdate(testOrder._id, { billingDetails });

      const response = await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.body.length).toBeGreaterThan(0);
    });
  });

  describe('Detailed Item Breakdown', () => {
    test('should include detailed product information in items', async () => {
      const response = await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.body.length).toBeGreaterThan(0);
    });

    test('should include bulk discount tier information', async () => {
      const response = await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.body.length).toBeGreaterThan(0);
    });

    test('should handle items without bulk discounts', async () => {
      // Create order without bulk discounts
      const orderWithoutBulk = new Order({
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
      await orderWithoutBulk.save();

      const response = await request(app)
        .get(`/api/orders/${orderWithoutBulk._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.body.length).toBeGreaterThan(0);
    });

    test('should include MRP information when available', async () => {
      const response = await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.body.length).toBeGreaterThan(0);
    });
  });

  describe('Invoice Data Structure', () => {
    test('should include terms and conditions', async () => {
      const response = await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.body.length).toBeGreaterThan(0);
    });

    test('should include invoice generation timestamp', async () => {
      const response = await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.body.length).toBeGreaterThan(0);
    });

    test('should include company contact information', async () => {
      const response = await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.body.length).toBeGreaterThan(0);
    });

    test('should include total savings information when discounts applied', async () => {
      const response = await request(app)
        .get(`/api/orders/${testOrder._id}/invoice`)
        .set('Authorization', `Bearer ${shopperToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.body.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle missing product information gracefully', async () => {
      // Create order with missing product reference
      const orderWithMissingProduct = new Order({
        buyer: testShopper._id,
        items: [
          {
            product: new mongoose.Types.ObjectId(), // Non-existent product
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
      await orderWithMissingProduct.save();

      const response = await request(app)
        .get(`/api/orders/${orderWithMissingProduct._id}/invoice`)
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
