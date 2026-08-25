const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../server');
const Order = require('../../models/Order');
const Shopper = require('../../models/Shopper');

describe('Payment Security and Validation', () => {
  let testShopper;
  let authToken;
  let testOrder;

  beforeAll(async () => {
    // Create test shopper
    testShopper = new Shopper({
      name: 'Test Shopper',
      email: 'test@example.com',
      phone: '1234567890',
      password: 'hashedpassword'
    });
    await testShopper.save();

    // Mock auth token
    authToken = 'mock-jwt-token';
  });

  afterAll(async () => {
    await Order.deleteMany({});
    await Shopper.deleteMany({});
    await mongoose.connection.close();
  });

  describe('POST /api/orders', () => {
    test('should validate payment method', async () => {
      const invalidOrder = {
        items: [{ product: '507f1f77bcf86cd799439011', quantity: 1, price: 100 }],
        totalAmount: 100,
        paymentMethod: 'invalid_method',
        billingAddress: {
          name: 'Test User',
          email: 'test@example.com',
          phone: '1234567890',
          address1: '123 Test St',
          zip: '12345',
          countryId: 'India',
          stateId: 'Delhi',
          districtId: 'Central Delhi'
        }
      };

      await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidOrder)
        .expect(400);
    });

    test('should validate payment amount', async () => {
      const invalidOrder = {
        items: [{ product: '507f1f77bcf86cd799439011', quantity: 1, price: 100 }],
        totalAmount: -100, // Invalid negative amount
        paymentMethod: 'cod',
        billingAddress: {
          name: 'Test User',
          email: 'test@example.com',
          phone: '1234567890',
          address1: '123 Test St',
          zip: '12345',
          countryId: 'India',
          stateId: 'Delhi',
          districtId: 'Central Delhi'
        }
      };

      await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidOrder)
        .expect(400);
    });

    test('should validate UPI payment data', async () => {
      const upiOrder = {
        items: [{ product: '507f1f77bcf86cd799439011', quantity: 1, price: 100 }],
        totalAmount: 100,
        paymentMethod: 'upi',
        paymentData: {
          upiId: 'invalid-upi' // Invalid UPI format
        },
        billingAddress: {
          name: 'Test User',
          email: 'test@example.com',
          phone: '1234567890',
          address1: '123 Test St',
          zip: '12345',
          countryId: 'India',
          stateId: 'Delhi',
          districtId: 'Central Delhi'
        }
      };

      await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send(upiOrder)
        .expect(400);
    });

    test('should validate bank transfer data', async () => {
      const bankOrder = {
        items: [{ product: '507f1f77bcf86cd799439011', quantity: 1, price: 100 }],
        totalAmount: 100,
        paymentMethod: 'bank',
        paymentData: {
          accountNumber: '123', // Too short
          ifscCode: 'invalid-ifsc',
          accountHolderName: 'Test User'
        },
        billingAddress: {
          name: 'Test User',
          email: 'test@example.com',
          phone: '1234567890',
          address1: '123 Test St',
          zip: '12345',
          countryId: 'India',
          stateId: 'Delhi',
          districtId: 'Central Delhi'
        }
      };

      await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send(bankOrder)
        .expect(400);
    });

    test('should create order with valid COD payment', async () => {
      const validOrder = {
        items: [{ product: '507f1f77bcf86cd799439011', quantity: 1, price: 100 }],
        totalAmount: 100,
        paymentMethod: 'cod',
        billingAddress: {
          name: 'Test User',
          email: 'test@example.com',
          phone: '1234567890',
          address1: '123 Test St',
          zip: '12345',
          countryId: 'India',
          stateId: 'Delhi',
          districtId: 'Central Delhi'
        }
      };

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validOrder)
        .expect(201);

      expect(response.body).toHaveProperty('orderId');
      expect(response.body.order).toHaveProperty('paymentMethod', 'cod');
      expect(response.body.order).toHaveProperty('status', 'pending');
    });

    test('should create order with valid UPI payment', async () => {
      const upiOrder = {
        items: [{ product: '507f1f77bcf86cd799439011', quantity: 1, price: 100 }],
        totalAmount: 100,
        paymentMethod: 'upi',
        paymentData: {
          upiId: 'user@paytm'
        },
        billingAddress: {
          name: 'Test User',
          email: 'test@example.com',
          phone: '1234567890',
          address1: '123 Test St',
          zip: '12345',
          countryId: 'India',
          stateId: 'Delhi',
          districtId: 'Central Delhi'
        }
      };

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send(upiOrder)
        .expect(201);

      expect(response.body).toHaveProperty('orderId');
      expect(response.body.order).toHaveProperty('paymentMethod', 'upi');
      expect(response.body.order).toHaveProperty('paymentData');
    });
  });

  describe('Payment Security Features', () => {
    test('should sanitize sensitive payment data in logs', async () => {
      const orderWithSensitiveData = {
        items: [{ product: '507f1f77bcf86cd799439011', quantity: 1, price: 100 }],
        totalAmount: 100,
        paymentMethod: 'bank',
        paymentData: {
          accountNumber: '1234567890',
          ifscCode: 'HDFC0001234',
          accountHolderName: 'Test User'
        },
        billingAddress: {
          name: 'Test User',
          email: 'test@example.com',
          phone: '1234567890',
          address1: '123 Test St',
          zip: '12345',
          countryId: 'India',
          stateId: 'Delhi',
          districtId: 'Central Delhi'
        }
      };

      // Mock console.log to capture sanitized data
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send(orderWithSensitiveData)
        .expect(201);

      // Verify that sensitive data is not logged in plain text
      const logCalls = consoleSpy.mock.calls;
      const logContent = logCalls.map(call => call.join(' ')).join(' ');
      
      expect(logContent).not.toContain('1234567890'); // Account number should be masked
      expect(logContent).not.toContain('HDFC0001234'); // IFSC should be masked

      consoleSpy.mockRestore();
    });

    test('should implement payment retry mechanism', async () => {
      // Mock database error for first attempt
      const originalSave = Order.prototype.save;
      let attemptCount = 0;
      
      Order.prototype.save = jest.fn().mockImplementation(function() {
        attemptCount++;
        if (attemptCount === 1) {
          throw new Error('Database connection failed');
        }
        return originalSave.call(this);
      });

      const validOrder = {
        items: [{ product: '507f1f77bcf86cd799439011', quantity: 1, price: 100 }],
        totalAmount: 100,
        paymentMethod: 'cod',
        billingAddress: {
          name: 'Test User',
          email: 'test@example.com',
          phone: '1234567890',
          address1: '123 Test St',
          zip: '12345',
          countryId: 'India',
          stateId: 'Delhi',
          districtId: 'Central Delhi'
        }
      };

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validOrder)
        .expect(201);

      expect(attemptCount).toBe(2); // Should retry once
      expect(response.body).toHaveProperty('orderId');

      // Restore original method
      Order.prototype.save = originalSave;
    });

    test('should validate payment amount limits', async () => {
      const highAmountOrder = {
        items: [{ product: '507f1f77bcf86cd799439011', quantity: 1, price: 100 }],
        totalAmount: 10000000, // Very high amount
        paymentMethod: 'cod',
        billingAddress: {
          name: 'Test User',
          email: 'test@example.com',
          phone: '1234567890',
          address1: '123 Test St',
          zip: '12345',
          countryId: 'India',
          stateId: 'Delhi',
          districtId: 'Central Delhi'
        }
      };

      await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send(highAmountOrder)
        .expect(400);
    });
  });

  describe('Error Handling', () => {
    test('should handle database errors during order creation', async () => {
      // Mock database connection error
      const originalCreate = Order.create;
      Order.create = jest.fn().mockRejectedValue(new Error('Database connection failed'));

      const validOrder = {
        items: [{ product: '507f1f77bcf86cd799439011', quantity: 1, price: 100 }],
        totalAmount: 100,
        paymentMethod: 'cod',
        billingAddress: {
          name: 'Test User',
          email: 'test@example.com',
          phone: '1234567890',
          address1: '123 Test St',
          zip: '12345',
          countryId: 'India',
          stateId: 'Delhi',
          districtId: 'Central Delhi'
        }
      };

      await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validOrder)
        .expect(500);

      Order.create = originalCreate;
    });
  });
});
