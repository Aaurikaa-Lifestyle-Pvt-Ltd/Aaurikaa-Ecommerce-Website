const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Import error handler utilities
const { 
  sendErrorResponse, 
  sendSuccessResponse, 
  ERROR_MESSAGES, 
  ERROR_CODES, 
  HTTP_STATUS, 
  errorHandler,
  asyncHandler 
} = require('../../utils/errorHandler');

// Import models for testing
const Admin = require('../../models/Admin');

describe('Error Handler Utilities', () => {
  let app;
  let mongoServer;

  beforeAll(async () => {
    // Start in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    // Connect to in-memory database
    await mongoose.connect(mongoUri);

    app = express();
    app.use(express.json());
    
    // Test routes
    app.get('/test-success', (req, res) => {
      return sendSuccessResponse(res, HTTP_STATUS.OK, 'Test success', { data: 'test' });
    });
    
    app.get('/test-error', (req, res) => {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, 'Test error', 'TEST_ERROR');
    });
    
    app.get('/test-async-error', asyncHandler(async (req, res) => {
      throw new Error('Async error');
    }));
    
    app.get('/test-validation-error', asyncHandler(async (req, res) => {
      // Create a mock validation error
      const error = new Error('Validation failed');
      error.name = 'ValidationError';
      error.errors = {
        username: { message: 'Username is required' },
        email: { message: 'Email is required' }
      };
      throw error;
    }));
    
    app.get('/test-duplicate-error', asyncHandler(async (req, res) => {
      // Create first admin
      const admin1 = new Admin({
        name: 'Test Admin',
        username: 'testadmin',
        email: 'test@example.com',
        phone: '1234567890',
        password: 'Password123!'
      });
      await admin1.save();
      
      // Try to create duplicate
      const admin2 = new Admin({
        name: 'Test Admin Two',
        username: 'testadmin', // Duplicate username
        email: 'test2@example.com',
        phone: '1234567891',
        password: 'Password123!'
      });
      await admin2.save();
    }));
    
    // Add error handler middleware
    app.use(errorHandler);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clean up collections before each test
    await Admin.deleteMany({});
  });

  describe('sendSuccessResponse', () => {
    it('should send standardized success response', async () => {
      const response = await request(app)
        .get('/test-success')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Test success',
        timestamp: expect.any(String),
        data: { data: 'test' }
      });
    });
  });

  describe('sendErrorResponse', () => {
    it('should send standardized error response', async () => {
      const response = await request(app)
        .get('/test-error')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'Test error',
        code: 'TEST_ERROR',
        timestamp: expect.any(String)
      });
    });
  });

  describe('asyncHandler', () => {
    it('should catch async errors and pass to error handler', async () => {
      const response = await request(app)
        .get('/test-async-error')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        code: ERROR_CODES.INTERNAL_SERVER_ERROR,
        timestamp: expect.any(String)
      });
    });
  });

  describe('errorHandler middleware', () => {
    it('should handle mongoose validation errors', async () => {
      const response = await request(app)
        .get('/test-validation-error')
        .expect(400)
        .timeout(15000);

      expect(response.body).toEqual({
        success: false,
        message: ERROR_MESSAGES.VALIDATION_FAILED,
        code: ERROR_CODES.VALIDATION_FAILED,
        timestamp: expect.any(String),
        details: {
          validationErrors: expect.arrayContaining([
            expect.stringContaining('required')
          ])
        }
      });
    }, 15000);

    it('should handle mongoose duplicate key errors', async () => {
      const response = await request(app)
        .get('/test-duplicate-error')
        .expect(409);

      expect(response.body).toEqual({
        success: false,
        message: 'username already exists',
        code: ERROR_CODES.RESOURCE_ALREADY_EXISTS,
        timestamp: expect.any(String),
        details: {
          field: 'username'
        }
      });
    });
  });

  describe('Error Messages and Codes', () => {
    it('should have all required error messages', () => {
      expect(ERROR_MESSAGES.INVALID_CREDENTIALS).toBeDefined();
      expect(ERROR_MESSAGES.TOKEN_REQUIRED).toBeDefined();
      expect(ERROR_MESSAGES.VALIDATION_FAILED).toBeDefined();
      expect(ERROR_MESSAGES.USER_NOT_FOUND).toBeDefined();
      expect(ERROR_MESSAGES.OTP_INVALID).toBeDefined();
      expect(ERROR_MESSAGES.INTERNAL_SERVER_ERROR).toBeDefined();
    });

    it('should have all required error codes', () => {
      expect(ERROR_CODES.AUTH_INVALID_CREDENTIALS).toBeDefined();
      expect(ERROR_CODES.VALIDATION_FAILED).toBeDefined();
      expect(ERROR_CODES.RESOURCE_NOT_FOUND).toBeDefined();
      expect(ERROR_CODES.OTP_INVALID).toBeDefined();
      expect(ERROR_CODES.INTERNAL_SERVER_ERROR).toBeDefined();
    });

    it('should have all required HTTP status codes', () => {
      expect(HTTP_STATUS.OK).toBe(200);
      expect(HTTP_STATUS.CREATED).toBe(201);
      expect(HTTP_STATUS.BAD_REQUEST).toBe(400);
      expect(HTTP_STATUS.UNAUTHORIZED).toBe(401);
      expect(HTTP_STATUS.FORBIDDEN).toBe(403);
      expect(HTTP_STATUS.NOT_FOUND).toBe(404);
      expect(HTTP_STATUS.CONFLICT).toBe(409);
      expect(HTTP_STATUS.INTERNAL_SERVER_ERROR).toBe(500);
    });
  });
});
