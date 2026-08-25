// backend/tests/middleware/categoryValidation.test.js
const request = require('supertest');
const express = require('express');
const { validateCategory } = require('../../middleware/validation');
const { sendErrorResponse, HTTP_STATUS, ERROR_CODES } = require('../../utils/errorHandler');

// Create a test app
const app = express();
app.use(express.json());

// Test route that uses the validation middleware
app.post('/test-category', validateCategory, (req, res) => {
  res.json({ success: true, data: req.body });
});

// Error handling middleware
app.use((err, req, res, next) => {
  if (err.name === 'ValidationError') {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      'Validation failed',
      ERROR_CODES.VALIDATION_FAILED,
      { errors: [err.message] }
    );
  }
  next(err);
});

describe('Category Validation Middleware', () => {
  describe('POST /test-category', () => {
    it('should pass validation with valid category data', async () => {
      const validData = {
        name: 'Electronics',
        description: 'Electronic devices and accessories'
      };

      const response = await request(app)
        .post('/test-category')
        .send(validData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Electronics');
      expect(response.body.data.description).toBe('Electronic devices and accessories');
    });

    it('should pass validation with only required name field', async () => {
      const validData = {
        name: 'Books'
      };

      const response = await request(app)
        .post('/test-category')
        .send(validData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Books');
    });

    it('should fail validation when name is missing', async () => {
      const invalidData = {
        description: 'Some description'
      };

      const response = await request(app)
        .post('/test-category')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
      expect(response.body.details.errors).toContain('Missing required fields: name');
    });

    it('should fail validation when name is empty string', async () => {
      const invalidData = {
        name: '',
        description: 'Some description'
      };

      const response = await request(app)
        .post('/test-category')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.details.errors).toContain('Missing required fields: name');
    });

    it('should fail validation when name is too short', async () => {
      const invalidData = {
        name: 'A',
        description: 'Some description'
      };

      const response = await request(app)
        .post('/test-category')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.details.errors).toContain('Invalid name format');
    });

    it('should fail validation when name is too long', async () => {
      const invalidData = {
        name: 'A'.repeat(51),
        description: 'Some description'
      };

      const response = await request(app)
        .post('/test-category')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.details.errors).toContain('Invalid name format');
    });

    it('should fail validation when name contains invalid characters', async () => {
      const invalidData = {
        name: 'Electronics@#$',
        description: 'Some description'
      };

      const response = await request(app)
        .post('/test-category')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.details.errors).toContain('Invalid name format');
    });

    it('should pass validation with long-form description', async () => {
      const validData = {
        name: 'Electronics',
        description: 'A'.repeat(600)
      };

      const response = await request(app)
        .post('/test-category')
        .send(validData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.description).toHaveLength(600);
    });

    it('should fail validation when description exceeds long-form limit', async () => {
      const invalidData = {
        name: 'Electronics',
        description: 'A'.repeat(20001)
      };

      const response = await request(app)
        .post('/test-category')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.details.errors).toContain('Invalid description format');
    });

    it('should pass validation when updating legacy fields without new optional fields', async () => {
      const validData = {
        name: 'Electronics',
        taxRate: 18,
        taxType: 'GST',
        showInMegaMenu: true,
        commissionRate: 10
      };

      const response = await request(app)
        .post('/test-category')
        .send(validData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Electronics');
      expect(response.body.data.taxRate).toBe(18);
      expect(response.body.data.title).toBeUndefined();
      expect(response.body.data.faq).toBeUndefined();
    });

    it('should pass validation with valid name containing allowed special characters', async () => {
      const validData = {
        name: 'Home & Garden',
        description: 'Home and garden products'
      };

      const response = await request(app)
        .post('/test-category')
        .send(validData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Home & Garden');
    });

    it('should pass validation with valid name containing numbers', async () => {
      const validData = {
        name: 'Electronics 2024',
        description: 'Latest electronics'
      };

      const response = await request(app)
        .post('/test-category')
        .send(validData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Electronics 2024');
    });

    it('should sanitize input data', async () => {
      const dataWithWhitespace = {
        name: '  Electronics  ',
        description: '  Electronic devices  '
      };

      const response = await request(app)
        .post('/test-category')
        .send(dataWithWhitespace)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Electronics');
      expect(response.body.data.description).toBe('Electronic devices');
    });
  });
});
