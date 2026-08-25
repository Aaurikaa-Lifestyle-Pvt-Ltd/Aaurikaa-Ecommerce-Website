const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../server');
const Order = require('../../models/Order');
const Product = require('../../models/Product');

describe('Shipping Cost Calculation', () => {
  let testProduct;
  let authToken;

  beforeAll(async () => {
    // Create test product
    testProduct = new Product({
      name: 'Test Product',
      price: 100,
      salePrice: 90,
      weight: 0.5,
      stock: 10,
      category: 'Test Category',
      seller: new mongoose.Types.ObjectId()
    });
    await testProduct.save();

    // Mock auth token
    authToken = 'mock-jwt-token';
  });

  afterAll(async () => {
    await Product.deleteMany({});
    await Order.deleteMany({});
    await mongoose.connection.close();
  });

  describe('POST /api/shipping/calculate', () => {
    test('should calculate shipping cost for standard delivery', async () => {
      const shippingRequest = {
        items: [
          {
            product: testProduct._id,
            quantity: 2,
            weight: 0.5
          }
        ],
        shippingAddress: {
          stateId: 'Delhi',
          districtId: 'Central Delhi',
          zip: '110001'
        },
        shippingMethod: 'standard'
      };

      const response = await request(app)
        .post('/api/shipping/calculate')
        .send(shippingRequest)
        .expect(200);

      expect(response.body).toHaveProperty('shippingCost');
      expect(response.body).toHaveProperty('estimatedDays');
      expect(response.body).toHaveProperty('shippingMethod', 'standard');
      expect(response.body.shippingCost).toBeGreaterThan(0);
    });

    test('should calculate shipping cost for express delivery', async () => {
      const shippingRequest = {
        items: [
          {
            product: testProduct._id,
            quantity: 1,
            weight: 0.5
          }
        ],
        shippingAddress: {
          stateId: 'Maharashtra',
          districtId: 'Mumbai',
          zip: '400001'
        },
        shippingMethod: 'express'
      };

      const response = await request(app)
        .post('/api/shipping/calculate')
        .send(shippingRequest)
        .expect(200);

      expect(response.body).toHaveProperty('shippingCost');
      expect(response.body).toHaveProperty('estimatedDays');
      expect(response.body).toHaveProperty('shippingMethod', 'express');
      expect(response.body.shippingCost).toBeGreaterThan(0);
    });

    test('should return free shipping for high-value orders', async () => {
      const highValueProduct = new Product({
        name: 'Expensive Product',
        price: 600,
        salePrice: 600,
        weight: 0.5,
        stock: 5,
        category: 'Test Category',
        seller: new mongoose.Types.ObjectId()
      });
      await highValueProduct.save();

      const shippingRequest = {
        items: [
          {
            product: highValueProduct._id,
            quantity: 2, // Total: 1200, above 1000 threshold
            weight: 0.5
          }
        ],
        shippingAddress: {
          stateId: 'Delhi',
          districtId: 'Central Delhi',
          zip: '110001'
        },
        shippingMethod: 'free'
      };

      const response = await request(app)
        .post('/api/shipping/calculate')
        .send(shippingRequest)
        .expect(200);

      expect(response.body).toHaveProperty('shippingCost', 0);
      expect(response.body).toHaveProperty('shippingMethod', 'free');

      await Product.findByIdAndDelete(highValueProduct._id);
    });

    test('should calculate higher shipping for remote locations', async () => {
      const shippingRequest = {
        items: [
          {
            product: testProduct._id,
            quantity: 1,
            weight: 0.5
          }
        ],
        shippingAddress: {
          stateId: 'Kerala',
          districtId: 'Kochi',
          zip: '682001'
        },
        shippingMethod: 'standard'
      };

      const response = await request(app)
        .post('/api/shipping/calculate')
        .send(shippingRequest)
        .expect(200);

      expect(response.body).toHaveProperty('shippingCost');
      expect(response.body.shippingCost).toBeGreaterThan(40); // Should be higher than base
    });

    test('should calculate weight-based shipping surcharge', async () => {
      const heavyProduct = new Product({
        name: 'Heavy Product',
        price: 100,
        salePrice: 100,
        weight: 3.0, // Heavy product
        stock: 5,
        category: 'Test Category',
        seller: new mongoose.Types.ObjectId()
      });
      await heavyProduct.save();

      const shippingRequest = {
        items: [
          {
            product: heavyProduct._id,
            quantity: 2, // Total weight: 6kg
            weight: 3.0
          }
        ],
        shippingAddress: {
          stateId: 'Delhi',
          districtId: 'Central Delhi',
          zip: '110001'
        },
        shippingMethod: 'standard'
      };

      const response = await request(app)
        .post('/api/shipping/calculate')
        .send(shippingRequest)
        .expect(200);

      expect(response.body).toHaveProperty('shippingCost');
      expect(response.body.shippingCost).toBeGreaterThan(40); // Should include weight surcharge

      await Product.findByIdAndDelete(heavyProduct._id);
    });

    test('should validate required fields', async () => {
      const invalidRequest = {
        items: [], // Empty items
        shippingAddress: {
          stateId: 'Delhi'
        }
      };

      await request(app)
        .post('/api/shipping/calculate')
        .send(invalidRequest)
        .expect(400);
    });

    test('should validate shipping address', async () => {
      const shippingRequest = {
        items: [
          {
            product: testProduct._id,
            quantity: 1,
            weight: 0.5
          }
        ],
        shippingAddress: {
          // Missing required fields
        },
        shippingMethod: 'standard'
      };

      await request(app)
        .post('/api/shipping/calculate')
        .send(shippingRequest)
        .expect(400);
    });

    test('should handle invalid shipping method', async () => {
      const shippingRequest = {
        items: [
          {
            product: testProduct._id,
            quantity: 1,
            weight: 0.5
          }
        ],
        shippingAddress: {
          stateId: 'Delhi',
          districtId: 'Central Delhi',
          zip: '110001'
        },
        shippingMethod: 'invalid_method'
      };

      await request(app)
        .post('/api/shipping/calculate')
        .send(shippingRequest)
        .expect(400);
    });
  });

  describe('GET /api/shipping/methods', () => {
    test('should return available shipping methods', async () => {
      const response = await request(app)
        .get('/api/shipping/methods')
        .expect(200);

      expect(response.body).toHaveProperty('methods');
      expect(Array.isArray(response.body.methods)).toBe(true);
      expect(response.body.methods.length).toBeGreaterThan(0);
    });

    test('should return shipping methods with correct structure', async () => {
      const response = await request(app)
        .get('/api/shipping/methods')
        .expect(200);

      const methods = response.body.methods;
      methods.forEach(method => {
        expect(method).toHaveProperty('id');
        expect(method).toHaveProperty('name');
        expect(method).toHaveProperty('description');
        expect(method).toHaveProperty('estimatedDays');
        expect(method).toHaveProperty('available');
      });
    });
  });

  describe('Shipping Zone Calculation', () => {
    test('should categorize states into correct shipping zones', async () => {
      const testCases = [
        { state: 'Delhi', expectedZone: 'local' },
        { state: 'Haryana', expectedZone: 'local' },
        { state: 'Maharashtra', expectedZone: 'metro' },
        { state: 'Karnataka', expectedZone: 'metro' },
        { state: 'Kerala', expectedZone: 'remote' },
        { state: 'Assam', expectedZone: 'remote' }
      ];

      for (const testCase of testCases) {
        const shippingRequest = {
          items: [
            {
              product: testProduct._id,
              quantity: 1,
              weight: 0.5
            }
          ],
          shippingAddress: {
            stateId: testCase.state,
            districtId: 'Test District',
            zip: '110001'
          },
          shippingMethod: 'standard'
        };

        const response = await request(app)
          .post('/api/shipping/calculate')
          .send(shippingRequest)
          .expect(200);

        expect(response.body).toHaveProperty('shippingZone', testCase.expectedZone);
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle database connection errors', async () => {
      // Mock database error
      const originalFindById = Product.findById;
      Product.findById = jest.fn().mockRejectedValue(new Error('Database connection failed'));

      const shippingRequest = {
        items: [
          {
            product: testProduct._id,
            quantity: 1,
            weight: 0.5
          }
        ],
        shippingAddress: {
          stateId: 'Delhi',
          districtId: 'Central Delhi',
          zip: '110001'
        },
        shippingMethod: 'standard'
      };

      await request(app)
        .post('/api/shipping/calculate')
        .send(shippingRequest)
        .expect(500);

      // Restore original method
      Product.findById = originalFindById;
    });

    test('should handle invalid product ID', async () => {
      const shippingRequest = {
        items: [
          {
            product: 'invalid-product-id',
            quantity: 1,
            weight: 0.5
          }
        ],
        shippingAddress: {
          stateId: 'Delhi',
          districtId: 'Central Delhi',
          zip: '110001'
        },
        shippingMethod: 'standard'
      };

      await request(app)
        .post('/api/shipping/calculate')
        .send(shippingRequest)
        .expect(400);
    });
  });
});
