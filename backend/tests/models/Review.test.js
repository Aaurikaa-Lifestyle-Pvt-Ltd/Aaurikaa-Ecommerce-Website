/**
 * Review Model Tests
 * Tests for Review model validation and constraints
 */

const mongoose = require('mongoose');
const Review = require('../../models/Review');
const Product = require('../../models/Product');
const Seller = require('../../models/Seller');
const Shopper = require('../../models/Shopper');
const Admin = require('../../models/Admin');

// Helper functions
const createTestShopper = async () => {
  return await Shopper.create({
    firstName: 'Test',
    lastName: 'Shopper',
    username: `testshopper${Date.now()}`,
    email: `testshopper${Date.now()}@test.com`,
    password: 'hashedpassword',
    role: 'shopper'
  });
};

const createTestSeller = async () => {
  return await Seller.create({
    firstName: 'Test',
    lastName: 'Seller',
    username: `testseller${Date.now()}`,
    email: `testseller${Date.now()}@test.com`,
    password: 'hashedpassword',
    shopName: 'Test Shop',
    role: 'seller',
    isApproved: true
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

describe('Review Model Validation', () => {
  beforeEach(async () => {
    await Review.deleteMany({});
    await Product.deleteMany({});
    await Seller.deleteMany({});
    await Shopper.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('TC-REV-014: Schema Validation', () => {
    it('should require all mandatory fields', async () => {
      const review = new Review({});
      
      await expect(review.save()).rejects.toThrow();
    });

    it('should validate rating range (1-5)', async () => {
      const product = await createTestProduct();
      const shopper = await createTestShopper();

      // Test rating = 0
      const review1 = new Review({
        product: product._id,
        productSku: product.sku,
        seller: product.seller,
        reviewer: {
          userId: shopper._id,
          role: 'shopper',
          roleModel: 'Shopper'
        },
        rating: 0  // Invalid
      });
      await expect(review1.save()).rejects.toThrow();

      // Test rating = 6
      const review2 = new Review({
        product: product._id,
        productSku: product.sku,
        seller: product.seller,
        reviewer: {
          userId: shopper._id,
          role: 'shopper',
          roleModel: 'Shopper'
        },
        rating: 6  // Invalid
      });
      await expect(review2.save()).rejects.toThrow();

      // Test valid rating
      const review3 = new Review({
        product: product._id,
        productSku: product.sku,
        seller: product.seller,
        reviewer: {
          userId: shopper._id,
          role: 'shopper',
          roleModel: 'Shopper'
        },
        rating: 5  // Valid
      });
      await expect(review3.save()).resolves.toBeDefined();
    });

    it('should validate role enum', async () => {
      const product = await createTestProduct();
      const shopper = await createTestShopper();

      const review = new Review({
        product: product._id,
        productSku: product.sku,
        seller: product.seller,
        reviewer: {
          userId: shopper._id,
          role: 'invalid_role',  // Invalid
          roleModel: 'Shopper'
        },
        rating: 5
      });

      await expect(review.save()).rejects.toThrow();
    });

    it('should require product reference', async () => {
      const shopper = await createTestShopper();
      const seller = await createTestSeller();

      const review = new Review({
        productSku: 'SKU-123',
        seller: seller._id,
        reviewer: {
          userId: shopper._id,
          role: 'shopper',
          roleModel: 'Shopper'
        },
        rating: 5
      });

      await expect(review.save()).rejects.toThrow();
    });

    it('should require productSku for persistence', async () => {
      const product = await createTestProduct();
      const shopper = await createTestShopper();

      const review = new Review({
        product: product._id,
        seller: product.seller,
        reviewer: {
          userId: shopper._id,
          role: 'shopper',
          roleModel: 'Shopper'
        },
        rating: 5
      });

      await expect(review.save()).rejects.toThrow();
    });
  });

  describe('TC-REV-015: Unique Constraint', () => {
    it('should enforce unique constraint (product, userId, role)', async () => {
      const product = await createTestProduct();
      const shopper = await createTestShopper();

      // Create first review
      const review1 = new Review({
        product: product._id,
        productSku: product.sku,
        seller: product.seller,
        reviewer: {
          userId: shopper._id,
          role: 'shopper',
          roleModel: 'Shopper',
          name: 'Test Shopper'
        },
        rating: 5,
        comment: 'First review'
      });
      await review1.save();

      // Try to create duplicate
      const review2 = new Review({
        product: product._id,
        productSku: product.sku,
        seller: product.seller,
        reviewer: {
          userId: shopper._id,
          role: 'shopper',
          roleModel: 'Shopper',
          name: 'Test Shopper'
        },
        rating: 4,
        comment: 'Duplicate review'
      });

      await expect(review2.save()).rejects.toThrow(/duplicate key/i);
    });

    it('should allow multiple reviews from different users', async () => {
      const product = await createTestProduct();
      const shopper1 = await createTestShopper();
      const shopper2 = await createTestShopper();

      // Create review from shopper1
      const review1 = new Review({
        product: product._id,
        productSku: product.sku,
        seller: product.seller,
        reviewer: {
          userId: shopper1._id,
          role: 'shopper',
          roleModel: 'Shopper',
          name: 'Shopper 1'
        },
        rating: 5
      });
      await review1.save();

      // Create review from shopper2 (should succeed)
      const review2 = new Review({
        product: product._id,
        productSku: product.sku,
        seller: product.seller,
        reviewer: {
          userId: shopper2._id,
          role: 'shopper',
          roleModel: 'Shopper',
          name: 'Shopper 2'
        },
        rating: 4
      });
      await expect(review2.save()).resolves.toBeDefined();

      // Verify both reviews exist
      const reviews = await Review.find({ product: product._id });
      expect(reviews.length).toBe(2);
    });

    it('should allow different roles to review same product', async () => {
      const product = await createTestProduct();
      const seller = await Seller.findById(product.seller);
      const shopper = await createTestShopper();
      const bcrypt = require('bcryptjs');
      const admin = await Admin.create({
        name: 'Test Admin',
        username: `testadmin${Date.now()}`,
        email: `testadmin${Date.now()}@test.com`,
        password: await bcrypt.hash('Test123!@#', 10),
        role: 'admin'
      });

      // Create shopper review
      const review1 = new Review({
        product: product._id,
        productSku: product.sku,
        seller: product.seller,
        reviewer: {
          userId: shopper._id,
          role: 'shopper',
          roleModel: 'Shopper',
          name: 'Test Shopper'
        },
        rating: 5
      });
      await review1.save();

      // Create seller review (should succeed)
      const review2 = new Review({
        product: product._id,
        productSku: product.sku,
        seller: product.seller,
        reviewer: {
          userId: seller._id,
          role: 'seller',
          roleModel: 'Seller',
          name: 'Test Seller'
        },
        rating: 5,
        isAuthoritative: true
      });
      await expect(review2.save()).resolves.toBeDefined();

      // Create admin review (should succeed)
      const review3 = new Review({
        product: product._id,
        productSku: product.sku,
        seller: product.seller,
        reviewer: {
          userId: admin._id,
          role: 'admin',
          roleModel: 'Admin',
          name: 'Test Admin'
        },
        rating: 4,
        isAuthoritative: true
      });
      await expect(review3.save()).resolves.toBeDefined();

      // Verify all three reviews exist
      const reviews = await Review.find({ product: product._id });
      expect(reviews.length).toBe(3);
    });
  });

  describe('Default Values', () => {
    it('should set default status to approved', async () => {
      const product = await createTestProduct();
      const shopper = await createTestShopper();

      const review = new Review({
        product: product._id,
        productSku: product.sku,
        seller: product.seller,
        reviewer: {
          userId: shopper._id,
          role: 'shopper',
          roleModel: 'Shopper'
        },
        rating: 5
      });
      await review.save();

      expect(review.status).toBe('approved');
    });

    it('should set default isAuthoritative to false for shopper reviews', async () => {
      const product = await createTestProduct();
      const shopper = await createTestShopper();

      const review = new Review({
        product: product._id,
        productSku: product.sku,
        seller: product.seller,
        reviewer: {
          userId: shopper._id,
          role: 'shopper',
          roleModel: 'Shopper'
        },
        rating: 5
      });
      await review.save();

      expect(review.isAuthoritative).toBe(false);
    });

    it('should set isAuthoritative to true for seller/admin reviews', async () => {
      const product = await createTestProduct();
      const seller = await Seller.findById(product.seller);

      const review = new Review({
        product: product._id,
        productSku: product.sku,
        seller: product.seller,
        reviewer: {
          userId: seller._id,
          role: 'seller',
          roleModel: 'Seller'
        },
        rating: 5,
        isAuthoritative: true
      });
      await review.save();

      expect(review.isAuthoritative).toBe(true);
    });

    it('should default moderation metadata fields to null', async () => {
      const product = await createTestProduct();
      const shopper = await createTestShopper();

      const review = new Review({
        product: product._id,
        productSku: product.sku,
        seller: product.seller,
        reviewer: {
          userId: shopper._id,
          role: 'shopper',
          roleModel: 'Shopper'
        },
        rating: 5
      });
      await review.save();

      expect(review.moderatedBy).toBeNull();
      expect(review.moderatedAt).toBeNull();
      expect(review.rejectionReason).toBeNull();
    });
  });

  describe('Moderation Status Enum', () => {
    it('accepts pending / approved / rejected and rejects others', async () => {
      const product = await createTestProduct();
      const shopper = await createTestShopper();

      for (const status of ['pending', 'approved', 'rejected']) {
        const r = new Review({
          product: product._id,
          productSku: product.sku,
          seller: product.seller,
          reviewer: {
            userId: shopper._id,
            role: 'shopper',
            roleModel: 'Shopper'
          },
          rating: 5,
          status
        });
        // toggle comment so we don't collide on the unique index when validating
        r.comment = `s-${status}`;
        const err = r.validateSync();
        expect(err?.errors?.status).toBeUndefined();
      }

      const invalid = new Review({
        product: product._id,
        productSku: product.sku,
        seller: product.seller,
        reviewer: {
          userId: shopper._id,
          role: 'shopper',
          roleModel: 'Shopper'
        },
        rating: 5,
        status: 'unknown'
      });
      const err = invalid.validateSync();
      expect(err?.errors?.status).toBeDefined();
    });
  });

  describe('Moderation Metadata Persistence', () => {
    it('persists moderatedBy / moderatedAt / rejectionReason when set', async () => {
      const product = await createTestProduct();
      const shopper = await createTestShopper();
      const adminId = new mongoose.Types.ObjectId();
      const now = new Date();

      const review = new Review({
        product: product._id,
        productSku: product.sku,
        seller: product.seller,
        reviewer: {
          userId: shopper._id,
          role: 'shopper',
          roleModel: 'Shopper'
        },
        rating: 1,
        status: 'rejected',
        moderatedBy: adminId,
        moderatedAt: now,
        rejectionReason: 'Inappropriate content'
      });
      await review.save();

      const reloaded = await Review.findById(review._id);
      expect(String(reloaded.moderatedBy)).toBe(String(adminId));
      expect(reloaded.moderatedAt.toISOString()).toBe(now.toISOString());
      expect(reloaded.rejectionReason).toBe('Inappropriate content');
    });

    it('enforces rejectionReason maxlength = 500', async () => {
      const product = await createTestProduct();
      const shopper = await createTestShopper();

      const review = new Review({
        product: product._id,
        productSku: product.sku,
        seller: product.seller,
        reviewer: {
          userId: shopper._id,
          role: 'shopper',
          roleModel: 'Shopper'
        },
        rating: 1,
        status: 'rejected',
        rejectionReason: 'x'.repeat(501)
      });

      const err = review.validateSync();
      expect(err?.errors?.rejectionReason).toBeDefined();
    });
  });
});

