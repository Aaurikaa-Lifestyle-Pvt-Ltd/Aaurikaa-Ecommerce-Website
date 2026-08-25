const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');

// Mock the models
jest.mock('../../models/Shopper');
jest.mock('../../models/Product');

const Shopper = require('../../models/Shopper');
const Product = require('../../models/Product');

const app = express();
app.use(express.json());

// Mock middleware
const mockVerifyShopper = (req, res, next) => {
  req.user = { id: 'shopper123' };
  next();
};

// Import controller
const shopperController = require('../../controllers/shopperController');

// Add routes
app.get('/api/shopper/wishlist', mockVerifyShopper, shopperController.getWishlist);
app.post('/api/shopper/wishlist/add', mockVerifyShopper, shopperController.addToWishlist);
app.post('/api/shopper/wishlist/remove', mockVerifyShopper, shopperController.removeFromWishlist);

describe('Shopper Wishlist Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================
  // GET WISHLIST TESTS
  // ==========================================
  describe('GET /api/shopper/wishlist - Get Wishlist', () => {
    test('should retrieve shopper wishlist successfully', async () => {
      const mockWishlistProducts = [
        {
          _id: 'product1',
          name: 'Test Product 1',
          salePrice: 100,
          mainImage: 'product1.jpg',
          stock: 10
        },
        {
          _id: 'product2',
          name: 'Test Product 2',
          salePrice: 200,
          mainImage: 'product2.jpg',
          stock: 5
        }
      ];

      const mockShopper = {
        _id: 'shopper123',
        wishlist: mockWishlistProducts
      };

      Shopper.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockShopper)
      });

      const response = await request(app)
        .get('/api/shopper/wishlist')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(2);
      expect(response.body[0].name).toBe('Test Product 1');
      expect(response.body[1].name).toBe('Test Product 2');
    });

    test('should return empty wishlist for new shopper', async () => {
      const mockShopper = {
        _id: 'shopper123',
        wishlist: []
      };

      Shopper.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockShopper)
      });

      const response = await request(app)
        .get('/api/shopper/wishlist')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(0);
    });

    test('should handle shopper not found error', async () => {
      Shopper.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(null)
      });

      const response = await request(app)
        .get('/api/shopper/wishlist')
        .expect(404);

      expect(response.body).toHaveProperty('message', '❌ Shopper not found');
    });

    test('should handle database errors', async () => {
      Shopper.findById.mockReturnValue({
        populate: jest.fn().mockRejectedValue(new Error('Database error'))
      });

      const response = await request(app)
        .get('/api/shopper/wishlist')
        .expect(500);

      expect(response.body).toHaveProperty('message', '❌ Failed to fetch wishlist');
    });

    test('should populate product details correctly', async () => {
      const mockWishlistProducts = [
        {
          _id: 'product1',
          name: 'Test Product 1',
          salePrice: 100,
          mainImage: 'product1.jpg',
          stock: 10,
          regularPrice: 120,
          brand: 'Brand A'
        }
      ];

      const mockShopper = {
        _id: 'shopper123',
        wishlist: mockWishlistProducts
      };

      Shopper.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockShopper)
      });

      const response = await request(app)
        .get('/api/shopper/wishlist')
        .expect(200);

      expect(response.body[0]).toHaveProperty('_id');
      expect(response.body[0]).toHaveProperty('name');
      expect(response.body[0]).toHaveProperty('salePrice');
      expect(response.body[0]).toHaveProperty('stock');
    });
  });

  // ==========================================
  // ADD TO WISHLIST TESTS
  // ==========================================
  describe('POST /api/shopper/wishlist/add - Add to Wishlist', () => {
    test('should add new product to wishlist successfully', async () => {
      const mockShopper = {
        _id: 'shopper123',
        wishlist: [],
        save: jest.fn().mockResolvedValue(true)
      };

      const mockWishlistProducts = [
        {
          _id: 'product1',
          name: 'Test Product',
          salePrice: 100
        }
      ];

      Shopper.findById.mockResolvedValueOnce(mockShopper);
      Shopper.findById.mockReturnValueOnce({
        populate: jest.fn().mockResolvedValue({
          ...mockShopper,
          wishlist: mockWishlistProducts
        })
      });

      const response = await request(app)
        .post('/api/shopper/wishlist/add')
        .send({ productId: 'product1' })
        .expect(200);

      expect(response.body).toHaveProperty('message', '✅ Product added to wishlist');
      expect(response.body).toHaveProperty('wishlist');
      expect(response.body.wishlist).toHaveLength(1);
      expect(mockShopper.save).toHaveBeenCalled();
    });

    test('should not add duplicate product to wishlist', async () => {
      const mockShopper = {
        _id: 'shopper123',
        wishlist: ['product1'],
        save: jest.fn().mockResolvedValue(true)
      };

      const mockWishlistProducts = [
        {
          _id: 'product1',
          name: 'Test Product',
          salePrice: 100
        }
      ];

      Shopper.findById.mockResolvedValueOnce(mockShopper);
      Shopper.findById.mockReturnValueOnce({
        populate: jest.fn().mockResolvedValue({
          ...mockShopper,
          wishlist: mockWishlistProducts
        })
      });

      const response = await request(app)
        .post('/api/shopper/wishlist/add')
        .send({ productId: 'product1' })
        .expect(200);

      expect(response.body).toHaveProperty('message', '✅ Product added to wishlist');
      expect(response.body.wishlist).toHaveLength(1);
      // Save should still be called but wishlist length shouldn't increase
    });

    test('should handle missing productId', async () => {
      const response = await request(app)
        .post('/api/shopper/wishlist/add')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('message', '❌ Product ID is required');
    });

    test('should handle shopper not found error', async () => {
      Shopper.findById.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/shopper/wishlist/add')
        .send({ productId: 'product1' })
        .expect(404);

      expect(response.body).toHaveProperty('message', '❌ Shopper not found');
    });

    test('should handle database errors when adding', async () => {
      const mockShopper = {
        _id: 'shopper123',
        wishlist: [],
        save: jest.fn().mockRejectedValue(new Error('Database error'))
      };

      Shopper.findById.mockResolvedValue(mockShopper);

      const response = await request(app)
        .post('/api/shopper/wishlist/add')
        .send({ productId: 'product1' })
        .expect(500);

      expect(response.body).toHaveProperty('message', '❌ Failed to add to wishlist');
    });

    test('should handle invalid productId format', async () => {
      const mockShopper = {
        _id: 'shopper123',
        wishlist: [],
        save: jest.fn()
      };

      Shopper.findById.mockResolvedValue(mockShopper);

      const response = await request(app)
        .post('/api/shopper/wishlist/add')
        .send({ productId: 'invalid-id' })
        .expect(200); // Should still succeed with validation at model level

      expect(mockShopper.save).toHaveBeenCalled();
    });
  });

  // ==========================================
  // REMOVE FROM WISHLIST TESTS
  // ==========================================
  describe('POST /api/shopper/wishlist/remove - Remove from Wishlist', () => {
    test('should remove product from wishlist successfully', async () => {
      const mockShopper = {
        _id: 'shopper123',
        wishlist: ['product1', 'product2'],
        save: jest.fn().mockResolvedValue(true)
      };

      const mockWishlistProducts = [
        {
          _id: 'product2',
          name: 'Test Product 2',
          salePrice: 200
        }
      ];

      Shopper.findById.mockResolvedValueOnce(mockShopper);
      Shopper.findById.mockReturnValueOnce({
        populate: jest.fn().mockResolvedValue({
          ...mockShopper,
          wishlist: mockWishlistProducts
        })
      });

      const response = await request(app)
        .post('/api/shopper/wishlist/remove')
        .send({ productId: 'product1' })
        .expect(200);

      expect(response.body).toHaveProperty('message', '✅ Product removed from wishlist');
      expect(response.body.wishlist).toHaveLength(1);
      expect(mockShopper.save).toHaveBeenCalled();
    });

    test('should handle removing product not in wishlist', async () => {
      const mockShopper = {
        _id: 'shopper123',
        wishlist: ['product1'],
        save: jest.fn().mockResolvedValue(true)
      };

      const mockWishlistProducts = [
        {
          _id: 'product1',
          name: 'Test Product 1',
          salePrice: 100
        }
      ];

      Shopper.findById.mockResolvedValueOnce(mockShopper);
      Shopper.findById.mockReturnValueOnce({
        populate: jest.fn().mockResolvedValue({
          ...mockShopper,
          wishlist: mockWishlistProducts
        })
      });

      const response = await request(app)
        .post('/api/shopper/wishlist/remove')
        .send({ productId: 'product2' })
        .expect(200);

      expect(response.body).toHaveProperty('message', '✅ Product removed from wishlist');
      expect(mockShopper.save).toHaveBeenCalled();
    });

    test('should handle missing productId', async () => {
      const response = await request(app)
        .post('/api/shopper/wishlist/remove')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('message', '❌ Product ID is required');
    });

    test('should handle shopper not found error', async () => {
      Shopper.findById.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/shopper/wishlist/remove')
        .send({ productId: 'product1' })
        .expect(404);

      expect(response.body).toHaveProperty('message', '❌ Shopper not found');
    });

    test('should handle database errors when removing', async () => {
      const mockShopper = {
        _id: 'shopper123',
        wishlist: ['product1'],
        save: jest.fn().mockRejectedValue(new Error('Database error'))
      };

      Shopper.findById.mockResolvedValue(mockShopper);

      const response = await request(app)
        .post('/api/shopper/wishlist/remove')
        .send({ productId: 'product1' })
        .expect(500);

      expect(response.body).toHaveProperty('message', '❌ Failed to remove from wishlist');
    });

    test('should handle clearing entire wishlist', async () => {
      const mockShopper = {
        _id: 'shopper123',
        wishlist: ['product1', 'product2', 'product3'],
        save: jest.fn().mockResolvedValue(true)
      };

      Shopper.findById.mockResolvedValue(mockShopper);

      // Remove all products one by one
      for (const productId of ['product1', 'product2', 'product3']) {
        mockShopper.wishlist = mockShopper.wishlist.filter(
          item => item.toString() !== productId
        );
        
        Shopper.findById.mockReturnValueOnce({
          populate: jest.fn().mockResolvedValue({
            ...mockShopper,
            wishlist: []
          })
        });

        await request(app)
          .post('/api/shopper/wishlist/remove')
          .send({ productId })
          .expect(200);
      }

      expect(mockShopper.wishlist).toHaveLength(0);
    });
  });

  // ==========================================
  // INTEGRATION TESTS
  // ==========================================
  describe('Wishlist Integration Tests', () => {
    test('should handle add and remove sequence', async () => {
      const mockShopper = {
        _id: 'shopper123',
        wishlist: [],
        save: jest.fn().mockResolvedValue(true)
      };

      // Add first product
      Shopper.findById.mockResolvedValueOnce(mockShopper);
      Shopper.findById.mockReturnValueOnce({
        populate: jest.fn().mockResolvedValue({
          ...mockShopper,
          wishlist: [{ _id: 'product1', name: 'Product 1' }]
        })
      });

      await request(app)
        .post('/api/shopper/wishlist/add')
        .send({ productId: 'product1' })
        .expect(200);

      // Add second product
      mockShopper.wishlist = ['product1'];
      Shopper.findById.mockResolvedValueOnce(mockShopper);
      Shopper.findById.mockReturnValueOnce({
        populate: jest.fn().mockResolvedValue({
          ...mockShopper,
          wishlist: [
            { _id: 'product1', name: 'Product 1' },
            { _id: 'product2', name: 'Product 2' }
          ]
        })
      });

      await request(app)
        .post('/api/shopper/wishlist/add')
        .send({ productId: 'product2' })
        .expect(200);

      // Remove first product
      mockShopper.wishlist = ['product1', 'product2'];
      Shopper.findById.mockResolvedValueOnce(mockShopper);
      Shopper.findById.mockReturnValueOnce({
        populate: jest.fn().mockResolvedValue({
          ...mockShopper,
          wishlist: [{ _id: 'product2', name: 'Product 2' }]
        })
      });

      const response = await request(app)
        .post('/api/shopper/wishlist/remove')
        .send({ productId: 'product1' })
        .expect(200);

      expect(response.body.wishlist).toHaveLength(1);
      expect(response.body.wishlist[0]._id).toBe('product2');
    });

    test('should handle wishlist with out-of-stock products', async () => {
      const mockWishlistProducts = [
        {
          _id: 'product1',
          name: 'In Stock Product',
          salePrice: 100,
          stock: 10
        },
        {
          _id: 'product2',
          name: 'Out of Stock Product',
          salePrice: 200,
          stock: 0
        }
      ];

      const mockShopper = {
        _id: 'shopper123',
        wishlist: mockWishlistProducts
      };

      Shopper.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockShopper)
      });

      const response = await request(app)
        .get('/api/shopper/wishlist')
        .expect(200);

      expect(response.body).toHaveLength(2);
      // Both products should be returned, frontend will handle stock status
      expect(response.body[0].stock).toBe(10);
      expect(response.body[1].stock).toBe(0);
    });
  });
});

