/**
 * Review Flow Integration Tests
 * End-to-end tests for complete review workflows (AAURIKAA auto-approve)
 */

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../helpers/testApp');
const Review = require('../../models/Review');
const Product = require('../../models/Product');
const Seller = require('../../models/Seller');
const Shopper = require('../../models/Shopper');
const Admin = require('../../models/Admin');
const Order = require('../../models/Order');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const createTestShopper = async () => {
  return await Shopper.create({
    firstName: 'Test',
    lastName: 'Shopper',
    username: `testshopper${Date.now()}`,
    email: `testshopper${Date.now()}@test.com`,
    password: await bcrypt.hash('Test123!@#', 10),
    role: 'shopper'
  });
};

const createTestSeller = async () => {
  const timestamp = Date.now();
  return await Seller.create({
    firstName: 'Test',
    lastName: 'Seller',
    username: `testseller${timestamp}`,
    email: `testseller${timestamp}@test.com`,
    password: await bcrypt.hash('Test123!@#', 10),
    shopName: `Test Shop ${timestamp}`,
    shopUrl: `test-shop-${timestamp}`,
    role: 'seller',
    isApproved: true
  });
};

const createTestAdmin = async () => {
  return await Admin.create({
    name: 'Test Admin',
    username: `testadmin${Date.now()}`,
    email: `testadmin${Date.now()}@test.com`,
    password: 'Test123!@',
    role: 'admin',
    isSuperAdmin: true,
  });
};

const createTestProduct = async (options = {}) => {
  const seller = options.seller || await createTestSeller();
  return await Product.create({
    name: 'Test Product',
    sku: `SKU-${Date.now()}`,
    seller: seller._id,
    regularPrice: 100,
    stock: 10,
    status: 'published',
    approvalStatus: 'approved',
    ...options
  });
};

const createDeliveredOrder = async (shopper, product) => {
  return Order.create({
    buyer: shopper._id,
    status: 'delivered',
    totalAmount: 100,
    items: [
      {
        product: product._id,
        quantity: 1,
        price: 100,
        originalPrice: 100,
      },
    ],
  });
};

const generateToken = (user, role) => {
  return jwt.sign(
    { id: user._id, role: role },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '7d' }
  );
};

describe('Complete Review Flow Tests', () => {
  beforeEach(async () => {
    await Review.deleteMany({});
    await Product.deleteMany({});
    await Seller.deleteMany({});
    await Shopper.deleteMany({});
    await Admin.deleteMany({});
    await Order.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('TC-REV-026: Complete Shopper Review Flow', () => {
    it('should complete full review submission flow with immediate publish', async () => {
      const shopper = await createTestShopper();
      const product = await createTestProduct();
      const token = generateToken(shopper, 'shopper');
      await createDeliveredOrder(shopper, product);

      let response = await request(app)
        .get(`/api/reviews/product/${product._id.toString()}`);
      expect(response.status).toBe(200);
      expect(response.body.data.summary.reviewCount).toBe(0);

      response = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({
          productId: product._id.toString(),
          rating: 5,
          comment: 'Excellent product!'
        });
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.review.rating).toBe(5);
      expect(response.body.data.review.status).toBe('approved');
      expect(response.body.data.review.verifiedPurchase).toBe(true);
      expect(response.body.data.product.avgRating).toBe(5);
      expect(response.body.data.product.reviewCount).toBe(1);

      response = await request(app)
        .get(`/api/reviews/product/${product._id.toString()}`);
      expect(response.status).toBe(200);
      expect(response.body.data.summary.reviewCount).toBe(1);
      expect(response.body.data.customerReviews.length).toBe(1);
      expect(response.body.data.customerReviews[0].rating).toBe(5);
      expect(response.body.data.customerReviews[0].comment).toBe('Excellent product!');
      expect(response.body.data.customerReviews[0].verifiedPurchase).toBe(true);

      const updatedProduct = await Product.findById(product._id);
      expect(updatedProduct.avgRating).toBe(5);
      expect(updatedProduct.reviewCount).toBe(1);
    });

    it('should keep review approved and update aggregates on edit', async () => {
      const shopper = await createTestShopper();
      const product = await createTestProduct();
      const token = generateToken(shopper, 'shopper');
      await createDeliveredOrder(shopper, product);

      let response = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({
          productId: product._id.toString(),
          rating: 3,
          comment: 'Initial review'
        });
      expect(response.status).toBe(201);

      const review = await Review.findOne({
        product: product._id,
        'reviewer.userId': shopper._id,
        'reviewer.role': 'shopper'
      });

      response = await request(app)
        .put(`/api/reviews/${review._id.toString()}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          rating: 5,
          comment: 'Updated review'
        });
      expect(response.status).toBe(200);
      expect(response.body.data.review.rating).toBe(5);
      expect(response.body.data.review.comment).toBe('Updated review');
      expect(response.body.data.review.status).toBe('approved');
      expect(response.body.data.product.avgRating).toBe(5);

      const updatedProduct = await Product.findById(product._id);
      expect(updatedProduct.avgRating).toBe(5);
      expect(updatedProduct.reviewCount).toBe(1);
    });
  });

  describe('TC-REV-027: Complete Admin Review Flow', () => {
    it('should complete admin review creation and update flow', async () => {
      const admin = await createTestAdmin();
      const product = await createTestProduct();
      const token = generateToken(admin, 'admin');

      let response = await request(app)
        .post(`/api/reviews/admin/${product._id.toString()}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          rating: 4,
          comment: 'Initial admin review'
        });
      expect(response.status).toBe(201);
      expect(response.body.data.review.isAuthoritative).toBe(true);
      expect(response.body.data.review.reviewer.role).toBe('admin');

      response = await request(app)
        .put(`/api/reviews/admin/${product._id.toString()}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          rating: 5,
          comment: 'Updated admin review'
        });
      expect(response.status).toBe(200);
      expect(response.body.data.review.rating).toBe(5);
      expect(response.body.data.review.comment).toBe('Updated admin review');

      response = await request(app)
        .get(`/api/reviews/product/${product._id.toString()}`);
      expect(response.status).toBe(200);
      expect(response.body.data.authoritative.admin).toBeDefined();
      expect(response.body.data.authoritative.admin.comment).toBe('Updated admin review');
      expect(response.body.data.authoritative.admin.rating).toBe(5);
    });

    it('should prevent duplicate admin reviews', async () => {
      const admin = await createTestAdmin();
      const product = await createTestProduct();
      const token = generateToken(admin, 'admin');

      await request(app)
        .post(`/api/reviews/admin/${product._id.toString()}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          rating: 4,
          comment: 'First admin review'
        });

      const response = await request(app)
        .post(`/api/reviews/admin/${product._id.toString()}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          rating: 5,
          comment: 'Second admin review'
        });

      expect(response.status).toBe(200);

      const reviews = await Review.find({
        product: product._id,
        'reviewer.role': 'admin'
      });
      expect(reviews.length).toBe(1);
      expect(reviews[0].comment).toBe('Second admin review');
    });
  });

  describe('TC-REV-029: Concurrent Review Creation', () => {
    it('should handle concurrent eligible review creation with aggregates', async () => {
      const product = await createTestProduct();
      const shopper1 = await createTestShopper();
      const shopper2 = await createTestShopper();
      const token1 = generateToken(shopper1, 'shopper');
      const token2 = generateToken(shopper2, 'shopper');
      await createDeliveredOrder(shopper1, product);
      await createDeliveredOrder(shopper2, product);

      const [response1, response2] = await Promise.all([
        request(app)
          .post('/api/reviews')
          .set('Authorization', `Bearer ${token1}`)
          .send({ productId: product._id.toString(), rating: 5, comment: 'Review 1' }),
        request(app)
          .post('/api/reviews')
          .set('Authorization', `Bearer ${token2}`)
          .send({ productId: product._id.toString(), rating: 4, comment: 'Review 2' })
      ]);

      expect(response1.status).toBe(201);
      expect(response2.status).toBe(201);

      const reviews = await Review.find({ product: product._id });
      expect(reviews.length).toBe(2);
      expect(reviews.every((r) => r.status === 'approved')).toBe(true);

      const updatedProduct = await Product.findById(product._id);
      expect(updatedProduct.avgRating).toBe(4.5);
      expect(updatedProduct.reviewCount).toBe(2);
    });
  });
});
