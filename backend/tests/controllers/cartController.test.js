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
app.get('/api/shopper/cart', mockVerifyShopper, shopperController.getCart);
app.post('/api/shopper/cart/add', mockVerifyShopper, shopperController.addToCart);
app.post('/api/shopper/cart/remove', mockVerifyShopper, shopperController.removeFromCart);

describe('Shopper Cart Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================
  // GET CART TESTS
  // ==========================================
  describe('GET /api/shopper/cart - Get Cart', () => {
    test('should retrieve shopper cart successfully', async () => {
      const mockShopper = {
        _id: 'shopper123',
        cart: [
          {
            product: {
              _id: 'product1',
              name: 'Test Product 1',
              salePrice: 100,
              mainImage: 'product1.jpg'
            },
            quantity: 2
          },
          {
            product: {
              _id: 'product2',
              name: 'Test Product 2',
              salePrice: 200,
              mainImage: 'product2.jpg'
            },
            quantity: 1
          }
        ]
      };

      Shopper.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockShopper)
      });

      const response = await request(app)
        .get('/api/shopper/cart')
        .expect(200);

      expect(response.body).toHaveProperty('cart');
      expect(response.body.cart).toHaveProperty('items');
      expect(response.body.cart.items).toHaveLength(2);
      expect(response.body.cart.items[0].product.name).toBe('Test Product 1');
      expect(response.body.cart.items[0].quantity).toBe(2);
    });

    test('should return empty cart for new shopper', async () => {
      const mockShopper = {
        _id: 'shopper123',
        cart: []
      };

      Shopper.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockShopper)
      });

      const response = await request(app)
        .get('/api/shopper/cart')
        .expect(200);

      expect(response.body.cart.items).toHaveLength(0);
    });

    test('should handle shopper not found error', async () => {
      Shopper.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(null)
      });

      const response = await request(app)
        .get('/api/shopper/cart')
        .expect(404);

      expect(response.body).toHaveProperty('message', '❌ Shopper not found');
    });

    test('should handle database errors', async () => {
      Shopper.findById.mockReturnValue({
        populate: jest.fn().mockRejectedValue(new Error('Database error'))
      });

      const response = await request(app)
        .get('/api/shopper/cart')
        .expect(500);

      expect(response.body).toHaveProperty('message', '❌ Failed to fetch cart');
    });
  });

  // ==========================================
  // ADD TO CART TESTS
  // ==========================================
  describe('POST /api/shopper/cart/add - Add to Cart', () => {
    test('should add new product to cart successfully', async () => {
      const mockShopper = {
        _id: 'shopper123',
        cart: [],
        save: jest.fn().mockResolvedValue(true)
      };

      const mockProduct = {
        _id: 'product1',
        name: 'Test Product',
        salePrice: 100
      };

      Shopper.findById.mockResolvedValueOnce(mockShopper);
      Shopper.findById.mockReturnValueOnce({
        populate: jest.fn().mockResolvedValue({
          ...mockShopper,
          cart: [{ product: mockProduct, quantity: 1 }]
        })
      });

      const response = await request(app)
        .post('/api/shopper/cart/add')
        .send({ productId: 'product1', quantity: 1 })
        .expect(200);

      expect(response.body).toHaveProperty('message', '✅ Product added to cart');
      expect(response.body.cart.items).toHaveLength(1);
      expect(mockShopper.save).toHaveBeenCalled();
    });

    test('should increase quantity if product already in cart', async () => {
      const mockProduct = {
        _id: 'product1',
        name: 'Test Product',
        salePrice: 100
      };

      const mockShopper = {
        _id: 'shopper123',
        cart: [{ product: 'product1', quantity: 1 }],
        save: jest.fn().mockResolvedValue(true)
      };

      Shopper.findById.mockResolvedValueOnce(mockShopper);
      Shopper.findById.mockReturnValueOnce({
        populate: jest.fn().mockResolvedValue({
          ...mockShopper,
          cart: [{ product: mockProduct, quantity: 2 }]
        })
      });

      const response = await request(app)
        .post('/api/shopper/cart/add')
        .send({ productId: 'product1', quantity: 1 })
        .expect(200);

      expect(response.body).toHaveProperty('message', '✅ Product added to cart');
      expect(mockShopper.cart[0].quantity).toBe(2);
    });

    test('should handle shopper not found error', async () => {
      Shopper.findById.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/shopper/cart/add')
        .send({ productId: 'product1', quantity: 1 })
        .expect(404);

      expect(response.body).toHaveProperty('message', '❌ Shopper not found');
    });

    test('should handle database errors', async () => {
      Shopper.findById.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/shopper/cart/add')
        .send({ productId: 'product1', quantity: 1 })
        .expect(500);

      expect(response.body).toHaveProperty('message', '❌ Failed to add to cart');
    });
  });

  // ==========================================
  // REMOVE FROM CART TESTS
  // ==========================================
  describe('POST /api/shopper/cart/remove - Remove from Cart', () => {
    test('should remove product from cart successfully', async () => {
      const mockProduct2 = {
        _id: 'product2',
        name: 'Product 2'
      };

      const mockShopper = {
        _id: 'shopper123',
        cart: [
          { product: 'product1', quantity: 1 },
          { product: 'product2', quantity: 2 }
        ],
        save: jest.fn().mockResolvedValue(true)
      };

      Shopper.findById.mockResolvedValueOnce(mockShopper);
      Shopper.findById.mockReturnValueOnce({
        populate: jest.fn().mockResolvedValue({
          ...mockShopper,
          cart: [{ product: mockProduct2, quantity: 2 }]
        })
      });

      const response = await request(app)
        .post('/api/shopper/cart/remove')
        .send({ productId: 'product1' })
        .expect(200);

      expect(response.body).toHaveProperty('message', '✅ Product removed from cart');
      expect(mockShopper.cart).toHaveLength(1);
      expect(mockShopper.cart[0].product).toBe('product2');
    });

    test('should handle shopper not found error', async () => {
      Shopper.findById.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/shopper/cart/remove')
        .send({ productId: 'product1' })
        .expect(404);

      expect(response.body).toHaveProperty('message', '❌ Shopper not found');
    });

    test('should handle database errors', async () => {
      Shopper.findById.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/shopper/cart/remove')
        .send({ productId: 'product1' })
        .expect(500);

      expect(response.body).toHaveProperty('message', '❌ Failed to remove from cart');
    });

    test('should handle removing product not in cart', async () => {
      const mockShopper = {
        _id: 'shopper123',
        cart: [{ product: 'product1', quantity: 1 }],
        save: jest.fn().mockResolvedValue(true)
      };

      Shopper.findById.mockResolvedValueOnce(mockShopper);
      Shopper.findById.mockReturnValueOnce({
        populate: jest.fn().mockResolvedValue({
          ...mockShopper,
          cart: [{ product: { _id: 'product1', name: 'Product 1' }, quantity: 1 }]
        })
      });

      const response = await request(app)
        .post('/api/shopper/cart/remove')
        .send({ productId: 'product2' })
        .expect(200);

      expect(response.body).toHaveProperty('message', '✅ Product removed from cart');
    });
  });

});

