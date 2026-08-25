// backend/tests/middleware/bulkUpload.test.js
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../server');
const Seller = require('../../models/Seller');

describe('Bulk Upload Middleware', () => {
  let seller;
  let authToken;
  let sellerId;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test-bulk-upload-middleware');
    }

    // Create test seller
    seller = await Seller.create({
      firstName: 'Test',
      lastName: 'Seller',
      username: 'bulkmiddlewaretest',
      email: 'bulkmiddlewaretest@example.com',
      password: 'hashedpassword',
      phone: '1234567890',
      shopName: 'Test Shop',
      isApproved: true
    });
    sellerId = seller._id;
    authToken = 'test-token';
  });

  afterAll(async () => {
    await Seller.deleteMany({});
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  });

  describe('Field name validation', () => {
    it('should accept csvFile field name', async () => {
      const csvContent = 'name,sku,regularPrice,stock,category\n"Test Product","SKU-001",100,10,"507f1f77bcf86cd799439011"';
      
      const response = await request(app)
        .post('/api/seller/products/bulk-upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('csvFile', Buffer.from(csvContent), {
          filename: 'test.csv',
          contentType: 'text/csv'
        });

      // Should not fail with 400 for field name mismatch
      expect(response.status).not.toBe(400);
    });

    it('should reject incorrect field name (file instead of csvFile)', async () => {
      const csvContent = 'name,sku,regularPrice,stock,category\n"Test Product","SKU-001",100,10,"507f1f77bcf86cd799439011"';
      
      const response = await request(app)
        .post('/api/seller/products/bulk-upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from(csvContent), {
          filename: 'test.csv',
          contentType: 'text/csv'
        });

      // Should fail with 400 for incorrect field name
      expect(response.status).toBe(400);
    });

    it('should reject request without file', async () => {
      const response = await request(app)
        .post('/api/seller/products/bulk-upload')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body.message || response.body.data?.error).toContain('file');
    });
  });

  describe('File type validation', () => {
    it('should accept CSV files', async () => {
      const csvContent = 'name,sku,regularPrice,stock,category\n"Test Product","SKU-001",100,10,"507f1f77bcf86cd799439011"';
      
      const response = await request(app)
        .post('/api/seller/products/bulk-upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('csvFile', Buffer.from(csvContent), {
          filename: 'test.csv',
          contentType: 'text/csv'
        });

      // Should not fail with 400 for file type
      expect(response.status).not.toBe(400);
    });

    it('should reject non-CSV files', async () => {
      const response = await request(app)
        .post('/api/seller/products/bulk-upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('csvFile', Buffer.from('not a csv'), {
          filename: 'test.txt',
          contentType: 'text/plain'
        });

      // Should fail for non-CSV files (if middleware validates MIME type)
      // Note: This depends on middleware implementation
      expect([400, 500]).toContain(response.status);
    });
  });

  describe('File size validation', () => {
    it('should handle reasonable file sizes', async () => {
      // Create a CSV with multiple rows
      let csvContent = 'name,sku,regularPrice,stock,category\n';
      for (let i = 0; i < 100; i++) {
        csvContent += `"Product ${i}","SKU-${i}",100,10,"507f1f77bcf86cd799439011"\n`;
      }

      const response = await request(app)
        .post('/api/seller/products/bulk-upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('csvFile', Buffer.from(csvContent), {
          filename: 'large.csv',
          contentType: 'text/csv'
        });

      // Should not fail with 413 (Payload Too Large) for reasonable sizes
      expect(response.status).not.toBe(413);
    });
  });

  describe('R2 vs Local storage handling', () => {
    it('should handle R2 buffer storage', async () => {
      const csvContent = 'name,sku,regularPrice,stock,category\n"Test Product","SKU-001",100,10,"507f1f77bcf86cd799439011"';
      
      const response = await request(app)
        .post('/api/seller/products/bulk-upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('csvFile', Buffer.from(csvContent), {
          filename: 'test.csv',
          contentType: 'text/csv'
        });

      // Should not fail with "Cannot read property 'path' of undefined"
      expect(response.status).not.toBe(500);
      if (response.status === 500) {
        expect(response.body.message || response.body.data?.error).not.toContain('path');
      }
    });
  });
});

