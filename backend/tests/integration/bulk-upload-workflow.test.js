// backend/tests/integration/bulk-upload-workflow.test.js
const request = require('supertest');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Mock verifySeller middleware before importing app
jest.mock('../../middleware/verifySeller', () => {
  const mongoose = require('mongoose');
  return (req, res, next) => {
    // Get seller ID from test context via header
    const sellerIdHeader = req.headers['x-test-seller-id'];
    if (sellerIdHeader) {
      // Convert string to ObjectId
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
      // Try to find seller from authorization header
      const authHeader = req.headers['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        // In tests, we'll set req.user based on test setup
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

describe('Bulk Upload Workflow Integration', () => {
  let seller;
  let category;
  let authToken;
  let sellerId;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test-bulk-workflow');
    }

    // Create test seller
    seller = await Seller.create({
      firstName: 'Test',
      lastName: 'Seller',
      username: 'workflowtest',
      email: 'workflowtest@example.com',
      password: 'hashedpassword',
      phone: '1234567890',
      shopName: 'Test Shop',
      isApproved: true
    });
    sellerId = seller._id;

    // Create test category
    category = await Category.create({
      name: 'Test Category',
      slug: 'test-category',
      description: 'Test category for workflow'
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

  describe('Complete workflow: upload -> parse -> validate -> convert -> save', () => {
    it('should complete full workflow successfully', async () => {
      // Create CSV content
      const csvContent = `name,sku,regularPrice,salePrice,stock,category,shortDesc,status
"Product 1","SKU-WF-001",100.50,90.00,50,"${category._id}","Short desc 1","draft"
"Product 2","SKU-WF-002",200.00,180.00,30,"${category._id}","Short desc 2","draft"
"Product 3","SKU-WF-003",150.75,,25,"${category._id}","Short desc 3","draft"`;

      const response = await request(app)
        .post('/api/seller/products/bulk-upload')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-test-seller-id', sellerId.toString())
        .attach('csvFile', Buffer.from(csvContent), {
          filename: 'workflow-test.csv',
          contentType: 'text/csv'
        });

      // Log response for debugging
      if (response.status !== 201) {
        console.log('Response status:', response.status);
        console.log('Response body:', JSON.stringify(response.body, null, 2));
      }
      
      // If validation failed, check what the actual error is
      if (response.status === 400 && response.body.data) {
        console.log('Validation errors:', response.body.data.errors);
        console.log('Invalid rows:', response.body.data.invalidRows);
      }
      
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.count).toBe(3);
      expect(response.body.data.summary.total).toBe(3);
      expect(response.body.data.summary.valid).toBe(3);
      expect(response.body.data.summary.invalid).toBe(0);

      // Verify products were created with correct types
      const products = await Product.find({ seller: sellerId }).sort({ sku: 1 });
      expect(products).toHaveLength(3);
      
      // Verify type conversion
      expect(typeof products[0].regularPrice).toBe('number');
      expect(products[0].regularPrice).toBe(100.50);
      expect(typeof products[0].salePrice).toBe('number');
      expect(products[0].salePrice).toBe(90.00);
      expect(typeof products[0].stock).toBe('number');
      expect(products[0].stock).toBe(50);
      expect(products[0].category).toBeInstanceOf(mongoose.Types.ObjectId);
      expect(products[0].category.toString()).toBe(category._id.toString());
    });

    it('should handle validation errors in workflow', async () => {
      // Create CSV with invalid data
      const csvContent = `name,sku,regularPrice,stock,category
"Product 1","SKU-WF-001",100,10,"${category._id}"
"Product 2","",0,-10,"invalid-id"
"Product 3","SKU-WF-001",150,25,"${category._id}"`;

      const response = await request(app)
        .post('/api/seller/products/bulk-upload')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-test-seller-id', sellerId.toString())
        .attach('csvFile', Buffer.from(csvContent), {
          filename: 'invalid-test.csv',
          contentType: 'text/csv'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.data.errors).toBeDefined();
      expect(Array.isArray(response.body.data.errors)).toBe(true);
      expect(response.body.data.summary.invalid).toBeGreaterThan(0);

      // Verify no products were created
      const products = await Product.find({ seller: sellerId });
      expect(products).toHaveLength(0);
    });

    it('should handle type conversion in workflow', async () => {
      const csvContent = `name,sku,regularPrice,salePrice,stock,category,isFeatured,taxIncluded,tags
"Product 1","SKU-TC-001","100.50","80.25","10","${category._id}","true","yes","tag1,tag2,tag3"`;

      const response = await request(app)
        .post('/api/seller/products/bulk-upload')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-test-seller-id', sellerId.toString())
        .attach('csvFile', Buffer.from(csvContent), {
          filename: 'type-conversion-test.csv',
          contentType: 'text/csv'
        });

      expect(response.status).toBe(201);

      // Verify type conversion
      const product = await Product.findOne({ sku: 'SKU-TC-001' });
      expect(product).toBeDefined();
      expect(typeof product.regularPrice).toBe('number');
      expect(product.regularPrice).toBe(100.50);
      expect(typeof product.salePrice).toBe('number');
      expect(product.salePrice).toBe(80.25);
      expect(typeof product.stock).toBe('number');
      expect(product.stock).toBe(10);
      expect(typeof product.isFeatured).toBe('boolean');
      expect(product.isFeatured).toBe(true);
      expect(typeof product.taxIncluded).toBe('boolean');
      expect(product.taxIncluded).toBe(true);
      expect(Array.isArray(product.tags)).toBe(true);
      expect(product.tags).toEqual(['tag1', 'tag2', 'tag3']);
    });
  });

  describe('File upload handling', () => {
    it('should handle R2 buffer storage', async () => {
      const csvContent = `name,sku,regularPrice,stock,category
"Product R2","SKU-R2-001",100,10,"${category._id}"`;

      const response = await request(app)
        .post('/api/seller/products/bulk-upload')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-test-seller-id', sellerId.toString())
        .attach('csvFile', Buffer.from(csvContent), {
          filename: 'r2-test.csv',
          contentType: 'text/csv'
        });

      // Should not fail with path error
      expect(response.status).not.toBe(500);
      if (response.status === 500) {
        expect(response.body.message || response.body.data?.error).not.toContain('path');
      }
    });

    it('should handle empty CSV file', async () => {
      const csvContent = 'name,sku,regularPrice,stock,category\n';

      const response = await request(app)
        .post('/api/seller/products/bulk-upload')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-test-seller-id', sellerId.toString())
        .attach('csvFile', Buffer.from(csvContent), {
          filename: 'empty.csv',
          contentType: 'text/csv'
        });

      expect(response.status).toBe(400);
      expect(response.body.data?.error).toContain('empty');
    });
  });

  describe('Seller ownership validation', () => {
    it('should associate products with correct seller', async () => {
      const csvContent = `name,sku,regularPrice,stock,category
"Product Owner","SKU-OWN-001",100,10,"${category._id}"`;

      const response = await request(app)
        .post('/api/seller/products/bulk-upload')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-test-seller-id', sellerId.toString())
        .attach('csvFile', Buffer.from(csvContent), {
          filename: 'owner-test.csv',
          contentType: 'text/csv'
        });

      expect(response.status).toBe(201);

      const product = await Product.findOne({ sku: 'SKU-OWN-001' });
      expect(product).toBeDefined();
      expect(product.seller.toString()).toBe(sellerId.toString());
    });
  });
});

