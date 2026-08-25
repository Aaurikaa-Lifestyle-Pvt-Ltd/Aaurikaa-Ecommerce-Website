const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// Mock the models
jest.mock('../../models/Shopper');
jest.mock('../../models/Order');
jest.mock('../../utils/otpService');

const Shopper = require('../../models/Shopper');
const Order = require('../../models/Order');

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
app.get('/api/shopper/dashboard/stats', mockVerifyShopper, shopperController.getShopperDashboardStats);

describe('Shopper Dashboard Statistics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return dashboard statistics successfully', async () => {
    // Mock data
    const mockShopper = {
      _id: 'shopper123',
      wishlist: ['product1', 'product2', 'product3']
    };

    const mockOrders = [
      {
        _id: 'order1',
        orderNumber: 'ORD001',
        status: 'delivered',
        totalAmount: 1500,
        createdAt: '2024-01-01T00:00:00.000Z'
      },
      {
        _id: 'order2',
        orderNumber: 'ORD002',
        status: 'shipped',
        totalAmount: 2000,
        createdAt: '2024-01-02T00:00:00.000Z'
      }
    ];

    // Mock Order.countDocuments for active orders
    Order.countDocuments.mockResolvedValue(1);

    // Mock Shopper.findById with populate
    Shopper.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(mockShopper)
    });

    // Mock Order.aggregate for total spent
    Order.aggregate.mockResolvedValue([{ _id: null, total: 1500 }]);

    // Mock Order.find for recent orders
    Order.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue(mockOrders)
    });

    const response = await request(app)
      .get('/api/shopper/dashboard/stats')
      .expect(200);

    expect(response.body).toHaveProperty('activeOrders', 1);
    expect(response.body).toHaveProperty('wishlistCount', 3);
    expect(response.body).toHaveProperty('totalSpent', 1500);
    expect(response.body).toHaveProperty('recentOrders');
    expect(response.body.recentOrders).toHaveLength(2);
  });

  test('should handle empty dashboard statistics', async () => {
    // Mock empty data
    const mockShopper = {
      _id: 'shopper123',
      wishlist: []
    };

    // Mock Order.countDocuments for active orders
    Order.countDocuments.mockResolvedValue(0);

    // Mock Shopper.findById with populate
    Shopper.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(mockShopper)
    });

    // Mock Order.aggregate for total spent (empty result)
    Order.aggregate.mockResolvedValue([]);

    // Mock Order.find for recent orders (empty)
    Order.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue([])
    });

    const response = await request(app)
      .get('/api/shopper/dashboard/stats')
      .expect(200);

    expect(response.body).toHaveProperty('activeOrders', 0);
    expect(response.body).toHaveProperty('wishlistCount', 0);
    expect(response.body).toHaveProperty('totalSpent', 0);
    expect(response.body).toHaveProperty('recentOrders');
    expect(response.body.recentOrders).toHaveLength(0);
  });

  test('should handle database errors gracefully', async () => {
    // Mock database error
    Order.countDocuments.mockRejectedValue(new Error('Database connection failed'));

    const response = await request(app)
      .get('/api/shopper/dashboard/stats')
      .expect(500);

    expect(response.body).toHaveProperty('message', '❌ Failed to fetch dashboard statistics');
  });
});
