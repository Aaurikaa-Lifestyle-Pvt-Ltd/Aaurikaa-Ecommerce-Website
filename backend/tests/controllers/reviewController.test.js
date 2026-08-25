/**
 * Review Controller Tests
 * Tests for review API endpoints
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
const { rejectReview } = require('../../services/reviewModerationService');

// AAURIKAA: eligible shopper reviews publish immediately. Seed a delivered
// order before POST /api/reviews so eligibility passes.
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

// Helper functions
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

const generateToken = (user, role) => {
  return jwt.sign(
    { id: user._id, role: role },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '7d' }
  );
};

describe('Review Controller Tests', () => {
  beforeEach(async () => {
    // Clean up database
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

  describe('POST /api/reviews - Create Customer Review', () => {
    it('TC-REV-001: should create eligible shopper review as approved and update aggregates', async () => {
      const shopper = await createTestShopper();
      const product = await createTestProduct();
      const token = generateToken(shopper, 'shopper');
      await createDeliveredOrder(shopper, product);

      const response = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({
          productId: product._id.toString(),
          rating: 5,
          comment: 'Great product!'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.review.rating).toBe(5);
      expect(response.body.data.review.status).toBe('approved');
      expect(response.body.data.review.verifiedPurchase).toBe(true);
      expect(response.body.data.review.reviewer.role).toBe('shopper');
      expect(response.body.data.product.avgRating).toBe(5);
      expect(response.body.data.product.reviewCount).toBe(1);

      const updatedProduct = await Product.findById(product._id);
      expect(updatedProduct.avgRating).toBe(5);
      expect(updatedProduct.reviewCount).toBe(1);
    });

    it('TC-REV-001b: should reject ineligible shopper review (no delivered purchase)', async () => {
      const shopper = await createTestShopper();
      const product = await createTestProduct();
      const token = generateToken(shopper, 'shopper');

      const response = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({
          productId: product._id.toString(),
          rating: 5,
          comment: 'Not a buyer'
        });

      expect(response.status).toBe(403);
      expect(await Review.countDocuments({ product: product._id })).toBe(0);
      const productAfter = await Product.findById(product._id);
      expect(productAfter.avgRating).toBe(0);
      expect(productAfter.reviewCount).toBe(0);
    });

    it('TC-REV-002: should reject review creation when not logged in', async () => {
      const product = await createTestProduct();

      const response = await request(app)
        .post('/api/reviews')
        .send({
          productId: product._id.toString(),
          rating: 5,
          comment: 'Great product!'
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toMatch(/log in|unauthorized/i);
    });

    it('TC-REV-003: should update existing review instead of creating duplicate', async () => {
      const shopper = await createTestShopper();
      const product = await createTestProduct();
      const token = generateToken(shopper, 'shopper');
      await createDeliveredOrder(shopper, product);

      // Create first review
      await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({
          productId: product._id.toString(),
          rating: 4,
          comment: 'Good product'
        });

      // Try to create duplicate
      const response = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({
          productId: product._id.toString(),
          rating: 5,
          comment: 'Updated review'
        });

      expect(response.status).toBe(200);
      
      // Verify only one review exists and stays approved
      const reviews = await Review.find({
        product: product._id,
        'reviewer.userId': shopper._id,
        'reviewer.role': 'shopper'
      });
      expect(reviews.length).toBe(1);
      expect(reviews[0].rating).toBe(5);
      expect(reviews[0].comment).toBe('Updated review');
      expect(reviews[0].status).toBe('approved');
      expect(response.body.data.product.avgRating).toBe(5);
    });

    it('TC-REV-003b: should set verifiedPurchase on create response and persisted review', async () => {
      const shopper = await createTestShopper();
      const product = await createTestProduct();
      const token = generateToken(shopper, 'shopper');
      await createDeliveredOrder(shopper, product);

      const response = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({
          productId: product._id.toString(),
          rating: 5,
          comment: 'Verified purchase review',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.review.verifiedPurchase).toBe(true);

      const savedReview = await Review.findOne({
        product: product._id,
        'reviewer.userId': shopper._id,
        'reviewer.role': 'shopper',
      });

      expect(savedReview.verifiedPurchase).toBe(true);
      expect(savedReview.orderId).toBeTruthy();
      expect(savedReview.status).toBe('approved');
    });

    it('TC-REV-003c: admin reject hides review and recomputes aggregates', async () => {
      const shopper = await createTestShopper();
      const product = await createTestProduct();
      const token = generateToken(shopper, 'shopper');
      await createDeliveredOrder(shopper, product);

      await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: product._id.toString(), rating: 5, comment: 'spam' });

      let productDoc = await Product.findById(product._id);
      expect(productDoc.reviewCount).toBe(1);

      const review = await Review.findOne({ product: product._id });
      await rejectReview(review._id, new mongoose.Types.ObjectId(), 'spam');

      productDoc = await Product.findById(product._id);
      expect(productDoc.avgRating).toBe(0);
      expect(productDoc.reviewCount).toBe(0);

      const publicRes = await request(app).get(`/api/reviews/product/${product._id}`);
      expect(publicRes.body.data.summary.reviewCount).toBe(0);
      expect(publicRes.body.data.customerReviews.length).toBe(0);
    });

    it('TC-REV-004: should reject invalid rating values', async () => {
      const shopper = await createTestShopper();
      const product = await createTestProduct();
      const token = generateToken(shopper, 'shopper');
      await createDeliveredOrder(shopper, product);

      // Test rating = 0
      const response1 = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({
          productId: product._id.toString(),
          rating: 0,
          comment: 'Test'
        });
      expect(response1.status).toBe(400);

      // Test rating = 6
      const response2 = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({
          productId: product._id.toString(),
          rating: 6,
          comment: 'Test'
        });
      expect(response2.status).toBe(400);

      // Test missing rating
      const response3 = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({
          productId: product._id.toString(),
          comment: 'Test'
        });
      expect(response3.status).toBe(400);
    });
  });

  describe('POST /api/reviews/admin/:productId - Create Admin Review', () => {
    it('TC-REV-005: should create authoritative admin review', async () => {
      const admin = await createTestAdmin();
      const product = await createTestProduct();
      const token = generateToken(admin, 'admin');

      const response = await request(app)
        .post(`/api/reviews/admin/${product._id.toString()}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          rating: 5,
          comment: 'Admin review of this product'
        });

      expect(response.status).toBe(201);
      expect(response.body.data.review.isAuthoritative).toBe(true);
      expect(response.body.data.review.reviewer.role).toBe('admin');
    });

    it('TC-REV-006: should update existing admin review instead of creating duplicate', async () => {
      const admin = await createTestAdmin();
      const product = await createTestProduct();
      const token = generateToken(admin, 'admin');

      // Create first review
      await request(app)
        .post(`/api/reviews/admin/${product._id.toString()}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          rating: 4,
          comment: 'Initial admin review'
        });

      // Try to create duplicate
      const response = await request(app)
        .post(`/api/reviews/admin/${product._id.toString()}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          rating: 5,
          comment: 'Updated admin review'
        });

      expect(response.status).toBe(200);
      
      // Verify only one admin review exists
      const reviews = await Review.find({
        product: product._id,
        'reviewer.role': 'admin'
      });
      expect(reviews.length).toBe(1);
      expect(reviews[0].comment).toBe('Updated admin review');
    });

    it('TC-REV-007: should allow editing admin review', async () => {
      const admin = await createTestAdmin();
      const product = await createTestProduct();
      const token = generateToken(admin, 'admin');

      // Create review
      await request(app)
        .post(`/api/reviews/admin/${product._id.toString()}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          rating: 4,
          comment: 'Initial review'
        });

      // Update review
      const response = await request(app)
        .put(`/api/reviews/admin/${product._id.toString()}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          rating: 5,
          comment: 'Updated review'
        });

      expect(response.status).toBe(200);
      expect(response.body.data.review.rating).toBe(5);
      expect(response.body.data.review.comment).toBe('Updated review');
    });
  });

  describe('POST /api/reviews/seller/:productId - Create Seller Review', () => {
    it('TC-REV-008: should create authoritative seller review for own product', async () => {
      const seller = await createTestSeller();
      const product = await createTestProduct({ seller: seller._id });
      const token = generateToken(seller, 'seller');

      const response = await request(app)
        .post(`/api/reviews/seller/${product._id.toString()}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          rating: 5,
          comment: "Seller's note about this product"
        });

      expect(response.status).toBe(201);
      expect(response.body.data.review.isAuthoritative).toBe(true);
      expect(response.body.data.review.reviewer.role).toBe('seller');
    });

    it('TC-REV-009: should reject seller review for other seller\'s product', async () => {
      const seller1 = await createTestSeller();
      const seller2 = await createTestSeller();
      const product = await createTestProduct({ seller: seller1._id });
      const token = generateToken(seller2, 'seller');

      const response = await request(app)
        .post(`/api/reviews/seller/${product._id.toString()}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          rating: 5,
          comment: 'Trying to review other seller\'s product'
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toMatch(/own products/i);
    });

    it('TC-REV-010: should update existing seller review instead of creating duplicate', async () => {
      const seller = await createTestSeller();
      const product = await createTestProduct({ seller: seller._id });
      const token = generateToken(seller, 'seller');

      // Create first review
      await request(app)
        .post(`/api/reviews/seller/${product._id.toString()}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          rating: 4,
          comment: 'Initial seller review'
        });

      // Try to create duplicate
      const response = await request(app)
        .post(`/api/reviews/seller/${product._id.toString()}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          rating: 5,
          comment: 'Updated seller review'
        });

      expect(response.status).toBe(200);
      
      // Verify only one seller review exists
      const reviews = await Review.find({
        product: product._id,
        'reviewer.role': 'seller'
      });
      expect(reviews.length).toBe(1);
    });
  });

  describe('GET /api/reviews/product/:productId - Get Product Reviews', () => {
    it('TC-REV-011: should return all reviews with proper structure', async () => {
      const product = await createTestProduct();
      const seller = product.seller;
      const admin = await createTestAdmin();
      const shopper1 = await createTestShopper();
      const shopper2 = await createTestShopper();

      // Create reviews
      await Review.create({
        product: product._id,
        productSku: product.sku,
        seller: seller,
        reviewer: {
          userId: seller,
          role: 'seller',
          roleModel: 'Seller',
          name: 'Test Seller'
        },
        rating: 5,
        comment: 'Seller review',
        isAuthoritative: true
      });

      await Review.create({
        product: product._id,
        productSku: product.sku,
        seller: seller,
        reviewer: {
          userId: admin._id,
          role: 'admin',
          roleModel: 'Admin',
          name: 'Test Admin'
        },
        rating: 4,
        comment: 'Admin review',
        isAuthoritative: true
      });

      await Review.create({
        product: product._id,
        productSku: product.sku,
        seller: seller,
        reviewer: {
          userId: shopper1._id,
          role: 'shopper',
          roleModel: 'Shopper',
          name: 'Test Shopper 1'
        },
        rating: 5,
        comment: 'Customer review 1'
      });

      await Review.create({
        product: product._id,
        productSku: product.sku,
        seller: seller,
        reviewer: {
          userId: shopper2._id,
          role: 'shopper',
          roleModel: 'Shopper',
          name: 'Test Shopper 2'
        },
        rating: 4,
        comment: 'Customer review 2'
      });

      const response = await request(app)
        .get(`/api/reviews/product/${product._id.toString()}`);

      expect(response.status).toBe(200);
      expect(response.body.data.authoritative.seller).toBeDefined();
      expect(response.body.data.authoritative.admin).toBeDefined();
      expect(response.body.data.customerReviews.length).toBe(2);
      expect(response.body.data.summary.avgRating).toBeGreaterThan(0);
      expect(response.body.data.summary.reviewCount).toBe(4);
    });

    it('TC-REV-012: should return approved reviews for deleted product via productSku', async () => {
      const product = await createTestProduct();
      const shopper = await createTestShopper();
      const token = generateToken(shopper, 'shopper');
      await createDeliveredOrder(shopper, product);

      // Create review (auto-approved when eligible)
      await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({
          productId: product._id.toString(),
          rating: 5,
          comment: 'Review before deletion'
        });

      const productSku = product.sku;

      // Delete product
      await Product.findByIdAndDelete(product._id);

      // Try to get reviews
      const response = await request(app)
        .get(`/api/reviews/product/${product._id.toString()}?sku=${productSku}`);

      expect(response.status).toBe(200);
      expect(response.body.data.productDeleted).toBe(true);
      expect(response.body.data.customerReviews.length).toBeGreaterThan(0);
      expect(response.body.data.customerReviews[0].verifiedPurchase).toBe(true);
    });
  });

  describe('GET /api/reviews/seller/:sellerId - Get Seller Reviews', () => {
    it('TC-REV-013: should return seller rating aggregation (only approved counts)', async () => {
      const seller = await createTestSeller();
      const product1 = await createTestProduct({ seller: seller._id });
      const product2 = await createTestProduct({ seller: seller._id });
      const shopper = await createTestShopper();
      const token = generateToken(shopper, 'shopper');
      await createDeliveredOrder(shopper, product1);
      await createDeliveredOrder(shopper, product2);

      // Create reviews for seller's products (auto-approved)
      await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({
          productId: product1._id.toString(),
          rating: 5,
          comment: 'Review 1'
        });

      await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({
          productId: product2._id.toString(),
          rating: 4,
          comment: 'Review 2'
        });

      const response = await request(app)
        .get(`/api/reviews/seller/${seller._id.toString()}`);

      expect(response.status).toBe(200);
      expect(response.body.data.seller.avgRating).toBe(4.5);
      expect(response.body.data.seller.reviewCount).toBe(2);
    });
  });
});

