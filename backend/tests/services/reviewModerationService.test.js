/**
 * Review Moderation Service Tests
 *
 * Unit-level coverage for backend/services/reviewModerationService.js:
 *  - approve / reject state transitions
 *  - moderation metadata persistence
 *  - input validation (adminId, rejectionReason)
 *  - aggregate recompute via updateRatings()
 *  - blocked transitions (approved->approve, rejected->reject)
 */

const mongoose = require('mongoose');
const Review = require('../../models/Review');
const Product = require('../../models/Product');
const Seller = require('../../models/Seller');
const Shopper = require('../../models/Shopper');
const {
  approveReview,
  rejectReview,
  ModerationError,
  MAX_REJECTION_REASON_LENGTH,
} = require('../../services/reviewModerationService');

const createShopper = async () =>
  Shopper.create({
    firstName: 'Mod',
    lastName: 'Shopper',
    username: `modshopper${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    email: `modshopper${Date.now()}${Math.random().toString(36).slice(2, 6)}@test.com`,
    password: 'hashedpassword',
    role: 'shopper',
  });

const createSeller = async () => {
  const t = Date.now() + Math.floor(Math.random() * 1000);
  return Seller.create({
    firstName: 'Mod',
    lastName: 'Seller',
    username: `modseller${t}`,
    email: `modseller${t}@test.com`,
    password: 'hashedpassword',
    shopName: `Mod Shop ${t}`,
    shopUrl: `mod-shop-${t}`,
    role: 'seller',
    isApproved: true,
  });
};

const createProduct = async (overrides = {}) => {
  const seller = overrides.seller || (await createSeller());
  return Product.create({
    name: 'Moderation Test Product',
    sku: `MOD-SKU-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    seller: seller._id,
    regularPrice: 100,
    stock: 10,
    status: 'published',
    approvalStatus: 'approved',
    ...overrides,
  });
};

const createShopperReview = async (product, shopper, { rating = 5, status = 'pending' } = {}) =>
  Review.create({
    product: product._id,
    productSku: product.sku,
    seller: product.seller,
    reviewer: {
      userId: shopper._id,
      role: 'shopper',
      roleModel: 'Shopper',
      name: 'Mod Shopper',
    },
    rating,
    comment: 'Moderation test review',
    isAuthoritative: false,
    status,
  });

describe('Review Moderation Service', () => {
  let adminId;

  beforeEach(async () => {
    await Review.deleteMany({});
    await Product.deleteMany({});
    await Seller.deleteMany({});
    await Shopper.deleteMany({});
    adminId = new mongoose.Types.ObjectId();
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('approveReview', () => {
    it('transitions pending -> approved and stamps moderation metadata', async () => {
      const shopper = await createShopper();
      const product = await createProduct();
      const review = await createShopperReview(product, shopper, { rating: 4 });

      const updated = await approveReview(review._id, adminId);

      expect(updated.status).toBe('approved');
      expect(String(updated.moderatedBy)).toBe(String(adminId));
      expect(updated.moderatedAt).toBeInstanceOf(Date);
      expect(updated.rejectionReason).toBeNull();
    });

    it('restores rejected -> approved and clears rejectionReason', async () => {
      const shopper = await createShopper();
      const product = await createProduct();
      const review = await createShopperReview(product, shopper, { rating: 3, status: 'rejected' });
      review.rejectionReason = 'Off-topic';
      await review.save();

      const updated = await approveReview(review._id, adminId);

      expect(updated.status).toBe('approved');
      expect(updated.rejectionReason).toBeNull();
    });

    it('blocks approved -> approve with INVALID_STATE_TRANSITION 400', async () => {
      const shopper = await createShopper();
      const product = await createProduct();
      const review = await createShopperReview(product, shopper, { status: 'approved' });

      await expect(approveReview(review._id, adminId)).rejects.toMatchObject({
        name: 'ModerationError',
        code: 'INVALID_STATE_TRANSITION',
        statusCode: 400,
      });
    });

    it('throws 404 REVIEW_NOT_FOUND for non-existent review id', async () => {
      const fake = new mongoose.Types.ObjectId();
      await expect(approveReview(fake, adminId)).rejects.toMatchObject({
        name: 'ModerationError',
        code: 'REVIEW_NOT_FOUND',
        statusCode: 404,
      });
    });

    it('throws 400 INVALID_INPUT when adminId is missing', async () => {
      const shopper = await createShopper();
      const product = await createProduct();
      const review = await createShopperReview(product, shopper);

      await expect(approveReview(review._id, null)).rejects.toMatchObject({
        name: 'ModerationError',
        code: 'INVALID_INPUT',
        statusCode: 400,
      });
    });

    it('triggers updateRatings: Product.avgRating / reviewCount increment on approval', async () => {
      const shopper = await createShopper();
      const product = await createProduct();
      const review = await createShopperReview(product, shopper, { rating: 4 });

      const before = await Product.findById(product._id);
      expect(before.avgRating).toBe(0);
      expect(before.reviewCount).toBe(0);

      await approveReview(review._id, adminId);

      const after = await Product.findById(product._id);
      expect(after.avgRating).toBe(4);
      expect(after.reviewCount).toBe(1);
    });

    it('triggers updateRatings: Seller aggregates update on approval', async () => {
      const seller = await createSeller();
      const product = await createProduct({ seller: seller._id });
      const shopper = await createShopper();
      const review = await createShopperReview(product, shopper, { rating: 5 });

      await approveReview(review._id, adminId);

      const after = await Seller.findById(seller._id);
      expect(after.avgRating).toBe(5);
      expect(after.reviewCount).toBe(1);
      expect(after.ratingBreakdown.fiveStar).toBe(1);
    });
  });

  describe('rejectReview', () => {
    it('transitions pending -> rejected and stores rejection reason and moderator', async () => {
      const shopper = await createShopper();
      const product = await createProduct();
      const review = await createShopperReview(product, shopper);

      const updated = await rejectReview(review._id, adminId, '  spam content  ');

      expect(updated.status).toBe('rejected');
      expect(updated.rejectionReason).toBe('spam content');
      expect(String(updated.moderatedBy)).toBe(String(adminId));
      expect(updated.moderatedAt).toBeInstanceOf(Date);
    });

    it('transitions approved -> rejected and decrements aggregates', async () => {
      const seller = await createSeller();
      const product = await createProduct({ seller: seller._id });
      const shopper = await createShopper();
      const review = await createShopperReview(product, shopper, { rating: 5, status: 'approved' });
      // Seed aggregates as if previously approved through the service
      await Product.findByIdAndUpdate(product._id, { avgRating: 5, reviewCount: 1 });
      await Seller.findByIdAndUpdate(seller._id, {
        avgRating: 5,
        reviewCount: 1,
        ratingBreakdown: { fiveStar: 1, fourStar: 0, threeStar: 0, twoStar: 0, oneStar: 0 },
      });

      await rejectReview(review._id, adminId, 'Misleading');

      const afterProduct = await Product.findById(product._id);
      const afterSeller = await Seller.findById(seller._id);
      expect(afterProduct.avgRating).toBe(0);
      expect(afterProduct.reviewCount).toBe(0);
      expect(afterSeller.avgRating).toBe(0);
      expect(afterSeller.reviewCount).toBe(0);
      expect(afterSeller.ratingBreakdown.fiveStar).toBe(0);
    });

    it('accepts null / empty rejectionReason and normalizes to null', async () => {
      const shopper = await createShopper();
      const product = await createProduct();
      const review = await createShopperReview(product, shopper);

      const updated = await rejectReview(review._id, adminId, null);

      expect(updated.status).toBe('rejected');
      expect(updated.rejectionReason).toBeNull();
    });

    it('blocks rejected -> reject with INVALID_STATE_TRANSITION 400', async () => {
      const shopper = await createShopper();
      const product = await createProduct();
      const review = await createShopperReview(product, shopper, { status: 'rejected' });

      await expect(rejectReview(review._id, adminId, 'duplicate')).rejects.toMatchObject({
        name: 'ModerationError',
        code: 'INVALID_STATE_TRANSITION',
        statusCode: 400,
      });
    });

    it('throws 404 REVIEW_NOT_FOUND for non-existent review id', async () => {
      const fake = new mongoose.Types.ObjectId();
      await expect(rejectReview(fake, adminId, 'reason')).rejects.toMatchObject({
        code: 'REVIEW_NOT_FOUND',
        statusCode: 404,
      });
    });

    it('rejects non-string rejectionReason with 400 INVALID_INPUT', async () => {
      const shopper = await createShopper();
      const product = await createProduct();
      const review = await createShopperReview(product, shopper);

      await expect(rejectReview(review._id, adminId, { not: 'a string' })).rejects.toMatchObject({
        code: 'INVALID_INPUT',
        statusCode: 400,
      });
    });

    it(`rejects rejectionReason longer than ${MAX_REJECTION_REASON_LENGTH} chars`, async () => {
      const shopper = await createShopper();
      const product = await createProduct();
      const review = await createShopperReview(product, shopper);

      const tooLong = 'x'.repeat(MAX_REJECTION_REASON_LENGTH + 1);
      await expect(rejectReview(review._id, adminId, tooLong)).rejects.toMatchObject({
        code: 'INVALID_INPUT',
        statusCode: 400,
      });
    });
  });

  describe('Combined approve/reject cycles', () => {
    it('approve -> reject -> approve keeps aggregates correct at every step', async () => {
      const seller = await createSeller();
      const product = await createProduct({ seller: seller._id });
      const shopper = await createShopper();
      const review = await createShopperReview(product, shopper, { rating: 5 });

      await approveReview(review._id, adminId);
      let p = await Product.findById(product._id);
      expect(p.avgRating).toBe(5);
      expect(p.reviewCount).toBe(1);

      await rejectReview(review._id, adminId, 'reconsidered');
      p = await Product.findById(product._id);
      expect(p.avgRating).toBe(0);
      expect(p.reviewCount).toBe(0);

      await approveReview(review._id, adminId);
      p = await Product.findById(product._id);
      expect(p.avgRating).toBe(5);
      expect(p.reviewCount).toBe(1);

      const after = await Review.findById(review._id);
      expect(after.status).toBe('approved');
      expect(after.rejectionReason).toBeNull();
    });

    it('ModerationError is exported and instanceof check works', async () => {
      const shopper = await createShopper();
      const product = await createProduct();
      const review = await createShopperReview(product, shopper, { status: 'approved' });

      try {
        await approveReview(review._id, adminId);
        throw new Error('expected ModerationError');
      } catch (err) {
        expect(err).toBeInstanceOf(ModerationError);
      }
    });
  });

  describe('Governance: only shopper reviews are moderatable', () => {
    const createAuthoritativeReview = async ({ product, reviewerId, role }) =>
      Review.create({
        product: product._id,
        productSku: product.sku,
        seller: product.seller,
        reviewer: {
          userId: reviewerId,
          role,
          roleModel: role === 'seller' ? 'Seller' : 'Admin',
          name: `Auth ${role}`,
        },
        rating: 5,
        comment: 'Authoritative endorsement',
        isAuthoritative: true,
        status: 'approved',
      });

    it('blocks approveReview on a seller authoritative review with NOT_MODERATABLE 400', async () => {
      const seller = await createSeller();
      const product = await createProduct({ seller: seller._id });
      const review = await createAuthoritativeReview({
        product,
        reviewerId: seller._id,
        role: 'seller',
      });

      // Seed product aggregates to verify they are not touched on failure.
      await Product.findByIdAndUpdate(product._id, { avgRating: 4, reviewCount: 1 });

      await expect(approveReview(review._id, adminId)).rejects.toMatchObject({
        name: 'ModerationError',
        code: 'NOT_MODERATABLE',
        statusCode: 400,
      });

      const after = await Review.findById(review._id);
      expect(after.status).toBe('approved');
      expect(after.moderatedBy).toBeNull();
      expect(after.moderatedAt).toBeNull();

      const productAfter = await Product.findById(product._id);
      expect(productAfter.avgRating).toBe(4);
      expect(productAfter.reviewCount).toBe(1);
    });

    it('blocks rejectReview on a seller authoritative review and does not change aggregates', async () => {
      const seller = await createSeller();
      const product = await createProduct({ seller: seller._id });
      const review = await createAuthoritativeReview({
        product,
        reviewerId: seller._id,
        role: 'seller',
      });
      await Product.findByIdAndUpdate(product._id, { avgRating: 5, reviewCount: 1 });

      await expect(
        rejectReview(review._id, adminId, 'attempted reject')
      ).rejects.toMatchObject({
        code: 'NOT_MODERATABLE',
        statusCode: 400,
      });

      const after = await Review.findById(review._id);
      expect(after.status).toBe('approved');
      expect(after.rejectionReason).toBeNull();

      const productAfter = await Product.findById(product._id);
      expect(productAfter.avgRating).toBe(5);
      expect(productAfter.reviewCount).toBe(1);
    });

    it('blocks approveReview on an admin authoritative review with NOT_MODERATABLE 400', async () => {
      // The Review.reviewer.userId ref is advisory; a synthetic ObjectId is enough
      // for the moderation service to read reviewer.role from the Review doc.
      const adminReviewerId = new mongoose.Types.ObjectId();
      const product = await createProduct();
      const review = await createAuthoritativeReview({
        product,
        reviewerId: adminReviewerId,
        role: 'admin',
      });

      await expect(approveReview(review._id, adminId)).rejects.toMatchObject({
        code: 'NOT_MODERATABLE',
        statusCode: 400,
      });

      const after = await Review.findById(review._id);
      expect(after.status).toBe('approved');
    });

    it('blocks rejectReview on an admin authoritative review and does not mutate status/metadata', async () => {
      const adminReviewerId = new mongoose.Types.ObjectId();
      const product = await createProduct();
      const review = await createAuthoritativeReview({
        product,
        reviewerId: adminReviewerId,
        role: 'admin',
      });

      await expect(
        rejectReview(review._id, adminId, 'admin abuse')
      ).rejects.toMatchObject({
        code: 'NOT_MODERATABLE',
        statusCode: 400,
      });

      const after = await Review.findById(review._id);
      expect(after.status).toBe('approved');
      expect(after.rejectionReason).toBeNull();
      expect(after.moderatedBy).toBeNull();
      expect(after.moderatedAt).toBeNull();
    });

    it('still allows shopper reviews to be moderated normally', async () => {
      const shopper = await createShopper();
      const product = await createProduct();
      const review = await createShopperReview(product, shopper, { rating: 4 });

      const updated = await approveReview(review._id, adminId);
      expect(updated.status).toBe('approved');
      expect(String(updated.moderatedBy)).toBe(String(adminId));
    });
  });
});
