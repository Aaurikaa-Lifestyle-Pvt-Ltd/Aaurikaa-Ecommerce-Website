const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const shippingController = require('../../controllers/admin/shippingController');
const ShippingMethod = require('../../models/ShippingMethod');
const ShippingZone = require('../../models/ShippingZone');

describe('Shipping Controller Tests', () => {
  let app;
  let testZone;

  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/ecommerce_test');
    }
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    
    // Mock authentication middleware
    app.use((req, res, next) => {
      req.user = { id: 'test_admin_id', role: 'admin' };
      next();
    });

    // Setup routes
    app.get('/shipping-methods', shippingController.getShippingMethods);
    app.post('/shipping-methods', shippingController.addShippingMethod);
    app.put('/shipping-methods/:id', shippingController.updateShippingMethod);
    app.delete('/shipping-methods/:id', shippingController.deleteShippingMethod);

    // Create test shipping zone
    testZone = await ShippingZone.create({
      name: 'Mumbai Zone',
      code: 'MUM-ZONE',
      country: 'IN',
      states: ['Maharashtra'],
      active: true
    });
  });

  afterEach(async () => {
    // Clean up test data
    await ShippingMethod.deleteMany({});
    await ShippingZone.deleteMany({});
  });

  describe('getShippingMethods', () => {
    it('should get all shipping methods', async () => {
      // Create test shipping methods
      const method1 = await ShippingMethod.create({
        name: 'Standard Shipping',
        cost: 50,
        zones: [testZone._id]
      });

      const method2 = await ShippingMethod.create({
        name: 'Express Shipping',
        cost: 100,
        zones: []
      });

      const response = await request(app)
        .get('/shipping-methods');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      
      // Check that both methods exist (order may vary due to sorting)
      const methodNames = response.body.data.map(method => method.name);
      expect(methodNames).toContain('Standard Shipping');
      expect(methodNames).toContain('Express Shipping');
    });

    it('should return empty array when no methods exist', async () => {
      const response = await request(app)
        .get('/shipping-methods');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
    });
  });

  describe('addShippingMethod', () => {
    it('should create a new shipping method', async () => {
      const methodData = {
        name: 'Standard Shipping',
        cost: 50,
        zones: [testZone._id]
      };

      const response = await request(app)
        .post('/shipping-methods')
        .send(methodData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Standard Shipping');
      expect(response.body.data.cost).toBe(50);
      expect(response.body.data.zones).toHaveLength(1);
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/shipping-methods')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Shipping method name is required');
      expect(response.body.message).toContain('Shipping cost is required');
    });

    it('should validate name length', async () => {
      const methodData = {
        name: 'A', // Too short
        cost: 50
      };

      const response = await request(app)
        .post('/shipping-methods')
        .send(methodData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Shipping method name must be at least 2 characters long');
    });

    it('should validate cost range', async () => {
      const methodData = {
        name: 'Standard Shipping',
        cost: -10 // Negative cost
      };

      const response = await request(app)
        .post('/shipping-methods')
        .send(methodData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Shipping cost must be a non-negative number');
    });

    it('should validate maximum cost', async () => {
      const methodData = {
        name: 'Expensive Shipping',
        cost: 15000 // Too expensive
      };

      const response = await request(app)
        .post('/shipping-methods')
        .send(methodData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Shipping cost cannot exceed ₹10,000');
    });

    it('should prevent duplicate names', async () => {
      // Create first method
      await ShippingMethod.create({
        name: 'Standard Shipping',
        cost: 50
      });

      const methodData = {
        name: 'Standard Shipping', // Duplicate name
        cost: 75
      };

      const response = await request(app)
        .post('/shipping-methods')
        .send(methodData);

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Shipping method with this name already exists');
    });

    it('should validate shipping zones', async () => {
      const fakeZoneId = new mongoose.Types.ObjectId();
      
      const methodData = {
        name: 'Zone Shipping',
        cost: 50,
        zones: [fakeZoneId] // Invalid zone
      };

      const response = await request(app)
        .post('/shipping-methods')
        .send(methodData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('One or more shipping zones are invalid or inactive');
    });

    it('should round cost to 2 decimal places', async () => {
      const methodData = {
        name: 'Precise Shipping',
        cost: 50.999
      };

      const response = await request(app)
        .post('/shipping-methods')
        .send(methodData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.cost).toBe(51); // Rounded to 2 decimal places
    });
  });

  describe('updateShippingMethod', () => {
    let existingMethod;

    beforeEach(async () => {
      existingMethod = await ShippingMethod.create({
        name: 'Standard Shipping',
        cost: 50,
        zones: [testZone._id]
      });
    });

    it('should update shipping method', async () => {
      const updateData = {
        name: 'Updated Standard Shipping',
        cost: 75
      };

      const response = await request(app)
        .put(`/shipping-methods/${existingMethod._id}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Updated Standard Shipping');
      expect(response.body.data.cost).toBe(75);
    });

    it('should validate method ID format', async () => {
      const updateData = {
        name: 'Updated Shipping',
        cost: 75
      };

      const response = await request(app)
        .put('/shipping-methods/invalid-id')
        .send(updateData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid shipping method ID');
    });

    it('should return 404 for non-existent method', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const updateData = {
        name: 'Updated Shipping',
        cost: 75
      };

      const response = await request(app)
        .put(`/shipping-methods/${fakeId}`)
        .send(updateData);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Shipping method not found');
    });

    it('should prevent duplicate names when updating', async () => {
      // Create another method
      await ShippingMethod.create({
        name: 'Express Shipping',
        cost: 100
      });

      const updateData = {
        name: 'Express Shipping', // Duplicate name
        cost: 75
      };

      const response = await request(app)
        .put(`/shipping-methods/${existingMethod._id}`)
        .send(updateData);

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Shipping method with this name already exists');
    });
  });

  describe('deleteShippingMethod', () => {
    let existingMethod;

    beforeEach(async () => {
      existingMethod = await ShippingMethod.create({
        name: 'Standard Shipping',
        cost: 50
      });
    });

    it('should delete shipping method', async () => {
      const response = await request(app)
        .delete(`/shipping-methods/${existingMethod._id}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(existingMethod._id.toString());
      expect(response.body.data.name).toBe('Standard Shipping');

      // Verify method is deleted
      const deletedMethod = await ShippingMethod.findById(existingMethod._id);
      expect(deletedMethod).toBeNull();
    });

    it('should validate method ID format', async () => {
      const response = await request(app)
        .delete('/shipping-methods/invalid-id');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid shipping method ID');
    });

    it('should return 404 for non-existent method', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .delete(`/shipping-methods/${fakeId}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Shipping method not found');
    });
  });

  describe('Shipping Method Model Validation', () => {
    it('should validate unique name constraint', async () => {
      await ShippingMethod.create({
        name: 'Standard Shipping',
        cost: 50
      });

      const duplicateMethod = new ShippingMethod({
        name: 'Standard Shipping',
        cost: 75
      });

      await expect(duplicateMethod.save()).rejects.toThrow();
    });

    it('should validate cost constraints', async () => {
      const method = new ShippingMethod({
        name: 'Invalid Shipping',
        cost: -10
      });

      await expect(method.save()).rejects.toThrow();
    });

    it('should validate estimated days range', async () => {
      const method = new ShippingMethod({
        name: 'Invalid Days Shipping',
        cost: 50,
        estimatedDays: {
          min: 5,
          max: 3 // Max less than min
        }
      });

      await expect(method.save()).rejects.toThrow();
    });
  });
});
