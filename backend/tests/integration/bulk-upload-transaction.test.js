// backend/tests/integration/bulk-upload-transaction.test.js
const request = require('supertest');
const mongoose = require('mongoose');

// Mock verifySeller middleware before importing app
jest.mock('../../middleware/verifySeller', () => {
  const mongoose = require('mongoose');
  return (req, res, next) => {
    const sellerIdHeader = req.headers['x-test-seller-id'];
    if (sellerIdHeader) {
      let sellerIdObj;
      if (mongoose.Types.ObjectId.isValid(sellerIdHeader)) {
        sellerIdObj = new mongoose.Types.ObjectId(sellerIdHeader);
      } else {
        sellerIdObj = sellerIdHeader;
      }
      req.user = {
        _id: sellerIdObj,
        role: 'seller'
      };
      next();
    } else {
      const authHeader = req.headers['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        req.user = { _id: null, role: 'seller' };
        next();
      } else {
        res.status(401).json({ message: 'Unauthorized: No token provided' });
      }
    }
  };
});

const app = require('../helpers/testApp');
const Product = require('../../models/Product');
const Seller = require('../../models/Seller');
const Category = require('../../models/Category');

describe('Bulk Upload Transaction Tests', () => {
  let seller;
  let category;
  let authToken;
  let sellerId;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test-bulk-transaction');
    }

    // Create test seller
    seller = await Seller.create({
      firstName: 'Test',
      lastName: 'Seller',
      username: 'transactiontest',
      email: 'transactiontest@example.com',
      password: 'hashedpassword',
      phone: '1234567890',
      shopName: 'Test Shop',
      shopUrl: 'transaction-test-shop',
      isApproved: true
    });
    sellerId = seller._id;

    // Create test category
    category = await Category.create({
      name: 'Test Category',
      slug: 'test-category',
      description: 'Test category for transaction'
    });

    authToken = 'test-token';
  });

  afterAll(async () => {
    await Product.deleteMany({});
    await Seller.deleteMany({});
    await Category.deleteMany({});
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  });

  beforeEach(async () => {
    await Product.deleteMany({ seller: sellerId });
  });

  describe('Transaction success', () => {
    it('should commit transaction on successful insert', async () => {
      const csvContent = `name,sku,regularPrice,stock,category
"Product TX-1","SKU-TX-001",100,10,"${category._id}"
"Product TX-2","SKU-TX-002",200,20,"${category._id}"
"Product TX-3","SKU-TX-003",300,30,"${category._id}"`;

      const response = await request(app)
        .post('/api/seller/products/bulk-upload')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-test-seller-id', sellerId.toString())
        .attach('csvFile', Buffer.from(csvContent), {
          filename: 'transaction-success.csv',
          contentType: 'text/csv'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);

      // Verify all products were created (transaction committed)
      const products = await Product.find({ seller: sellerId });
      expect(products).toHaveLength(3);
      expect(products.some(p => p.sku === 'SKU-TX-001')).toBe(true);
      expect(products.some(p => p.sku === 'SKU-TX-002')).toBe(true);
      expect(products.some(p => p.sku === 'SKU-TX-003')).toBe(true);
    });
  });

  describe('Transaction rollback', () => {
    it('should rollback on duplicate SKU error', async () => {
      // Create a product with existing SKU
      await Product.create({
        name: 'Existing Product',
        sku: 'SKU-DUPLICATE',
        regularPrice: 100,
        stock: 10,
        category: category._id,
        seller: sellerId
      });

      // Try to upload CSV with same SKU (should pass validation but fail on insert)
      const csvContent = `name,sku,regularPrice,stock,category
"Product TX-1","SKU-DUPLICATE",100,10,"${category._id}"
"Product TX-2","SKU-TX-NEW",200,20,"${category._id}"`;

      const response = await request(app)
        .post('/api/seller/products/bulk-upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('csvFile', Buffer.from(csvContent), {
          filename: 'transaction-duplicate.csv',
          contentType: 'text/csv'
        });

      // Should fail with transaction error
      expect([400, 500]).toContain(response.status);

      // Verify no products were created (transaction rolled back)
      const products = await Product.find({ seller: sellerId, sku: { $in: ['SKU-DUPLICATE', 'SKU-TX-NEW'] } });
      expect(products.length).toBe(1); // Only the existing one
      expect(products[0].sku).toBe('SKU-DUPLICATE');
    });

    it('should rollback on database error', async () => {
      // Create CSV with data that might cause database error
      // Using invalid ObjectId format that passes initial validation but fails on insert
      const csvContent = `name,sku,regularPrice,stock,category
"Product TX-1","SKU-TX-ERROR",100,10,"${category._id}"
"Product TX-2","SKU-TX-ERROR-2",200,20,"invalid-objectid-that-passes-validation"`;

      const response = await request(app)
        .post('/api/seller/products/bulk-upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('csvFile', Buffer.from(csvContent), {
          filename: 'transaction-error.csv',
          contentType: 'text/csv'
        });

      // Should fail (validation should catch invalid ObjectId, but if it doesn't, transaction should rollback)
      expect([400, 500]).toContain(response.status);

      // Verify no products were created (transaction rolled back)
      const products = await Product.find({ seller: sellerId, sku: { $in: ['SKU-TX-ERROR', 'SKU-TX-ERROR-2'] } });
      expect(products).toHaveLength(0);
    });
  });

  describe('Data consistency', () => {
    it('should maintain data consistency with all-or-nothing behavior', async () => {
      // Create CSV with multiple products
      const csvContent = `name,sku,regularPrice,stock,category
"Product CONS-1","SKU-CONS-001",100,10,"${category._id}"
"Product CONS-2","SKU-CONS-002",200,20,"${category._id}"
"Product CONS-3","SKU-CONS-003",300,30,"${category._id}"`;

      const response = await request(app)
        .post('/api/seller/products/bulk-upload')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-test-seller-id', sellerId.toString())
        .attach('csvFile', Buffer.from(csvContent), {
          filename: 'consistency-test.csv',
          contentType: 'text/csv'
        });

      expect(response.status).toBe(201);

      // Verify all products exist (all-or-nothing)
      const products = await Product.find({ seller: sellerId, sku: { $in: ['SKU-CONS-001', 'SKU-CONS-002', 'SKU-CONS-003'] } });
      expect(products).toHaveLength(3);
    });

    it('should not create partial data on failure', async () => {
      // Create a product with existing SKU to cause failure
      await Product.create({
        name: 'Existing',
        sku: 'SKU-PARTIAL',
        regularPrice: 100,
        stock: 10,
        category: category._id,
        seller: sellerId
      });

      // Try to upload CSV with duplicate SKU and new products
      const csvContent = `name,sku,regularPrice,stock,category
"Product PARTIAL-1","SKU-PARTIAL",100,10,"${category._id}"
"Product PARTIAL-2","SKU-PARTIAL-NEW",200,20,"${category._id}"`;

      const response = await request(app)
        .post('/api/seller/products/bulk-upload')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-test-seller-id', sellerId.toString())
        .attach('csvFile', Buffer.from(csvContent), {
          filename: 'partial-test.csv',
          contentType: 'text/csv'
        });

      // Should fail
      expect([400, 500]).toContain(response.status);

      // Verify no new products were created (no partial data)
      const newProduct = await Product.findOne({ sku: 'SKU-PARTIAL-NEW' });
      expect(newProduct).toBeNull();
    });
  });

  describe('Transaction error handling', () => {
    it('should provide clear error message on transaction failure', async () => {
      // Create product with existing SKU
      await Product.create({
        name: 'Existing',
        sku: 'SKU-ERROR-MSG',
        regularPrice: 100,
        stock: 10,
        category: category._id,
        seller: sellerId
      });

      const csvContent = `name,sku,regularPrice,stock,category
"Product ERROR","SKU-ERROR-MSG",100,10,"${category._id}"`;

      const response = await request(app)
        .post('/api/seller/products/bulk-upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('csvFile', Buffer.from(csvContent), {
          filename: 'error-msg-test.csv',
          contentType: 'text/csv'
        });

      // Should have error message
      expect(response.body.message || response.body.data?.error).toBeDefined();
      if (response.status === 500) {
        expect(response.body.message || response.body.data?.error).toContain('transaction');
      }
    });
  });
});

