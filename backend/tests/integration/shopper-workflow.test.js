const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');

// Mock the models
jest.mock('../../models/Shopper');
jest.mock('../../models/Product');
jest.mock('../../models/Order');
jest.mock('../../utils/otpService');

const Shopper = require('../../models/Shopper');
const Product = require('../../models/Product');
const Order = require('../../models/Order');
const otpService = require('../../utils/otpService');

const app = express();
app.use(express.json());

// Import controllers
const shopperController = require('../../controllers/shopperController');

// Mock middleware
const mockVerifyShopper = (req, res, next) => {
  req.user = { id: 'shopper123' };
  next();
};

// Add routes
app.post('/api/shopper/register', shopperController.registerShopper);
app.post('/api/shopper/verify-registration', shopperController.verifyShopperRegistration);
app.post('/api/shopper/login', shopperController.loginShopper);
app.get('/api/shopper/profile', mockVerifyShopper, shopperController.getShopperProfile);
app.get('/api/shopper/wishlist', mockVerifyShopper, shopperController.getWishlist);
app.post('/api/shopper/wishlist/add', mockVerifyShopper, shopperController.addToWishlist);
app.get('/api/shopper/cart', mockVerifyShopper, shopperController.getCart);
app.post('/api/shopper/cart/add', mockVerifyShopper, shopperController.addToCart);
app.get('/api/shopper/orders', mockVerifyShopper, shopperController.getShopperOrders);

describe('Complete Shopper Workflow Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================
  // REGISTRATION WORKFLOW
  // ==========================================
  describe('Shopper Registration Workflow', () => {
    test('should complete registration with OTP verification', async () => {
      const shopperData = {
        firstName: 'John',
        lastName: 'Doe',
        username: 'johndoe',
        email: 'john@example.com',
        phone: '9876543210',
        password: 'password123'
      };

      // Step 1: Check no existing shopper
      Shopper.findOne.mockResolvedValue(null);

      // Step 2: Send OTP
      otpService.sendRegistrationOTP.mockResolvedValue({
        success: true,
        message: 'OTP sent successfully',
        expiresAt: Date.now() + 300000
      });

      const registerResponse = await request(app)
        .post('/api/shopper/register')
        .send(shopperData)
        .expect(201);

      expect(registerResponse.body.message).toContain('OTP sent');

      // Step 3: Verify OTP and complete registration
      otpService.verifyOTP.mockResolvedValue({
        success: true,
        message: 'OTP verified successfully'
      });

      Shopper.findOne.mockResolvedValue(null); // Double check for duplicate

      const mockSave = jest.fn().mockResolvedValue(true);
      Shopper.mockImplementation(() => ({
        save: mockSave
      }));

      const verifyResponse = await request(app)
        .post('/api/shopper/verify-registration')
        .send({ ...shopperData, otp: '123456' })
        .expect(201);

      expect(verifyResponse.body.message).toContain('registered and verified successfully');
      expect(mockSave).toHaveBeenCalled();
    });

    test('should prevent duplicate registration', async () => {
      const shopperData = {
        firstName: 'John',
        lastName: 'Doe',
        username: 'johndoe',
        email: 'john@example.com',
        phone: '9876543210',
        password: 'password123'
      };

      // Mock existing shopper
      Shopper.findOne.mockResolvedValue({
        _id: 'existing123',
        email: 'john@example.com'
      });

      const response = await request(app)
        .post('/api/shopper/register')
        .send(shopperData)
        .expect(400);

      expect(response.body.message).toContain('Email or username already exists');
    });

    test('should reject registration with invalid OTP', async () => {
      const shopperData = {
        firstName: 'John',
        lastName: 'Doe',
        username: 'johndoe',
        email: 'john@example.com',
        phone: '9876543210',
        password: 'password123',
        otp: 'wrong-otp'
      };

      otpService.verifyOTP.mockResolvedValue({
        success: false,
        message: 'Invalid OTP',
        code: 'INVALID_OTP'
      });

      const response = await request(app)
        .post('/api/shopper/verify-registration')
        .send(shopperData)
        .expect(400);

      expect(response.body.message).toContain('Invalid OTP');
    });
  });

  // ==========================================
  // LOGIN WORKFLOW
  // ==========================================
  describe('Shopper Login Workflow', () => {
    test('should login successfully with valid credentials', async () => {
      const bcrypt = require('bcryptjs');
      const jwt = require('jsonwebtoken');

      const mockShopper = {
        _id: 'shopper123',
        firstName: 'John',
        lastName: 'Doe',
        username: 'johndoe',
        email: 'john@example.com',
        phone: '9876543210',
        password: await bcrypt.hash('password123', 10),
        role: 'shopper'
      };

      Shopper.findOne.mockResolvedValue(mockShopper);

      const response = await request(app)
        .post('/api/shopper/login')
        .send({
          identifier: 'john@example.com',
          password: 'password123'
        })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('shopper');
      expect(response.body.shopper.email).toBe('john@example.com');
    });

    test('should reject login with invalid credentials', async () => {
      Shopper.findOne.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/shopper/login')
        .send({
          identifier: 'wrong@example.com',
          password: 'wrongpassword'
        })
        .expect(400);

      expect(response.body.message).toContain('Invalid credentials');
    });

    test('should login with username instead of email', async () => {
      const bcrypt = require('bcryptjs');

      const mockShopper = {
        _id: 'shopper123',
        firstName: 'John',
        lastName: 'Doe',
        username: 'johndoe',
        email: 'john@example.com',
        password: await bcrypt.hash('password123', 10),
        role: 'shopper'
      };

      Shopper.findOne.mockResolvedValue(mockShopper);

      const response = await request(app)
        .post('/api/shopper/login')
        .send({
          identifier: 'johndoe',
          password: 'password123'
        })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body.shopper.username).toBe('johndoe');
    });
  });

  // ==========================================
  // BROWSING AND WISHLIST WORKFLOW
  // ==========================================
  describe('Product Browsing and Wishlist Workflow', () => {
    test('should browse products and add to wishlist', async () => {
      // Step 1: Shopper is authenticated
      const mockShopper = {
        _id: 'shopper123',
        wishlist: [],
        save: jest.fn().mockResolvedValue(true)
      };

      Shopper.findById.mockResolvedValue(mockShopper);

      // Step 2: Add product to wishlist
      Shopper.findById.mockReturnValueOnce(Promise.resolve(mockShopper));
      Shopper.findById.mockReturnValueOnce({
        populate: jest.fn().mockResolvedValue({
          ...mockShopper,
          wishlist: [{ _id: 'product1', name: 'Test Product' }]
        })
      });

      const response = await request(app)
        .post('/api/shopper/wishlist/add')
        .send({ productId: 'product1' })
        .expect(200);

      expect(response.body.message).toContain('added to wishlist');
      expect(response.body.wishlist).toHaveLength(1);
    });

    test('should view wishlist after adding products', async () => {
      const mockWishlistProducts = [
        { _id: 'product1', name: 'Product 1', salePrice: 100 },
        { _id: 'product2', name: 'Product 2', salePrice: 200 }
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
    });
  });

  // ==========================================
  // SHOPPING CART WORKFLOW
  // ==========================================
  describe('Shopping Cart Workflow', () => {
    test('should add product from wishlist to cart', async () => {
      const mockShopper = {
        _id: 'shopper123',
        cart: [],
        save: jest.fn().mockResolvedValue(true)
      };

      const mockProduct = {
        _id: 'product1',
        name: 'Test Product',
        salePrice: 100,
        stock: 10
      };

      Shopper.findById.mockResolvedValue(mockShopper);
      Product.findById.mockResolvedValue(mockProduct);

      Shopper.findById.mockReturnValueOnce(Promise.resolve(mockShopper));
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

      expect(response.body.message).toContain('added to cart');
      expect(response.body.cart.items).toHaveLength(1);
    });

    test('should view cart with added products', async () => {
      const mockCart = [
        {
          product: {
            _id: 'product1',
            name: 'Product 1',
            salePrice: 100
          },
          quantity: 2
        }
      ];

      const mockShopper = {
        _id: 'shopper123',
        cart: mockCart
      };

      Shopper.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockShopper)
      });

      const response = await request(app)
        .get('/api/shopper/cart')
        .expect(200);

      expect(response.body.cart.items).toHaveLength(1);
      expect(response.body.cart.items[0].quantity).toBe(2);
    });

    test('should prevent adding out-of-stock product to cart', async () => {
      const mockShopper = {
        _id: 'shopper123',
        cart: []
      };

      const mockProduct = {
        _id: 'product1',
        name: 'Test Product',
        salePrice: 100,
        stock: 0
      };

      Shopper.findById.mockResolvedValue(mockShopper);
      Product.findById.mockResolvedValue(mockProduct);

      const response = await request(app)
        .post('/api/shopper/cart/add')
        .send({ productId: 'product1', quantity: 1 })
        .expect(400);

      expect(response.body.message).toContain('out of stock');
    });
  });

  // ==========================================
  // ORDER HISTORY WORKFLOW
  // ==========================================
  describe('Order History Workflow', () => {
    test('should view order history after placing orders', async () => {
      const mockOrders = [
        {
          _id: 'order1',
          orderNumber: 'ORD001',
          status: 'delivered',
          totalAmount: 500,
          items: [
            {
              product: {
                _id: 'product1',
                name: 'Product 1',
                price: 100
              },
              quantity: 2
            }
          ],
          createdAt: '2024-01-01T00:00:00.000Z'
        }
      ];

      Order.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockResolvedValue(mockOrders)
      });

      const response = await request(app)
        .get('/api/shopper/orders')
        .expect(200);

      expect(response.body.orders).toHaveLength(1);
      expect(response.body.orders[0].orderNumber).toBe('ORD001');
    });

    test('should show empty order history for new shopper', async () => {
      Order.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockResolvedValue([])
      });

      const response = await request(app)
        .get('/api/shopper/orders')
        .expect(200);

      expect(response.body.orders).toHaveLength(0);
    });
  });

  // ==========================================
  // PROFILE MANAGEMENT WORKFLOW
  // ==========================================
  describe('Profile Management Workflow', () => {
    test('should view profile after login', async () => {
      const mockShopper = {
        _id: 'shopper123',
        firstName: 'John',
        lastName: 'Doe',
        username: 'johndoe',
        email: 'john@example.com',
        phone: '9876543210',
        role: 'shopper'
      };

      Shopper.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockShopper)
      });

      const response = await request(app)
        .get('/api/shopper/profile')
        .expect(200);

      expect(response.body.shopper.email).toBe('john@example.com');
      expect(response.body.shopper).not.toHaveProperty('password');
    });
  });

  // ==========================================
  // COMPLETE JOURNEY INTEGRATION TEST
  // ==========================================
  describe('Complete Shopper Journey', () => {
    test('should complete full journey: register -> login -> browse -> cart -> orders', async () => {
      const bcrypt = require('bcryptjs');

      // Step 1: Register
      Shopper.findOne.mockResolvedValue(null);
      otpService.sendRegistrationOTP.mockResolvedValue({
        success: true,
        expiresAt: Date.now() + 300000
      });

      await request(app)
        .post('/api/shopper/register')
        .send({
          firstName: 'John',
          lastName: 'Doe',
          username: 'johndoe',
          email: 'john@example.com',
          phone: '9876543210',
          password: 'password123'
        })
        .expect(201);

      // Step 2: Verify OTP
      otpService.verifyOTP.mockResolvedValue({ success: true });
      const mockSave = jest.fn().mockResolvedValue(true);
      Shopper.mockImplementation(() => ({ save: mockSave }));

      await request(app)
        .post('/api/shopper/verify-registration')
        .send({
          firstName: 'John',
          lastName: 'Doe',
          username: 'johndoe',
          email: 'john@example.com',
          phone: '9876543210',
          password: 'password123',
          otp: '123456'
        })
        .expect(201);

      // Step 3: Login
      const mockShopper = {
        _id: 'shopper123',
        firstName: 'John',
        lastName: 'Doe',
        username: 'johndoe',
        email: 'john@example.com',
        password: await bcrypt.hash('password123', 10),
        role: 'shopper',
        wishlist: [],
        cart: [],
        save: jest.fn().mockResolvedValue(true)
      };

      Shopper.findOne.mockResolvedValue(mockShopper);

      const loginResponse = await request(app)
        .post('/api/shopper/login')
        .send({
          identifier: 'john@example.com',
          password: 'password123'
        })
        .expect(200);

      expect(loginResponse.body).toHaveProperty('token');

      // Step 4: Add to wishlist
      Shopper.findById.mockResolvedValue(mockShopper);
      Shopper.findById.mockReturnValueOnce(Promise.resolve(mockShopper));
      Shopper.findById.mockReturnValueOnce({
        populate: jest.fn().mockResolvedValue({
          ...mockShopper,
          wishlist: [{ _id: 'product1' }]
        })
      });

      await request(app)
        .post('/api/shopper/wishlist/add')
        .send({ productId: 'product1' })
        .expect(200);

      // Step 5: Add to cart
      const mockProduct = {
        _id: 'product1',
        name: 'Test Product',
        salePrice: 100,
        stock: 10
      };

      Shopper.findById.mockResolvedValue(mockShopper);
      Product.findById.mockResolvedValue(mockProduct);
      Shopper.findById.mockReturnValueOnce(Promise.resolve(mockShopper));
      Shopper.findById.mockReturnValueOnce({
        populate: jest.fn().mockResolvedValue({
          ...mockShopper,
          cart: [{ product: mockProduct, quantity: 1 }]
        })
      });

      await request(app)
        .post('/api/shopper/cart/add')
        .send({ productId: 'product1', quantity: 1 })
        .expect(200);

      // Step 6: View orders (empty initially)
      Order.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockResolvedValue([])
      });

      const ordersResponse = await request(app)
        .get('/api/shopper/orders')
        .expect(200);

      expect(ordersResponse.body.orders).toHaveLength(0);
    });
  });
});

