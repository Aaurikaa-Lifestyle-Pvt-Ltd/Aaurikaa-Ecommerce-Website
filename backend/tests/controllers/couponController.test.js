const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const Coupon = require('../../models/Coupon');
const pricingRoutes = require('../../routes/pricingRoutes');

// Create test app
const app = express();
app.use(express.json());
app.use('/api/pricing', pricingRoutes);

describe('Coupon Controller', () => {
  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/ecommerce_test_db');
    }
  });

  afterAll(async () => {
    // Clean up test database
    await Coupon.deleteMany({});
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clean up before each test
    await Coupon.deleteMany({});
  });

  describe('POST /api/pricing/validate-coupon', () => {
    it('should validate a valid coupon code', async () => {
      // Create a test coupon
      const testCoupon = new Coupon({
        code: 'TEST10',
        discountType: 'percentage',
        discountValue: 10,
        minOrder: 100,
        validFrom: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
        validTo: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day from now
        isActive: true
      });
      await testCoupon.save();

      const response = await request(app)
        .post('/api/pricing/validate-coupon')
        .send({
          couponCode: 'TEST10',
          cartTotal: 150
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.valid).toBe(true);
      expect(response.body.data.coupon.code).toBe('TEST10');
    });

    it('should reject invalid coupon code', async () => {
      const response = await request(app)
        .post('/api/pricing/validate-coupon')
        .send({
          couponCode: 'INVALID',
          cartTotal: 150
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.valid).toBe(false);
      expect(response.body.message).toContain('Invalid or expired coupon code');
    });

    it('should reject coupon with insufficient cart total', async () => {
      // Create a test coupon with high minimum order
      const testCoupon = new Coupon({
        code: 'HIGHMIN',
        discountType: 'percentage',
        discountValue: 10,
        minOrder: 500,
        validFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
        validTo: new Date(Date.now() + 24 * 60 * 60 * 1000),
        isActive: true
      });
      await testCoupon.save();

      const response = await request(app)
        .post('/api/pricing/validate-coupon')
        .send({
          couponCode: 'HIGHMIN',
          cartTotal: 100
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.valid).toBe(false);
      expect(response.body.message).toContain('Minimum order amount');
    });

    it('should reject expired coupon', async () => {
      // Create an expired coupon
      const testCoupon = new Coupon({
        code: 'EXPIRED',
        discountType: 'percentage',
        discountValue: 10,
        minOrder: 100,
        validFrom: new Date(Date.now() - 48 * 60 * 60 * 1000), // 2 days ago
        validTo: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
        isActive: true
      });
      await testCoupon.save();

      const response = await request(app)
        .post('/api/pricing/validate-coupon')
        .send({
          couponCode: 'EXPIRED',
          cartTotal: 150
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.valid).toBe(false);
      expect(response.body.message).toContain('Invalid or expired coupon code');
    });

    it('should reject inactive coupon', async () => {
      // Create an inactive coupon
      const testCoupon = new Coupon({
        code: 'INACTIVE',
        discountType: 'percentage',
        discountValue: 10,
        minOrder: 100,
        validFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
        validTo: new Date(Date.now() + 24 * 60 * 60 * 1000),
        isActive: false
      });
      await testCoupon.save();

      const response = await request(app)
        .post('/api/pricing/validate-coupon')
        .send({
          couponCode: 'INACTIVE',
          cartTotal: 150
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.valid).toBe(false);
      expect(response.body.message).toContain('Invalid or expired coupon code');
    });

    it('should handle missing coupon code', async () => {
      const response = await request(app)
        .post('/api/pricing/validate-coupon')
        .send({
          cartTotal: 150
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Coupon code is required');
    });

    it('should handle invalid cart total', async () => {
      const response = await request(app)
        .post('/api/pricing/validate-coupon')
        .send({
          couponCode: 'TEST10',
          cartTotal: -100
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Valid cart total is required');
    });
  });

  describe('POST /api/pricing/calculate', () => {
    it('should calculate pricing with valid coupon', async () => {
      // Create a test coupon
      const testCoupon = new Coupon({
        code: 'TEST10',
        discountType: 'percentage',
        discountValue: 10,
        minOrder: 100,
        validFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
        validTo: new Date(Date.now() + 24 * 60 * 60 * 1000),
        isActive: true
      });
      await testCoupon.save();

      const cartItems = [
        {
          product: { price: 100 },
          quantity: 2
        }
      ];

      const response = await request(app)
        .post('/api/pricing/calculate')
        .send({
          cartItems,
          couponCode: 'TEST10',
          shippingAddress: null,
          options: {}
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.subtotal).toBe(200);
      expect(response.body.data.discount.total).toBe(20); // 10% of 200
      expect(response.body.data.total).toBeGreaterThan(0);
    });

    it('should calculate pricing without coupon', async () => {
      const cartItems = [
        {
          product: { price: 100 },
          quantity: 2
        }
      ];

      const response = await request(app)
        .post('/api/pricing/calculate')
        .send({
          cartItems,
          couponCode: null,
          shippingAddress: null,
          options: {}
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.subtotal).toBe(200);
      expect(response.body.data.discount.total).toBe(0);
      expect(response.body.data.total).toBeGreaterThan(0);
    });

    it('should handle empty cart', async () => {
      const response = await request(app)
        .post('/api/pricing/calculate')
        .send({
          cartItems: [],
          couponCode: null,
          shippingAddress: null,
          options: {}
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Cart cannot be empty');
    });
  });
});
