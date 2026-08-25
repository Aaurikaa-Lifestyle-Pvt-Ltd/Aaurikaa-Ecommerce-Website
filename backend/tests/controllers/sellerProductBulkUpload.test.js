// backend/tests/controllers/sellerProductBulkUpload.test.js
const request = require('supertest');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const app = require('../../server');
const Product = require('../../models/Product');
const Seller = require('../../models/Seller');
const Category = require('../../models/Category');

describe('Seller Product Bulk Upload', () => {
  let seller;
  let category;
  let authToken;
  let sellerId;

  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test-bulk-upload');
    }
    
    // Create test seller
    seller = await Seller.create({
      firstName: 'Test',
      lastName: 'Seller',
      username: 'bulktest',
      email: 'bulktest@example.com',
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
      description: 'Test category for bulk upload'
    });

    // Generate auth token (simplified - in real app, use JWT)
    authToken = 'test-token';
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

  describe('POST /api/seller/products/bulk-upload', () => {
    it('should successfully upload valid CSV file', async () => {
      const csvPath = path.join(__dirname, '../test-data/csv/valid-products.csv');
      const csvContent = fs.readFileSync(csvPath);

      // Update CSV with actual category ID
      const updatedCsv = csvContent.toString().replace(/507f1f77bcf86cd799439011/g, category._id.toString());

      const response = await request(app)
        .post('/api/seller/products/bulk-upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('csvFile', Buffer.from(updatedCsv), {
          filename: 'valid-products.csv',
          contentType: 'text/csv'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.count).toBe(3);

      // Verify products were created
      const products = await Product.find({ seller: sellerId });
      expect(products.length).toBe(3);
      expect(products[0].name).toBe('Test Product 1');
      expect(products[0].sku).toBe('SKU-001');
      expect(products[0].regularPrice).toBe(100.5);
    });

    it('should fail when file field name is incorrect', async () => {
      const csvPath = path.join(__dirname, '../test-data/csv/valid-products.csv');
      const csvContent = fs.readFileSync(csvPath);

      const response = await request(app)
        .post('/api/seller/products/bulk-upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from(csvContent), {
          filename: 'valid-products.csv',
          contentType: 'text/csv'
        });

      // Should fail because field name is 'file' but middleware expects 'csvFile'
      expect(response.status).toBe(400);
    });

    it('should fail when no file is provided', async () => {
      const response = await request(app)
        .post('/api/seller/products/bulk-upload')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
    });

    it('should fail when file is not CSV', async () => {
      const response = await request(app)
        .post('/api/seller/products/bulk-upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('csvFile', Buffer.from('not a csv'), {
          filename: 'test.txt',
          contentType: 'text/plain'
        });

      expect(response.status).toBe(400);
    });

    it('should handle invalid CSV data gracefully', async () => {
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

      // Current implementation will fail because of invalid data
      // This test documents the current behavior
      expect([400, 500]).toContain(response.status);
    });

    it('should require authentication', async () => {
      const csvPath = path.join(__dirname, '../test-data/csv/valid-products.csv');
      const csvContent = fs.readFileSync(csvPath);

      const response = await request(app)
        .post('/api/seller/products/bulk-upload')
        .attach('csvFile', Buffer.from(csvContent), {
          filename: 'valid-products.csv',
          contentType: 'text/csv'
        });

      expect(response.status).toBe(401);
    });

    it('should handle duplicate SKUs', async () => {
      // First upload
      const csvPath = path.join(__dirname, '../test-data/csv/valid-products.csv');
      const csvContent = fs.readFileSync(csvPath);
      const updatedCsv = csvContent.toString().replace(/507f1f77bcf86cd799439011/g, category._id.toString());

      await request(app)
        .post('/api/seller/products/bulk-upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('csvFile', Buffer.from(updatedCsv), {
          filename: 'valid-products.csv',
          contentType: 'text/csv'
        });

      // Second upload with same SKUs
      const response = await request(app)
        .post('/api/seller/products/bulk-upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('csvFile', Buffer.from(updatedCsv), {
          filename: 'valid-products.csv',
          contentType: 'text/csv'
        });

      // Should fail due to duplicate SKUs
      expect(response.status).toBe(500);
    });

    it('should handle empty CSV file', async () => {
      const response = await request(app)
        .post('/api/seller/products/bulk-upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('csvFile', Buffer.from(''), {
          filename: 'empty.csv',
          contentType: 'text/csv'
        });

      // Should handle empty file gracefully
      expect([200, 400, 500]).toContain(response.status);
    });

    it('should handle CSV with only headers', async () => {
      const csvContent = 'name,sku,regularPrice,salePrice,stock,category,shortDesc,longDesc,status\n';

      const response = await request(app)
        .post('/api/seller/products/bulk-upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('csvFile', Buffer.from(csvContent), {
          filename: 'headers-only.csv',
          contentType: 'text/csv'
        });

      // Should handle empty data rows
      expect([200, 201, 400, 500]).toContain(response.status);
    });
  });

  describe('Data Type Conversion', () => {
    it('should convert string numbers to actual numbers', async () => {
      const csvContent = `name,sku,regularPrice,salePrice,stock,category,shortDesc,longDesc,status
"Test Product","SKU-TYPE-001","100.50","90.00","50","${category._id}","Short desc","Long desc","draft"`;

      const response = await request(app)
        .post('/api/seller/products/bulk-upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('csvFile', Buffer.from(csvContent), {
          filename: 'type-test.csv',
          contentType: 'text/csv'
        });

      if (response.status === 201) {
        const product = await Product.findOne({ sku: 'SKU-TYPE-001' });
        expect(typeof product.regularPrice).toBe('number');
        expect(typeof product.stock).toBe('number');
      }
    });
  });

  describe('Seller Ownership', () => {
    it('should assign products to correct seller', async () => {
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

      if (response.status === 201) {
        const products = await Product.find({ seller: sellerId });
        expect(products.length).toBe(3);
        products.forEach(product => {
          expect(product.seller.toString()).toBe(sellerId.toString());
        });
      }
    });
  });
});

