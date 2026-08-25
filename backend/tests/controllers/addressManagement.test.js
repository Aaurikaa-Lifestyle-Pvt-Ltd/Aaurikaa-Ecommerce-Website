const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../server');
const Shopper = require('../../models/Shopper');

describe('Address Management System', () => {
  let testShopper;
  let authToken;

  beforeAll(async () => {
    // Create test shopper
    testShopper = new Shopper({
      name: 'Test Shopper',
      email: 'test@example.com',
      phone: '1234567890',
      password: 'hashedpassword',
      address1: '123 Test St',
      address2: 'Apt 1',
      postoffice: 'Test Post',
      pincode: '12345',
      country: 'India',
      state: 'Delhi',
      district: 'Central Delhi'
    });
    await testShopper.save();

    // Mock auth token (in real implementation, this would be generated)
    authToken = 'mock-jwt-token';
  });

  afterAll(async () => {
    await Shopper.deleteMany({});
    await mongoose.connection.close();
  });

  describe('GET /api/shopper/profile', () => {
    test('should return shopper profile with address information', async () => {
      const response = await request(app)
        .get('/api/shopper/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('shopper');
      expect(response.body.shopper).toHaveProperty('address1', '123 Test St');
      expect(response.body.shopper).toHaveProperty('address2', 'Apt 1');
      expect(response.body.shopper).toHaveProperty('postoffice', 'Test Post');
      expect(response.body.shopper).toHaveProperty('pincode', '12345');
      expect(response.body.shopper).toHaveProperty('country', 'India');
      expect(response.body.shopper).toHaveProperty('state', 'Delhi');
      expect(response.body.shopper).toHaveProperty('district', 'Central Delhi');
    });

    test('should return 401 if not authenticated', async () => {
      await request(app)
        .get('/api/shopper/profile')
        .expect(401);
    });
  });

  describe('PUT /api/shopper/profile', () => {
    test('should update shopper address information', async () => {
      const updatedAddress = {
        address1: '456 New St',
        address2: 'Suite 2',
        postoffice: 'New Post',
        pincode: '54321',
        country: 'India',
        state: 'Maharashtra',
        district: 'Mumbai'
      };

      const response = await request(app)
        .put('/api/shopper/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updatedAddress)
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Profile updated successfully');
      expect(response.body).toHaveProperty('shopper');
      expect(response.body.shopper).toHaveProperty('address1', '456 New St');
      expect(response.body.shopper).toHaveProperty('state', 'Maharashtra');
    });

    test('should validate required address fields', async () => {
      const invalidAddress = {
        address1: '', // Empty address
        pincode: 'invalid' // Invalid pincode
      };

      await request(app)
        .put('/api/shopper/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidAddress)
        .expect(400);
    });

    test('should return 401 if not authenticated', async () => {
      await request(app)
        .put('/api/shopper/profile')
        .send({ address1: 'New Address' })
        .expect(401);
    });
  });

  describe('Address Validation', () => {
    test('should validate pincode format', async () => {
      const invalidPincode = {
        pincode: '123' // Too short
      };

      await request(app)
        .put('/api/shopper/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidPincode)
        .expect(400);
    });

    test('should validate phone number format', async () => {
      const invalidPhone = {
        phone: '123' // Too short
      };

      await request(app)
        .put('/api/shopper/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidPhone)
        .expect(400);
    });

    test('should validate email format', async () => {
      const invalidEmail = {
        email: 'invalid-email'
      };

      await request(app)
        .put('/api/shopper/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidEmail)
        .expect(400);
    });
  });

  describe('Multiple Address Support', () => {
    test('should handle multiple addresses for same shopper', async () => {
      // This would require extending the Shopper model to support multiple addresses
      // For now, we test the current single address system
      const address1 = {
        address1: 'Primary Address',
        pincode: '11111',
        state: 'Delhi'
      };

      const address2 = {
        address1: 'Secondary Address',
        pincode: '22222',
        state: 'Maharashtra'
      };

      // Update with first address
      await request(app)
        .put('/api/shopper/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(address1)
        .expect(200);

      // Update with second address
      await request(app)
        .put('/api/shopper/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(address2)
        .expect(200);

      // Verify the last update is saved
      const response = await request(app)
        .get('/api/shopper/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.shopper.address1).toBe('Secondary Address');
      expect(response.body.shopper.pincode).toBe('22222');
    });
  });

  describe('Error Handling', () => {
    test('should handle database connection errors gracefully', async () => {
      // Mock database error
      const originalFindOne = Shopper.findOne;
      Shopper.findOne = jest.fn().mockRejectedValue(new Error('Database connection failed'));

      await request(app)
        .get('/api/shopper/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500);

      // Restore original method
      Shopper.findOne = originalFindOne;
    });

    test('should handle invalid shopper ID', async () => {
      // This would test the case where the authenticated user doesn't exist
      // In a real implementation, this would be handled by the authentication middleware
      const invalidToken = 'invalid-token';

      await request(app)
        .get('/api/shopper/profile')
        .set('Authorization', `Bearer ${invalidToken}`)
        .expect(401);
    });
  });
});
