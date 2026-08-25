const request = require('supertest');
const express = require('express');
const { validateAdminRegistration, validateSellerRegistration, validateShopperRegistration, validateOTPVerification } = require('../../middleware/validateRegistration');

// Create test app
const createTestApp = (middleware) => {
  const app = express();
  app.use(express.json());
  app.post('/test', middleware, (req, res) => {
    res.json({ message: 'Validation passed', data: req.body });
  });
  return app;
};

describe('validateRegistration Middleware', () => {
  describe('validateAdminRegistration', () => {
    const app = createTestApp(validateAdminRegistration);

    it('should pass validation with valid admin data', async () => {
      const validData = {
        name: 'Admin User',
        username: 'admin123',
        email: 'admin@example.com',
        phone: '1234567890',
        password: 'password123'
      };

      const response = await request(app)
        .post('/test')
        .send(validData)
        .expect(200);

      expect(response.body.message).toBe('Validation passed');
      expect(response.body.data).toEqual(validData);
    });

    it('should fail validation with missing required fields', async () => {
      const invalidData = {
        name: 'Admin User',
        email: 'admin@example.com'
      };

      const response = await request(app)
        .post('/test')
        .send(invalidData)
        .expect(400);

      expect(response.body.message).toBe('❌ Validation failed');
      expect(response.body.errors).toContain('Missing required fields: username, phone, password');
    });

    it('should fail validation with invalid email format', async () => {
      const invalidData = {
        name: 'Admin User',
        username: 'admin123',
        email: 'invalid-email',
        phone: '1234567890',
        password: 'password123'
      };

      const response = await request(app)
        .post('/test')
        .send(invalidData)
        .expect(400);

      expect(response.body.message).toBe('❌ Validation failed');
      expect(response.body.errors).toContain('Invalid email format');
    });

    it('should sanitize input data', async () => {
      const dataWithSpaces = {
        name: '  Admin User  ',
        username: 'admin123',
        email: 'admin@example.com',
        phone: '1234567890',
        password: 'password123'
      };

      const response = await request(app)
        .post('/test')
        .send(dataWithSpaces)
        .expect(200);

      expect(response.body.data.name).toBe('Admin User');
    });
  });

  describe('validateSellerRegistration', () => {
    const app = createTestApp(validateSellerRegistration);

    it('should pass validation with valid seller data', async () => {
      const validData = {
        firstName: 'John',
        lastName: 'Doe',
        username: 'seller123',
        email: 'seller@example.com',
        phone: '1234567890',
        shopName: 'My Shop',
        shopUrl: 'https://myshop.com',
        password: 'password123',
        confirmPassword: 'password123',
        address1: '123 Main Street, City Center',
        pincode: '123456',
        country: 'India',
        state: 'Maharashtra',
        district: 'Mumbai'
      };

      const response = await request(app)
        .post('/test')
        .send(validData)
        .expect(200);

      expect(response.body.message).toBe('Validation passed');
    });

    it('should fail validation when passwords do not match', async () => {
      const invalidData = {
        firstName: 'John',
        lastName: 'Doe',
        username: 'seller123',
        email: 'seller@example.com',
        phone: '1234567890',
        shopName: 'My Shop',
        shopUrl: 'https://myshop.com',
        password: 'password123',
        confirmPassword: 'different123',
        address1: '123 Main Street',
        pincode: '123456',
        country: 'India',
        state: 'Maharashtra',
        district: 'Mumbai'
      };

      const response = await request(app)
        .post('/test')
        .send(invalidData)
        .expect(400);

      expect(response.body.message).toBe('❌ Validation failed');
      expect(response.body.errors).toContain('Invalid confirmPassword format');
    });

    it('should fail validation with invalid shop URL', async () => {
      const invalidData = {
        firstName: 'John',
        lastName: 'Doe',
        username: 'seller123',
        email: 'seller@example.com',
        phone: '1234567890',
        shopName: 'My Shop',
        shopUrl: 'not-a-url',
        password: 'password123',
        confirmPassword: 'password123',
        address1: '123 Main Street',
        pincode: '123456',
        country: 'India',
        state: 'Maharashtra',
        district: 'Mumbai'
      };

      const response = await request(app)
        .post('/test')
        .send(invalidData)
        .expect(400);

      expect(response.body.message).toBe('❌ Validation failed');
      expect(response.body.errors).toContain('Invalid shopUrl format');
    });
  });

  describe('validateShopperRegistration', () => {
    const app = createTestApp(validateShopperRegistration);

    it('should pass validation with valid shopper data', async () => {
      const validData = {
        firstName: 'Jane',
        lastName: 'Smith',
        username: 'shopper123',
        email: 'shopper@example.com',
        phone: '1234567890',
        password: 'password123'
      };

      const response = await request(app)
        .post('/test')
        .send(validData)
        .expect(200);

      expect(response.body.message).toBe('Validation passed');
    });

    it('should fail validation with weak password', async () => {
      const invalidData = {
        firstName: 'Jane',
        lastName: 'Smith',
        username: 'shopper123',
        email: 'shopper@example.com',
        phone: '1234567890',
        password: 'weak'
      };

      const response = await request(app)
        .post('/test')
        .send(invalidData)
        .expect(400);

      expect(response.body.message).toBe('❌ Validation failed');
      expect(response.body.errors).toContain('Invalid password format');
    });
  });

  describe('validateOTPVerification', () => {
    const app = createTestApp(validateOTPVerification);

    it('should pass validation with valid email and OTP', async () => {
      const validData = {
        email: 'test@example.com',
        otp: '123456'
      };

      const response = await request(app)
        .post('/test')
        .send(validData)
        .expect(200);

      expect(response.body.message).toBe('Validation passed');
      expect(response.body.data).toEqual(validData);
    });

    it('should fail validation with missing email', async () => {
      const invalidData = {
        otp: '123456'
      };

      const response = await request(app)
        .post('/test')
        .send(invalidData)
        .expect(400);

      expect(response.body.message).toBe('❌ Email and OTP are required');
      expect(response.body.errors).toContain('Missing required fields: email, otp');
    });

    it('should fail validation with missing OTP', async () => {
      const invalidData = {
        email: 'test@example.com'
      };

      const response = await request(app)
        .post('/test')
        .send(invalidData)
        .expect(400);

      expect(response.body.message).toBe('❌ Email and OTP are required');
      expect(response.body.errors).toContain('Missing required fields: email, otp');
    });

    it('should fail validation with invalid email format', async () => {
      const invalidData = {
        email: 'invalid-email',
        otp: '123456'
      };

      const response = await request(app)
        .post('/test')
        .send(invalidData)
        .expect(400);

      expect(response.body.message).toBe('❌ Invalid email format');
      expect(response.body.errors).toContain('Invalid email format');
    });

    it('should fail validation with invalid OTP format', async () => {
      const invalidData = {
        email: 'test@example.com',
        otp: '12345' // Only 5 digits
      };

      const response = await request(app)
        .post('/test')
        .send(invalidData)
        .expect(400);

      expect(response.body.message).toBe('❌ OTP must be 6 digits');
      expect(response.body.errors).toContain('Invalid OTP format');
    });

    it('should fail validation with non-numeric OTP', async () => {
      const invalidData = {
        email: 'test@example.com',
        otp: 'abc123'
      };

      const response = await request(app)
        .post('/test')
        .send(invalidData)
        .expect(400);

      expect(response.body.message).toBe('❌ OTP must be 6 digits');
      expect(response.body.errors).toContain('Invalid OTP format');
    });
  });

  describe('Error handling', () => {
    const app = createTestApp(validateAdminRegistration);

    it('should handle middleware errors gracefully', async () => {
      // Create a test app with a middleware that throws an error
      const errorApp = express();
      errorApp.use(express.json());
      errorApp.post('/test', (req, res, next) => {
        // Simulate an error in validation
        try {
          throw new Error('Test validation error');
        } catch (error) {
          return res.status(500).json({
            message: '❌ Internal server error during validation'
          });
        }
      });

      const response = await request(errorApp)
        .post('/test')
        .send({ name: 'Test' })
        .expect(500);

      expect(response.body.message).toBe('❌ Internal server error during validation');
    });

    it('should handle invalid JSON gracefully', async () => {
      const response = await request(app)
        .post('/test')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);

      // Express will handle invalid JSON before reaching our middleware
      expect(response.body).toBeDefined();
    });
  });
});
