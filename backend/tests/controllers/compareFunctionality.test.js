const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../server');
const Shopper = require('../../models/Shopper');
const Product = require('../../models/Product');

describe('Compare Functionality', () => {
  let testShopper;
  let testProducts;
  let authToken;

  beforeAll(async () => {
    // Create test shopper
    testShopper = new Shopper({
      name: 'Test Shopper',
      email: 'test@example.com',
      phone: '1234567890',
      password: 'hashedpassword',
      compareList: []
    });
    await testShopper.save();

    // Create test products
    testProducts = [
      new Product({
        name: 'Test Product 1',
        price: 100,
        salePrice: 90,
        features: {
          'Brand': 'Brand A',
          'Color': 'Red',
          'Size': 'Large'
        },
        stock: 10,
        category: 'Test Category',
        seller: new mongoose.Types.ObjectId()
      }),
      new Product({
        name: 'Test Product 2',
        price: 200,
        salePrice: 180,
        features: {
          'Brand': 'Brand B',
          'Color': 'Blue',
          'Size': 'Medium'
        },
        stock: 5,
        category: 'Test Category',
        seller: new mongoose.Types.ObjectId()
      }),
      new Product({
        name: 'Test Product 3',
        price: 300,
        salePrice: 270,
        features: {
          'Brand': 'Brand C',
          'Color': 'Green',
          'Size': 'Small'
        },
        stock: 8,
        category: 'Test Category',
        seller: new mongoose.Types.ObjectId()
      })
    ];
    await Product.insertMany(testProducts);

    // Mock auth token
    authToken = 'mock-jwt-token';
  });

  afterAll(async () => {
    const testSkus = testProducts?.map((p) => p.sku).filter(Boolean) || [];
    const testProductIds = testProducts?.map((p) => p._id).filter(Boolean) || [];

    if (testProductIds.length > 0) {
      await Product.deleteMany({ _id: { $in: testProductIds } });
    } else if (testSkus.length > 0) {
      await Product.deleteMany({ sku: { $in: testSkus } });
    }

    if (testShopper?._id) {
      await Shopper.deleteOne({ _id: testShopper._id });
    }

    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  });

  describe('GET /api/shopper/compare', () => {
    test('should return empty compare list for new shopper', async () => {
      const response = await request(app)
        .get('/api/shopper/compare')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('compareList');
      expect(Array.isArray(response.body.compareList)).toBe(true);
      expect(response.body.compareList).toHaveLength(0);
    });

    test('should return compare list with populated products', async () => {
      // Add products to compare list
      testShopper.compareList = [
        { product: testProducts[0]._id, addedAt: new Date() },
        { product: testProducts[1]._id, addedAt: new Date() }
      ];
      await testShopper.save();

      const response = await request(app)
        .get('/api/shopper/compare')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.compareList).toHaveLength(2);
      expect(response.body.compareList[0]).toHaveProperty('product');
      expect(response.body.compareList[0].product).toHaveProperty('name', 'Test Product 1');
    });

    test('should return 401 if not authenticated', async () => {
      await request(app)
        .get('/api/shopper/compare')
        .expect(401);
    });
  });

  describe('POST /api/shopper/compare', () => {
    beforeEach(async () => {
      // Reset compare list
      testShopper.compareList = [];
      await testShopper.save();
    });

    test('should add product to compare list', async () => {
      const response = await request(app)
        .post('/api/shopper/compare')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ productId: testProducts[0]._id })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', '✅ Product added to compare list');
      expect(response.body.compareList).toHaveLength(1);
      expect(response.body.compareList[0].product._id).toBe(testProducts[0]._id.toString());
    });

    test('should not add duplicate product to compare list', async () => {
      // Add product first time
      await request(app)
        .post('/api/shopper/compare')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ productId: testProducts[0]._id })
        .expect(200);

      // Try to add same product again
      const response = await request(app)
        .post('/api/shopper/compare')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ productId: testProducts[0]._id })
        .expect(400);

      expect(response.body).toHaveProperty('message', '❌ Product already in compare list');
    });

    test('should enforce maximum compare list limit', async () => {
      // Add 4 products to reach limit
      for (let i = 0; i < 4; i++) {
        await request(app)
          .post('/api/shopper/compare')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ productId: testProducts[i % testProducts.length]._id })
          .expect(200);
      }

      // Try to add 5th product
      const response = await request(app)
        .post('/api/shopper/compare')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ productId: testProducts[0]._id })
        .expect(400);

      expect(response.body).toHaveProperty('message', '❌ Compare list is full (maximum 4 products)');
    });

    test('should validate product ID', async () => {
      const response = await request(app)
        .post('/api/shopper/compare')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ productId: 'invalid-id' })
        .expect(400);

      expect(response.body).toHaveProperty('message', '❌ Product ID is required');
    });

    test('should return 401 if not authenticated', async () => {
      await request(app)
        .post('/api/shopper/compare')
        .send({ productId: testProducts[0]._id })
        .expect(401);
    });
  });

  describe('DELETE /api/shopper/compare/:productId', () => {
    beforeEach(async () => {
      // Add products to compare list
      testShopper.compareList = [
        { product: testProducts[0]._id, addedAt: new Date() },
        { product: testProducts[1]._id, addedAt: new Date() }
      ];
      await testShopper.save();
    });

    test('should remove product from compare list', async () => {
      const response = await request(app)
        .delete(`/api/shopper/compare/${testProducts[0]._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', '✅ Product removed from compare list');
      expect(response.body.compareList).toHaveLength(1);
      expect(response.body.compareList[0].product._id).toBe(testProducts[1]._id.toString());
    });

    test('should handle removing non-existent product', async () => {
      const response = await request(app)
        .delete(`/api/shopper/compare/${testProducts[2]._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.compareList).toHaveLength(2); // No change
    });

    test('should return 401 if not authenticated', async () => {
      await request(app)
        .delete(`/api/shopper/compare/${testProducts[0]._id}`)
        .expect(401);
    });
  });

  describe('DELETE /api/shopper/compare (clear all)', () => {
    beforeEach(async () => {
      // Add products to compare list
      testShopper.compareList = [
        { product: testProducts[0]._id, addedAt: new Date() },
        { product: testProducts[1]._id, addedAt: new Date() }
      ];
      await testShopper.save();
    });

    test('should clear entire compare list', async () => {
      const response = await request(app)
        .delete('/api/shopper/compare')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', '✅ Compare list cleared');
      expect(response.body.compareList).toHaveLength(0);
    });

    test('should handle clearing empty compare list', async () => {
      // Clear compare list first
      testShopper.compareList = [];
      await testShopper.save();

      const response = await request(app)
        .delete('/api/shopper/compare')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.compareList).toHaveLength(0);
    });

    test('should return 401 if not authenticated', async () => {
      await request(app)
        .delete('/api/shopper/compare')
        .expect(401);
    });
  });

  describe('Error Handling', () => {
    test('should handle database connection errors', async () => {
      // Mock database error
      const originalFindById = Shopper.findById;
      Shopper.findById = jest.fn().mockRejectedValue(new Error('Database connection failed'));

      await request(app)
        .get('/api/shopper/compare')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500);

      // Restore original method
      Shopper.findById = originalFindById;
    });

    test('should handle invalid shopper ID', async () => {
      // This would test the case where the authenticated user doesn't exist
      const invalidToken = 'invalid-token';

      await request(app)
        .get('/api/shopper/compare')
        .set('Authorization', `Bearer ${invalidToken}`)
        .expect(401);
    });
  });

  describe('Compare List Persistence', () => {
    test('should persist compare list across sessions', async () => {
      // Add product to compare list
      await request(app)
        .post('/api/shopper/compare')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ productId: testProducts[0]._id })
        .expect(200);

      // Fetch compare list in new request
      const response = await request(app)
        .get('/api/shopper/compare')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.compareList).toHaveLength(1);
      expect(response.body.compareList[0].product._id).toBe(testProducts[0]._id.toString());
    });

    test('should maintain compare list order', async () => {
      // Add products in specific order
      await request(app)
        .post('/api/shopper/compare')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ productId: testProducts[0]._id })
        .expect(200);

      await request(app)
        .post('/api/shopper/compare')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ productId: testProducts[1]._id })
        .expect(200);

      // Fetch compare list
      const response = await request(app)
        .get('/api/shopper/compare')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.compareList).toHaveLength(2);
      expect(response.body.compareList[0].product._id).toBe(testProducts[0]._id.toString());
      expect(response.body.compareList[1].product._id).toBe(testProducts[1]._id.toString());
    });
  });
});
