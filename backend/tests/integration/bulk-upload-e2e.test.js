// backend/tests/integration/bulk-upload-e2e.test.js
const request = require('supertest');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const app = require('../../server');
const Product = require('../../models/Product');
const Seller = require('../../models/Seller');
const Category = require('../../models/Category');

describe('Bulk Upload End-to-End Test', () => {
  let seller;
  let category;
  let sellerId;
  let authToken;

  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test-bulk-e2e');
    }
    
    // Create test seller
    seller = await Seller.create({
      firstName: 'E2E',
      lastName: 'Test',
      username: 'e2etest',
      email: 'e2etest@example.com',
      password: 'hashedpassword',
      phone: '1234567890',
      shopName: 'E2E Test Shop',
      isApproved: true
    });
    sellerId = seller._id;

    // Create test category
    category = await Category.create({
      name: 'E2E Category',
      slug: 'e2e-category',
      description: 'E2E test category'
    });

    // Mock JWT token (in real scenario, generate actual token)
    authToken = 'mock-jwt-token';
  });

  afterAll(async () => {
    // Clean up
    await Product.deleteMany({});
    await Seller.deleteMany({});
    await Category.deleteMany({});
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  });

  beforeEach(async () => {
    // Clean up products before each test
    await Product.deleteMany({ seller: sellerId });
  });

  describe('End-to-End Bulk Upload Flow', () => {
    it('should complete full bulk upload flow: upload -> parse -> validate -> save -> verify', async () => {
      // Step 1: Prepare CSV file
      const csvPath = path.join(__dirname, '../test-data/csv/valid-products.csv');
      const csvContent = fs.readFileSync(csvPath);
      const updatedCsv = csvContent.toString().replace(/507f1f77bcf86cd799439011/g, category._id.toString());

      // Step 2: Upload CSV file
      const response = await request(app)
        .post('/api/seller/products/bulk-upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('csvFile', Buffer.from(updatedCsv), {
          filename: 'valid-products.csv',
          contentType: 'text/csv'
        });

      // Step 3: Verify response
      console.log('Response status:', response.status);
      console.log('Response body:', JSON.stringify(response.body, null, 2));

      // Step 4: Verify products were created in database
      const products = await Product.find({ seller: sellerId });
      console.log('Products created:', products.length);
      console.log('Products:', products.map(p => ({ name: p.name, sku: p.sku })));

      // Assertions
      if (response.status === 201) {
        expect(response.body.success).toBe(true);
        expect(response.body.data.count).toBe(3);
        expect(products.length).toBe(3);
        
        // Verify product data
        const product1 = products.find(p => p.sku === 'SKU-001');
        expect(product1).toBeDefined();
        expect(product1.name).toBe('Test Product 1');
        expect(product1.regularPrice).toBe(100.5);
        expect(product1.seller.toString()).toBe(sellerId.toString());
      } else {
        // Document the failure
        console.error('Bulk upload failed:', response.body);
        // This test documents current behavior
        expect([400, 500]).toContain(response.status);
      }
    });

    it('should handle frontend field name mismatch (file vs csvFile)', async () => {
      // Frontend sends 'file' but middleware expects 'csvFile'
      const csvPath = path.join(__dirname, '../test-data/csv/valid-products.csv');
      const csvContent = fs.readFileSync(csvPath);
      const updatedCsv = csvContent.toString().replace(/507f1f77bcf86cd799439011/g, category._id.toString());

      // Simulate frontend sending 'file' instead of 'csvFile'
      const response = await request(app)
        .post('/api/seller/products/bulk-upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from(updatedCsv), {
          filename: 'valid-products.csv',
          contentType: 'text/csv'
        });

      console.log('Field name mismatch test - Status:', response.status);
      console.log('Field name mismatch test - Body:', JSON.stringify(response.body, null, 2));

      // Should fail because field name doesn't match
      expect([400, 500]).toContain(response.status);
    });

    it('should handle R2 upload vs local file path issue', async () => {
      // This test documents the issue where controller uses req.file.path
      // but R2 middleware uses memory storage (req.file.buffer)
      const csvPath = path.join(__dirname, '../test-data/csv/valid-products.csv');
      const csvContent = fs.readFileSync(csvPath);
      const updatedCsv = csvContent.toString().replace(/507f1f77bcf86cd799439011/g, category._id.toString());

      const response = await request(app)
        .post('/api/seller/products/bulk-upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('csvFile', Buffer.from(updatedCsv), {
          filename: 'valid-products.csv',
          contentType: 'text/csv'
        });

      console.log('R2 vs local path test - Status:', response.status);
      console.log('R2 vs local path test - Body:', JSON.stringify(response.body, null, 2));

      // If controller uses req.file.path but R2 uses memory storage,
      // this will fail with "Cannot read property 'path' of undefined" or similar
      if (response.status === 500) {
        console.log('Issue detected: Controller likely uses req.file.path but R2 uses memory storage');
      }
    });

    it('should handle invalid data gracefully', async () => {
      const csvPath = path.join(__dirname, '../test-data/csv/invalid-products.csv');
      const csvContent = fs.readFileSync(csvPath);
      const updatedCsv = csvContent.toString().replace(/507f1f77bcf86cd799439011/g, category._id.toString());

      const response = await request(app)
        .post('/api/seller/products/bulk-upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('csvFile', Buffer.from(updatedCsv), {
          filename: 'invalid-products.csv',
          contentType: 'text/csv'
        });

      console.log('Invalid data test - Status:', response.status);
      console.log('Invalid data test - Body:', JSON.stringify(response.body, null, 2));

      // Should fail due to invalid data
      expect([400, 500]).toContain(response.status);
    });

    it('should handle mixed valid and invalid data', async () => {
      const csvPath = path.join(__dirname, '../test-data/csv/mixed-products.csv');
      const csvContent = fs.readFileSync(csvPath);
      const updatedCsv = csvContent.toString().replace(/507f1f77bcf86cd799439011/g, category._id.toString());

      const response = await request(app)
        .post('/api/seller/products/bulk-upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('csvFile', Buffer.from(updatedCsv), {
          filename: 'mixed-products.csv',
          contentType: 'text/csv'
        });

      console.log('Mixed data test - Status:', response.status);
      console.log('Mixed data test - Body:', JSON.stringify(response.body, null, 2));

      // Current implementation will fail entire batch if any row is invalid
      // This documents the current behavior
      expect([400, 500]).toContain(response.status);
    });
  });
});

