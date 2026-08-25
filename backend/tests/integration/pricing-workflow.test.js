// Integration tests for complete pricing workflow

const request = require('supertest');
const express = require('express');
const Coupon = require('../../models/coupon');

// Create a test app without starting the server
const app = express();
app.use(express.json());

// Import and use the pricing routes
const pricingRoutes = require('../../routes/pricingRoutes');
app.use('/api/pricing', pricingRoutes);

describe('Pricing Workflow Integration Tests', () => {
  beforeEach(async () => {
    // Clean up test data
    await Coupon.deleteMany({});
  });

  afterEach(async () => {
    // Clean up test data
    await Coupon.deleteMany({});
  });

  describe('POST /api/pricing/calculate', () => {
    test('should calculate pricing for valid cart items', async () => {
      const cartItems = [
        {
          product: { price: 100, salePrice: 90 },
          quantity: 2
        },
        {
          product: { price: 50 },
          quantity: 1
        }
      ];

      const response = await request(app)
        .post('/api/pricing/calculate')
        .send({
          cartItems,
          shippingAddress: { stateId: 'Delhi' },
          options: {}
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.subtotal).toBe(230); // (90*2) + (50*1)
      expect(response.body.data.tax.amount).toBeGreaterThan(0);
      expect(response.body.data.shipping.amount).toBeGreaterThanOrEqual(0);
      expect(response.body.data.total).toBeGreaterThan(response.body.data.subtotal);
    });

    test('should calculate pricing with coupon', async () => {
      // Create test coupon
      const coupon = new Coupon({
        code: 'TEST10',
        discountType: 'percentage',
        discountValue: 10,
        minOrder: 200,
        freeShipping: false,
        isActive: true,
        validFrom: new Date(Date.now() - 86400000),
        validTo: new Date(Date.now() + 86400000)
      });
      await coupon.save();

      const cartItems = [
        {
          product: { price: 100 },
          quantity: 3
        }
      ];

      const response = await request(app)
        .post('/api/pricing/calculate')
        .send({
          cartItems,
          couponCode: 'TEST10',
          shippingAddress: { stateId: 'Maharashtra' },
          options: {}
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.subtotal).toBe(300);
      expect(response.body.data.discount.total).toBe(30); // 10% of 300
      expect(response.body.data.metadata.couponApplied).toBe(true);
    });

    test('should handle invalid cart items', async () => {
      const response = await request(app)
        .post('/api/pricing/calculate')
        .send({
          cartItems: 'invalid',
          shippingAddress: null,
          options: {}
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Cart items');
    });

    test('should handle empty cart', async () => {
      const response = await request(app)
        .post('/api/pricing/calculate')
        .send({
          cartItems: [],
          shippingAddress: null,
          options: {}
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.subtotal).toBe(0);
      expect(response.body.data.total).toBe(0);
    });

    test('should accept checkout quote shape with product ID (no client price)', async () => {
      const Product = require('../../models/Product');
      const product = await Product.create({
        name: 'Emerald Crest Statement Ring',
        sku: `EMERALD-CREST-${Date.now()}`,
        regularPrice: 4190,
        stock: 5,
      });

      const response = await request(app)
        .post('/api/pricing/calculate')
        .send({
          cartItems: [{ product: product._id.toString(), quantity: 1 }],
          shippingAddress: null,
          options: {},
        });

      // Regression: ID-only checkout quotes must not fail cart price pre-validation.
      // Shipping may still fail closed (e.g. missing weightClass) — that is separate.
      expect(response.body.message || '').not.toMatch(/price must be at least/i);
      expect(response.body.message || '').not.toMatch(/Item at index/i);
      if (response.status === 200) {
        expect(response.body.success).toBe(true);
        expect(response.body.data.subtotal).toBe(4190);
      } else {
        expect(response.status).toBe(400);
        expect(String(response.body.message || '')).toMatch(/shipping|weight|slab|zone/i);
      }

      await Product.deleteOne({ _id: product._id });
    });

    test('should resolve regularPrice-only product to ₹4190 in subtotal engine', async () => {
      const { calculateSubtotal } = require('../../utils/pricingEngine');
      const Product = require('../../models/Product');
      const product = await Product.create({
        name: 'Emerald Crest Statement Ring',
        sku: `EMERALD-SUB-${Date.now()}`,
        regularPrice: 4190,
        stock: 5,
      });

      const result = await calculateSubtotal([
        { product: product._id.toString(), quantity: 1 },
      ]);

      expect(result.subtotal).toBe(4190);
      expect(result.originalSubtotal).toBe(4190);
      expect(result.items[0].price).toBe(4190);

      await Product.deleteOne({ _id: product._id });
    });

    test('should prefer salePrice when valid, else regularPrice', async () => {
      const { calculateSubtotal } = require('../../utils/pricingEngine');
      const Product = require('../../models/Product');
      const onSale = await Product.create({
        name: 'Sale Ring',
        sku: `SALE-${Date.now()}`,
        regularPrice: 4190,
        salePrice: 3990,
        stock: 2,
      });
      const regularOnly = await Product.create({
        name: 'Regular Ring',
        sku: `REG-${Date.now()}`,
        regularPrice: 2500,
        stock: 2,
      });

      const saleResult = await calculateSubtotal([{ product: onSale._id, quantity: 1 }]);
      const regularResult = await calculateSubtotal([{ product: regularOnly._id, quantity: 1 }]);
      const mixed = await calculateSubtotal([
        { product: onSale._id, quantity: 1 },
        { product: regularOnly._id, quantity: 1 },
      ]);

      expect(saleResult.subtotal).toBe(3990);
      expect(regularResult.subtotal).toBe(2500);
      expect(mixed.subtotal).toBe(6490);

      await Product.deleteMany({ _id: { $in: [onSale._id, regularOnly._id] } });
    });
  });

  describe('POST /api/pricing/validate-coupon', () => {
    test('should validate valid coupon', async () => {
      // Create test coupon
      const coupon = new Coupon({
        code: 'VALID20',
        discountType: 'percentage',
        discountValue: 20,
        minOrder: 500,
        freeShipping: false,
        isActive: true,
        validFrom: new Date(Date.now() - 86400000),
        validTo: new Date(Date.now() + 86400000)
      });
      await coupon.save();

      const response = await request(app)
        .post('/api/pricing/validate-coupon')
        .send({
          couponCode: 'VALID20',
          cartTotal: 1000
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.valid).toBe(true);
      expect(response.body.data.coupon.code).toBe('VALID20');
    });

    test('should reject invalid coupon', async () => {
      const response = await request(app)
        .post('/api/pricing/validate-coupon')
        .send({
          couponCode: 'INVALID',
          cartTotal: 1000
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.valid).toBe(false);
    });

    test('should reject coupon when minimum order not met', async () => {
      // Create test coupon
      const coupon = new Coupon({
        code: 'MIN500',
        discountType: 'fixed',
        discountValue: 50,
        minOrder: 500,
        freeShipping: false,
        isActive: true,
        validFrom: new Date(Date.now() - 86400000),
        validTo: new Date(Date.now() + 86400000)
      });
      await coupon.save();

      const response = await request(app)
        .post('/api/pricing/validate-coupon')
        .send({
          couponCode: 'MIN500',
          cartTotal: 300
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.valid).toBe(false);
    });

    test('should handle missing coupon code', async () => {
      const response = await request(app)
        .post('/api/pricing/validate-coupon')
        .send({
          cartTotal: 1000
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Coupon code is required');
    });
  });

  describe('POST /api/pricing/product', () => {
    test('should calculate product pricing', async () => {
      const product = {
        price: 100,
        salePrice: 90,
        taxRate: 0.05,
        shippingCharge: 20
      };

      const response = await request(app)
        .post('/api/pricing/product')
        .send({
          product,
          quantity: 2,
          options: {}
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.subtotal).toBe(180); // 90 * 2
      expect(response.body.data.tax.amount).toBe(9); // 5% of 180
      expect(response.body.data.shipping.amount).toBe(20);
      expect(response.body.data.total).toBe(209); // 180 + 9 + 20
    });

    test('should handle missing product', async () => {
      const response = await request(app)
        .post('/api/pricing/product')
        .send({
          quantity: 2,
          options: {}
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Product is required');
    });

    test('should handle invalid quantity', async () => {
      const product = { price: 100 };

      const response = await request(app)
        .post('/api/pricing/product')
        .send({
          product,
          quantity: -1,
          options: {}
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Valid quantity is required');
    });
  });

  describe('POST /api/pricing/order-breakdown', () => {
    test('should calculate order breakdown', async () => {
      const orderItems = [
        {
          product: { price: 100 },
          quantity: 2,
          price: 100
        },
        {
          product: { price: 50 },
          quantity: 1,
          price: 50
        }
      ];

      const response = await request(app)
        .post('/api/pricing/order-breakdown')
        .send({
          orderItems,
          shippingAddress: { stateId: 'Karnataka' },
          options: {}
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.subtotal).toBe(250); // (100*2) + (50*1)
      expect(response.body.data.metadata.orderItemCount).toBe(2);
      expect(response.body.data.metadata.calculatedFor).toBe('order');
    });

    test('should handle invalid order items', async () => {
      const response = await request(app)
        .post('/api/pricing/order-breakdown')
        .send({
          orderItems: 'invalid',
          shippingAddress: null,
          options: {}
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Order items are required');
    });
  });

  describe('GET /api/pricing/health', () => {
    test('should return health check status', async () => {
      const response = await request(app)
        .get('/api/pricing/health');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('healthy');
      expect(response.body.data.testCalculation).toBeDefined();
    });
  });

  describe('Complete Pricing Workflow', () => {
    test('should handle complete cart to order pricing workflow', async () => {
      // Step 1: Create a coupon
      const coupon = new Coupon({
        code: 'WORKFLOW10',
        discountType: 'percentage',
        discountValue: 10,
        minOrder: 200,
        freeShipping: false,
        isActive: true,
        validFrom: new Date(Date.now() - 86400000),
        validTo: new Date(Date.now() + 86400000)
      });
      await coupon.save();

      // Step 2: Validate coupon
      const validateResponse = await request(app)
        .post('/api/pricing/validate-coupon')
        .send({
          couponCode: 'WORKFLOW10',
          cartTotal: 500
        });

      expect(validateResponse.status).toBe(200);
      expect(validateResponse.body.data.valid).toBe(true);

      // Step 3: Calculate cart pricing
      const cartItems = [
        { product: { price: 200 }, quantity: 2 },
        { product: { price: 100 }, quantity: 1 }
      ];

      const pricingResponse = await request(app)
        .post('/api/pricing/calculate')
        .send({
          cartItems,
          couponCode: 'WORKFLOW10',
          shippingAddress: { stateId: 'Delhi' },
          options: {}
        });

      expect(pricingResponse.status).toBe(200);
      expect(pricingResponse.body.data.subtotal).toBe(500);
      expect(pricingResponse.body.data.discount.total).toBe(50);

      // Step 4: Convert to order breakdown
      const orderItems = cartItems.map(item => ({
        product: item.product,
        quantity: item.quantity,
        price: item.product.price
      }));

      const orderResponse = await request(app)
        .post('/api/pricing/order-breakdown')
        .send({
          orderItems,
          couponCode: 'WORKFLOW10',
          shippingAddress: { stateId: 'Delhi' },
          options: {}
        });

      expect(orderResponse.status).toBe(200);
      expect(orderResponse.body.data.subtotal).toBe(500);
      expect(orderResponse.body.data.discount.total).toBe(50);
      expect(orderResponse.body.data.metadata.calculatedFor).toBe('order');
    });
  });
});
