const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// Mock the models and middleware
jest.mock('../../models/Product');
jest.mock('../../models/Shopper');
jest.mock('../../middleware/verifySeller');
jest.mock('../../middleware/verifyShopper');

const Product = require('../../models/Product');
const Shopper = require('../../models/Shopper');
const { verifySeller } = require('../../middleware/verifySeller');
const { verifyShopper } = require('../../middleware/verifyShopper');

// Import controllers
const sellerProductController = require('../../controllers/sellerProductController');
const adminProductController = require('../../controllers/adminProductController');
const shopperController = require('../../controllers/shopperController');

describe('Upload Controller Error Handling Standardization', () => {
  let app;
  let mockSeller;
  let mockShopper;
  let mockProduct;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Mock seller
    mockSeller = {
      _id: 'seller123',
      email: 'seller@test.com',
      username: 'testseller'
    };

    // Mock shopper
    mockShopper = {
      _id: 'shopper123',
      email: 'shopper@test.com',
      username: 'testshopper'
    };

    // Mock product
    mockProduct = {
      _id: 'product123',
      name: 'Test Product',
      seller: 'seller123',
      mainImage: 'test-image.jpg',
      galleryImages: ['gallery1.jpg', 'gallery2.jpg'],
      video: 'test-video.mp4'
    };

    // Mock middleware
    verifySeller.mockImplementation((req, res, next) => {
      req.user = mockSeller;
      next();
    });

    verifyShopper.mockImplementation((req, res, next) => {
      req.user = mockShopper;
      next();
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Seller Product Controller Error Handling', () => {
    beforeEach(() => {
      // Setup routes
      app.put('/api/seller/products/:id', verifySeller, sellerProductController.updateProduct);
      app.delete('/api/seller/products/:id', verifySeller, sellerProductController.deleteProduct);
      app.post('/api/seller/products/bulk-upload', verifySeller, sellerProductController.bulkUploadProducts);
    });

    test('should return standardized error response for product not found', async () => {
      Product.findOneAndDelete.mockResolvedValue(null);

      const response = await request(app)
        .delete('/api/seller/products/nonexistent')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        success: false,
        message: 'Product not found',
        code: 'RESOURCE_NOT_FOUND',
        timestamp: expect.any(String)
      });
    });

    test('should return standardized error response for update failure', async () => {
      Product.findByIdAndUpdate.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .put('/api/seller/products/product123')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Updated Product' });

      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        success: false,
        message: '❌ Failed to update product',
        code: 'INTERNAL_SERVER_ERROR',
        details: { error: 'Database connection failed' },
        timestamp: expect.any(String)
      });
    });

    test('should return standardized success response for successful update', async () => {
      const updatedProduct = { ...mockProduct, name: 'Updated Product' };
      Product.findByIdAndUpdate.mockResolvedValue(updatedProduct);

      const response = await request(app)
        .put('/api/seller/products/product123')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Updated Product' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        message: '✅ Product updated successfully',
        data: { product: updatedProduct },
        timestamp: expect.any(String)
      });
    });

    test('should return standardized success response for successful deletion', async () => {
      Product.findOneAndDelete.mockResolvedValue(mockProduct);

      const response = await request(app)
        .delete('/api/seller/products/product123')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        message: '✅ Product deleted successfully',
        timestamp: expect.any(String)
      });
    });
  });

  describe('Admin Product Controller Error Handling', () => {
    beforeEach(() => {
      // Setup routes
      app.put('/api/admin/products/:id', adminProductController.updateProduct);
      app.delete('/api/admin/products/:id', adminProductController.deleteProduct);
      app.post('/api/admin/products/bulk-upload', adminProductController.bulkUploadProducts);
    });

    test('should return standardized error response for product not found', async () => {
      Product.findByIdAndDelete.mockResolvedValue(null);

      const response = await request(app)
        .delete('/api/admin/products/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        success: false,
        message: 'Product not found',
        code: 'RESOURCE_NOT_FOUND',
        timestamp: expect.any(String)
      });
    });

    test('should return standardized error response for update failure', async () => {
      Product.findByIdAndUpdate.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .put('/api/admin/products/product123')
        .send({ name: 'Updated Product' });

      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        success: false,
        message: '❌ Failed to update product',
        code: 'INTERNAL_SERVER_ERROR',
        details: { error: 'Database connection failed' },
        timestamp: expect.any(String)
      });
    });

    test('should return standardized success response for successful update', async () => {
      const updatedProduct = { ...mockProduct, name: 'Updated Product' };
      Product.findByIdAndUpdate.mockResolvedValue(updatedProduct);

      const response = await request(app)
        .put('/api/admin/products/product123')
        .send({ name: 'Updated Product' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        message: '✅ Product updated successfully',
        data: { product: updatedProduct },
        timestamp: expect.any(String)
      });
    });
  });

  describe('Shopper Controller Error Handling', () => {
    beforeEach(() => {
      // Setup routes
      app.post('/api/shopper/register', shopperController.registerShopper);
      app.post('/api/shopper/verify-registration', shopperController.verifyRegistration);
    });

    test('should return standardized error response for duplicate email/username', async () => {
      Shopper.findOne.mockResolvedValue(mockShopper);

      const response = await request(app)
        .post('/api/shopper/register')
        .send({
          firstName: 'Test',
          lastName: 'User',
          username: 'testshopper',
          email: 'shopper@test.com',
          phone: '1234567890',
          password: 'password123'
        });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        message: '❌ Email or username already exists',
        code: 'RESOURCE_ALREADY_EXISTS',
        timestamp: expect.any(String)
      });
    });

    test('should return standardized error response for server error', async () => {
      Shopper.findOne.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .post('/api/shopper/register')
        .send({
          firstName: 'Test',
          lastName: 'User',
          username: 'newuser',
          email: 'newuser@test.com',
          phone: '1234567890',
          password: 'password123'
        });

      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        success: false,
        message: '❌ Server error',
        code: 'INTERNAL_SERVER_ERROR',
        timestamp: expect.any(String)
      });
    });

    test('should return standardized success response for successful registration', async () => {
      Shopper.findOne.mockResolvedValue(null);
      Shopper.prototype.save.mockResolvedValue(mockShopper);

      const response = await request(app)
        .post('/api/shopper/verify-registration')
        .send({
          email: 'newuser@test.com',
          otp: '123456',
          firstName: 'Test',
          lastName: 'User',
          username: 'newuser',
          phone: '1234567890',
          password: 'password123'
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        success: true,
        message: '✅ Shopper registered and verified successfully',
        timestamp: expect.any(String)
      });
    });
  });

  describe('Error Response Format Consistency', () => {
    test('all error responses should have consistent structure', async () => {
      // Test different error scenarios to ensure consistent format
      const errorScenarios = [
        { controller: 'seller', endpoint: 'PUT /api/seller/products/nonexistent', expectedStatus: 500 },
        { controller: 'admin', endpoint: 'DELETE /api/admin/products/nonexistent', expectedStatus: 404 },
        { controller: 'shopper', endpoint: 'POST /api/shopper/register', expectedStatus: 500 }
      ];

      for (const scenario of errorScenarios) {
        // Mock database error for all scenarios
        if (scenario.controller === 'seller') {
          Product.findByIdAndUpdate.mockRejectedValue(new Error('Database error'));
        } else if (scenario.controller === 'admin') {
          Product.findByIdAndDelete.mockResolvedValue(null);
        } else if (scenario.controller === 'shopper') {
          Shopper.findOne.mockRejectedValue(new Error('Database error'));
        }

        const [method, path] = scenario.endpoint.split(' ');
        let response;

        if (method === 'PUT') {
          response = await request(app)
            .put(path)
            .set('Authorization', 'Bearer valid-token')
            .send({ name: 'Test' });
        } else if (method === 'DELETE') {
          response = await request(app).delete(path);
        } else if (method === 'POST') {
          response = await request(app)
            .post(path)
            .send({
              firstName: 'Test',
              lastName: 'User',
              username: 'testuser',
              email: 'test@test.com',
              phone: '1234567890',
              password: 'password123'
            });
        }

        expect(response.status).toBe(scenario.expectedStatus);
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
        expect(response.body).toHaveProperty('timestamp');
        expect(response.body).toHaveProperty('code');
      }
    });

    test('all success responses should have consistent structure', async () => {
      // Test success scenarios
      const successScenarios = [
        { controller: 'seller', endpoint: 'PUT /api/seller/products/product123' },
        { controller: 'admin', endpoint: 'DELETE /api/admin/products/product123' }
      ];

      for (const scenario of successScenarios) {
        // Mock successful operations
        if (scenario.controller === 'seller') {
          Product.findByIdAndUpdate.mockResolvedValue(mockProduct);
        } else if (scenario.controller === 'admin') {
          Product.findByIdAndDelete.mockResolvedValue(mockProduct);
        }

        const [method, path] = scenario.endpoint.split(' ');
        let response;

        if (method === 'PUT') {
          response = await request(app)
            .put(path)
            .set('Authorization', 'Bearer valid-token')
            .send({ name: 'Updated Product' });
        } else if (method === 'DELETE') {
          response = await request(app).delete(path);
        }

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('message');
        expect(response.body).toHaveProperty('timestamp');
      }
    });
  });
});
