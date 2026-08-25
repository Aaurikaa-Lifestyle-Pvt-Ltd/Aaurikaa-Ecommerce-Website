/**
 * Admin Review Moderation HTTP Tests
 *
 * Endpoint coverage:
 *  - GET /api/reviews/admin             (filters, pagination, counts)
 *  - PATCH /api/reviews/admin/:id/approve
 *  - PATCH /api/reviews/admin/:id/reject
 *
 * Verifies:
 *  - admin authentication / authorization
 *  - moderation metadata persisted in response and DB
 *  - rejectionReason validation
 *  - blocked transitions surface as 400
 *  - rating aggregates recompute on transition
 *  - counts stability across status tabs
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = require('../helpers/testApp');
const Review = require('../../models/Review');
const Product = require('../../models/Product');
const Seller = require('../../models/Seller');
const Shopper = require('../../models/Shopper');
const Admin = require('../../models/Admin');

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const sign = (user, role) =>
  jwt.sign({ id: user._id, role }, JWT_SECRET, { expiresIn: '7d' });

const createAdmin = async () => {
  const t = Date.now() + Math.floor(Math.random() * 1e6);
  return Admin.create({
    name: 'Mod Admin',
    username: `modadmin${t}`,
    email: `modadmin${t}@test.com`,
    password: 'Test123!@',
    role: 'admin',
    isSuperAdmin: true,
  });
};

const createShopper = async () => {
  const t = Date.now() + Math.floor(Math.random() * 1e6);
  return Shopper.create({
    firstName: 'Mod',
    lastName: 'Shopper',
    username: `modshopper${t}`,
    email: `modshopper${t}@test.com`,
    password: await bcrypt.hash('Test123!@#', 10),
    role: 'shopper',
  });
};

const createSeller = async () => {
  const t = Date.now() + Math.floor(Math.random() * 1e6);
  return Seller.create({
    firstName: 'Mod',
    lastName: 'Seller',
    username: `modseller${t}`,
    email: `modseller${t}@test.com`,
    password: await bcrypt.hash('Test123!@#', 10),
    shopName: `Mod Shop ${t}`,
    shopUrl: `mod-shop-${t}`,
    role: 'seller',
    isApproved: true,
  });
};

const createProduct = async (overrides = {}) => {
  const seller = overrides.seller || (await createSeller());
  return Product.create({
    name: 'Moderation Product',
    sku: `MODP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    seller: seller._id,
    regularPrice: 100,
    stock: 10,
    status: 'published',
    approvalStatus: 'approved',
    ...overrides,
  });
};

const createShopperReview = async (product, shopper, overrides = {}) =>
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
    rating: 5,
    comment: 'Default mod review',
    isAuthoritative: false,
    status: 'pending',
    ...overrides,
  });

const createAuthoritativeReview = async (product, userId, role, overrides = {}) =>
  Review.create({
    product: product._id,
    productSku: product.sku,
    seller: product.seller,
    reviewer: {
      userId,
      role,
      roleModel: role === 'seller' ? 'Seller' : 'Admin',
      name: `Auth ${role}`,
    },
    rating: 5,
    comment: `Authoritative ${role} review`,
    isAuthoritative: true,
    status: 'approved',
    ...overrides,
  });

describe('Admin Review Moderation HTTP', () => {
  beforeEach(async () => {
    await Review.deleteMany({});
    await Product.deleteMany({});
    await Seller.deleteMany({});
    await Shopper.deleteMany({});
    await Admin.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  /* ----------------------------------------------------------------------- *
   *                        GET /api/reviews/admin                           *
   * ----------------------------------------------------------------------- */
  describe('GET /api/reviews/admin', () => {
    it('rejects unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/reviews/admin');
      expect(res.status).toBe(401);
    });

    it('rejects non-admin tokens with 403', async () => {
      const shopper = await createShopper();
      const res = await request(app)
        .get('/api/reviews/admin')
        .set('Authorization', `Bearer ${sign(shopper, 'shopper')}`);
      expect(res.status).toBe(403);
    });

    it('returns pending reviews by default with pagination metadata', async () => {
      const admin = await createAdmin();
      const shopper = await createShopper();
      const product = await createProduct();
      await createShopperReview(product, shopper, { rating: 5, comment: 'p1' });

      const res = await request(app)
        .get('/api/reviews/admin')
        .set('Authorization', `Bearer ${sign(admin, 'admin')}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reviews.length).toBe(1);
      expect(res.body.data.reviews[0].status).toBe('pending');
      expect(res.body.data.pagination).toMatchObject({ page: 1, limit: 20, total: 1 });
      expect(res.body.data.counts).toMatchObject({
        pending: 1,
        approved: 0,
        rejected: 0,
        total: 1,
      });
    });

    it('filters by status (approved / rejected / all)', async () => {
      const admin = await createAdmin();
      const product = await createProduct();
      const s1 = await createShopper();
      const s2 = await createShopper();
      const s3 = await createShopper();
      await createShopperReview(product, s1, { status: 'pending', rating: 4 });
      await createShopperReview(product, s2, { status: 'approved', rating: 5 });
      await createShopperReview(product, s3, { status: 'rejected', rating: 2 });

      const token = sign(admin, 'admin');

      const approved = await request(app)
        .get('/api/reviews/admin?status=approved')
        .set('Authorization', `Bearer ${token}`);
      expect(approved.status).toBe(200);
      expect(approved.body.data.reviews.length).toBe(1);
      expect(approved.body.data.reviews[0].status).toBe('approved');

      const rejected = await request(app)
        .get('/api/reviews/admin?status=rejected')
        .set('Authorization', `Bearer ${token}`);
      expect(rejected.body.data.reviews.length).toBe(1);

      const all = await request(app)
        .get('/api/reviews/admin?status=all')
        .set('Authorization', `Bearer ${token}`);
      expect(all.body.data.reviews.length).toBe(3);
      expect(all.body.data.counts).toMatchObject({
        pending: 1,
        approved: 1,
        rejected: 1,
        total: 3,
      });
    });

    it('keeps counts stable across status tabs (counts exclude status filter)', async () => {
      const admin = await createAdmin();
      const product = await createProduct();
      const s1 = await createShopper();
      const s2 = await createShopper();
      const s3 = await createShopper();
      await createShopperReview(product, s1, { status: 'pending' });
      await createShopperReview(product, s2, { status: 'approved' });
      await createShopperReview(product, s3, { status: 'rejected' });

      const token = sign(admin, 'admin');

      const a = await request(app)
        .get('/api/reviews/admin?status=pending')
        .set('Authorization', `Bearer ${token}`);
      const b = await request(app)
        .get('/api/reviews/admin?status=approved')
        .set('Authorization', `Bearer ${token}`);
      const c = await request(app)
        .get('/api/reviews/admin?status=rejected')
        .set('Authorization', `Bearer ${token}`);

      const expected = { pending: 1, approved: 1, rejected: 1, total: 3 };
      expect(a.body.data.counts).toMatchObject(expected);
      expect(b.body.data.counts).toMatchObject(expected);
      expect(c.body.data.counts).toMatchObject(expected);
    });

    it('filters by productId and rejects invalid productId with 400', async () => {
      const admin = await createAdmin();
      const productA = await createProduct();
      const productB = await createProduct();
      const shopper = await createShopper();
      const shopper2 = await createShopper();
      await createShopperReview(productA, shopper);
      await createShopperReview(productB, shopper2);

      const token = sign(admin, 'admin');

      const okRes = await request(app)
        .get(`/api/reviews/admin?productId=${productA._id.toString()}`)
        .set('Authorization', `Bearer ${token}`);
      expect(okRes.status).toBe(200);
      expect(okRes.body.data.reviews.length).toBe(1);
      expect(String(okRes.body.data.reviews[0].product._id || okRes.body.data.reviews[0].product))
        .toBe(productA._id.toString());

      const badRes = await request(app)
        .get('/api/reviews/admin?productId=not-an-objectid')
        .set('Authorization', `Bearer ${token}`);
      expect(badRes.status).toBe(400);
    });

    it('filters by sellerId', async () => {
      const admin = await createAdmin();
      const sellerA = await createSeller();
      const sellerB = await createSeller();
      const productA = await createProduct({ seller: sellerA._id });
      const productB = await createProduct({ seller: sellerB._id });
      const s1 = await createShopper();
      const s2 = await createShopper();
      await createShopperReview(productA, s1);
      await createShopperReview(productB, s2);

      const res = await request(app)
        .get(`/api/reviews/admin?sellerId=${sellerA._id.toString()}`)
        .set('Authorization', `Bearer ${sign(admin, 'admin')}`);

      expect(res.status).toBe(200);
      expect(res.body.data.reviews.length).toBe(1);
    });

    it('paginates results (page + limit)', async () => {
      const admin = await createAdmin();
      const product = await createProduct();
      for (let i = 0; i < 5; i += 1) {
        const s = await createShopper();
        await createShopperReview(product, s, { rating: (i % 5) + 1 });
      }

      const token = sign(admin, 'admin');

      const page1 = await request(app)
        .get('/api/reviews/admin?limit=2&page=1')
        .set('Authorization', `Bearer ${token}`);
      const page2 = await request(app)
        .get('/api/reviews/admin?limit=2&page=2')
        .set('Authorization', `Bearer ${token}`);
      const page3 = await request(app)
        .get('/api/reviews/admin?limit=2&page=3')
        .set('Authorization', `Bearer ${token}`);

      expect(page1.body.data.reviews.length).toBe(2);
      expect(page2.body.data.reviews.length).toBe(2);
      expect(page3.body.data.reviews.length).toBe(1);
      expect(page1.body.data.pagination.pages).toBe(3);
      expect(page1.body.data.pagination.total).toBe(5);
    });

    it('rejects invalid status filter value with 400', async () => {
      const admin = await createAdmin();
      const res = await request(app)
        .get('/api/reviews/admin?status=nope')
        .set('Authorization', `Bearer ${sign(admin, 'admin')}`);
      expect(res.status).toBe(400);
    });
  });

  /* ----------------------------------------------------------------------- *
   *                  PATCH /api/reviews/admin/:id/approve                   *
   * ----------------------------------------------------------------------- */
  describe('PATCH /api/reviews/admin/:id/approve', () => {
    it('requires admin auth', async () => {
      const shopper = await createShopper();
      const product = await createProduct();
      const review = await createShopperReview(product, shopper);
      const res = await request(app).patch(
        `/api/reviews/admin/${review._id.toString()}/approve`
      );
      expect(res.status).toBe(401);
    });

    it('rejects non-admin tokens with 403', async () => {
      const shopper = await createShopper();
      const product = await createProduct();
      const review = await createShopperReview(product, shopper);
      const res = await request(app)
        .patch(`/api/reviews/admin/${review._id.toString()}/approve`)
        .set('Authorization', `Bearer ${sign(shopper, 'shopper')}`);
      expect(res.status).toBe(403);
    });

    it('approves pending review, stamps metadata, returns populated review', async () => {
      const admin = await createAdmin();
      const shopper = await createShopper();
      const product = await createProduct();
      const review = await createShopperReview(product, shopper, { rating: 4 });

      const res = await request(app)
        .patch(`/api/reviews/admin/${review._id.toString()}/approve`)
        .set('Authorization', `Bearer ${sign(admin, 'admin')}`);

      expect(res.status).toBe(200);
      expect(res.body.data.review.status).toBe('approved');
      expect(res.body.data.review.moderatedAt).toBeDefined();

      const reloaded = await Review.findById(review._id);
      expect(reloaded.status).toBe('approved');
      expect(String(reloaded.moderatedBy)).toBe(String(admin._id));
      expect(reloaded.moderatedAt).toBeInstanceOf(Date);
      expect(reloaded.rejectionReason).toBeNull();
    });

    it('recomputes Product.avgRating / reviewCount on approval', async () => {
      const admin = await createAdmin();
      const shopper = await createShopper();
      const product = await createProduct();
      const review = await createShopperReview(product, shopper, { rating: 5 });

      await request(app)
        .patch(`/api/reviews/admin/${review._id.toString()}/approve`)
        .set('Authorization', `Bearer ${sign(admin, 'admin')}`);

      const after = await Product.findById(product._id);
      expect(after.avgRating).toBe(5);
      expect(after.reviewCount).toBe(1);
    });

    it('returns 400 when approving an already-approved review', async () => {
      const admin = await createAdmin();
      const shopper = await createShopper();
      const product = await createProduct();
      const review = await createShopperReview(product, shopper, { status: 'approved' });

      const res = await request(app)
        .patch(`/api/reviews/admin/${review._id.toString()}/approve`)
        .set('Authorization', `Bearer ${sign(admin, 'admin')}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/already approved/i);
    });

    it('returns 404 for non-existent review id', async () => {
      const admin = await createAdmin();
      const res = await request(app)
        .patch(`/api/reviews/admin/${new mongoose.Types.ObjectId()}/approve`)
        .set('Authorization', `Bearer ${sign(admin, 'admin')}`);
      expect(res.status).toBe(404);
    });

    it('returns 400 for invalid review id format', async () => {
      const admin = await createAdmin();
      const res = await request(app)
        .patch('/api/reviews/admin/not-an-id/approve')
        .set('Authorization', `Bearer ${sign(admin, 'admin')}`);
      expect(res.status).toBe(400);
    });
  });

  /* ----------------------------------------------------------------------- *
   *                  PATCH /api/reviews/admin/:id/reject                    *
   * ----------------------------------------------------------------------- */
  describe('PATCH /api/reviews/admin/:id/reject', () => {
    it('rejects pending review with reason and stamps metadata', async () => {
      const admin = await createAdmin();
      const shopper = await createShopper();
      const product = await createProduct();
      const review = await createShopperReview(product, shopper);

      const res = await request(app)
        .patch(`/api/reviews/admin/${review._id.toString()}/reject`)
        .set('Authorization', `Bearer ${sign(admin, 'admin')}`)
        .send({ rejectionReason: 'Off-topic content' });

      expect(res.status).toBe(200);
      expect(res.body.data.review.status).toBe('rejected');

      const reloaded = await Review.findById(review._id);
      expect(reloaded.status).toBe('rejected');
      expect(reloaded.rejectionReason).toBe('Off-topic content');
      expect(String(reloaded.moderatedBy)).toBe(String(admin._id));
      expect(reloaded.moderatedAt).toBeInstanceOf(Date);
    });

    it('rejects without a reason (rejectionReason optional)', async () => {
      const admin = await createAdmin();
      const shopper = await createShopper();
      const product = await createProduct();
      const review = await createShopperReview(product, shopper);

      const res = await request(app)
        .patch(`/api/reviews/admin/${review._id.toString()}/reject`)
        .set('Authorization', `Bearer ${sign(admin, 'admin')}`)
        .send({});

      expect(res.status).toBe(200);
      const reloaded = await Review.findById(review._id);
      expect(reloaded.status).toBe('rejected');
      expect(reloaded.rejectionReason).toBeNull();
    });

    it('decrements Product.avgRating when an approved review is rejected', async () => {
      const admin = await createAdmin();
      const shopper = await createShopper();
      const product = await createProduct();
      const review = await createShopperReview(product, shopper, { rating: 5, status: 'approved' });
      await Product.findByIdAndUpdate(product._id, { avgRating: 5, reviewCount: 1 });

      await request(app)
        .patch(`/api/reviews/admin/${review._id.toString()}/reject`)
        .set('Authorization', `Bearer ${sign(admin, 'admin')}`)
        .send({ rejectionReason: 'Inaccurate claim' });

      const after = await Product.findById(product._id);
      expect(after.avgRating).toBe(0);
      expect(after.reviewCount).toBe(0);
    });

    it('returns 400 when rejecting an already-rejected review', async () => {
      const admin = await createAdmin();
      const shopper = await createShopper();
      const product = await createProduct();
      const review = await createShopperReview(product, shopper, { status: 'rejected' });

      const res = await request(app)
        .patch(`/api/reviews/admin/${review._id.toString()}/reject`)
        .set('Authorization', `Bearer ${sign(admin, 'admin')}`)
        .send({ rejectionReason: 'again' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/already rejected/i);
    });

    it('returns 400 for rejectionReason exceeding 500 chars', async () => {
      const admin = await createAdmin();
      const shopper = await createShopper();
      const product = await createProduct();
      const review = await createShopperReview(product, shopper);

      const res = await request(app)
        .patch(`/api/reviews/admin/${review._id.toString()}/reject`)
        .set('Authorization', `Bearer ${sign(admin, 'admin')}`)
        .send({ rejectionReason: 'x'.repeat(501) });
      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent review id', async () => {
      const admin = await createAdmin();
      const res = await request(app)
        .patch(`/api/reviews/admin/${new mongoose.Types.ObjectId()}/reject`)
        .set('Authorization', `Bearer ${sign(admin, 'admin')}`)
        .send({ rejectionReason: 'reason' });
      expect(res.status).toBe(404);
    });
  });

  /* ----------------------------------------------------------------------- *
   *        Governance: only shopper reviews are moderatable / listable      *
   * ----------------------------------------------------------------------- */
  describe('Governance: shopper-only moderation', () => {
    it('GET /api/reviews/admin?status=all excludes seller and admin authoritative reviews', async () => {
      const admin = await createAdmin();
      const seller = await createSeller();
      const product = await createProduct({ seller: seller._id });

      const shopper = await createShopper();
      const sellerReviewerId = seller._id;
      const adminReviewerId = admin._id;

      await createShopperReview(product, shopper, { status: 'pending', rating: 4 });
      await createAuthoritativeReview(product, sellerReviewerId, 'seller', { rating: 5 });
      await createAuthoritativeReview(product, adminReviewerId, 'admin', { rating: 5 });

      const res = await request(app)
        .get('/api/reviews/admin?status=all')
        .set('Authorization', `Bearer ${sign(admin, 'admin')}`);

      expect(res.status).toBe(200);
      expect(res.body.data.reviews.length).toBe(1);
      expect(res.body.data.reviews[0].reviewer.role).toBe('shopper');

      // Counts reflect shopper-only universe.
      expect(res.body.data.counts).toMatchObject({
        pending: 1,
        approved: 0,
        rejected: 0,
        total: 1,
      });
    });

    it('approved tab does not surface seller authoritative reviews even when no shopper reviews exist', async () => {
      const admin = await createAdmin();
      const seller = await createSeller();
      const product = await createProduct({ seller: seller._id });

      await createAuthoritativeReview(product, seller._id, 'seller', { rating: 5 });
      await createAuthoritativeReview(product, admin._id, 'admin', { rating: 5 });

      const res = await request(app)
        .get('/api/reviews/admin?status=approved')
        .set('Authorization', `Bearer ${sign(admin, 'admin')}`);

      expect(res.status).toBe(200);
      expect(res.body.data.reviews.length).toBe(0);
      expect(res.body.data.counts.approved).toBe(0);
      expect(res.body.data.counts.total).toBe(0);
    });

    it('PATCH approve on a seller authoritative review is blocked with 400', async () => {
      const admin = await createAdmin();
      const seller = await createSeller();
      const product = await createProduct({ seller: seller._id });
      const review = await createAuthoritativeReview(product, seller._id, 'seller');

      const res = await request(app)
        .patch(`/api/reviews/admin/${review._id.toString()}/approve`)
        .set('Authorization', `Bearer ${sign(admin, 'admin')}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/only shopper/i);

      const after = await Review.findById(review._id);
      expect(after.status).toBe('approved');
      expect(after.moderatedBy).toBeNull();
      expect(after.moderatedAt).toBeNull();
    });

    it('PATCH reject on a seller authoritative review is blocked with 400', async () => {
      const admin = await createAdmin();
      const seller = await createSeller();
      const product = await createProduct({ seller: seller._id });
      const review = await createAuthoritativeReview(product, seller._id, 'seller');

      const res = await request(app)
        .patch(`/api/reviews/admin/${review._id.toString()}/reject`)
        .set('Authorization', `Bearer ${sign(admin, 'admin')}`)
        .send({ rejectionReason: 'attempted reject' });

      expect(res.status).toBe(400);

      const after = await Review.findById(review._id);
      expect(after.status).toBe('approved');
      expect(after.rejectionReason).toBeNull();
    });

    it('PATCH approve on an admin authoritative review is blocked with 400', async () => {
      const admin = await createAdmin();
      const product = await createProduct();
      const review = await createAuthoritativeReview(product, admin._id, 'admin');

      const res = await request(app)
        .patch(`/api/reviews/admin/${review._id.toString()}/approve`)
        .set('Authorization', `Bearer ${sign(admin, 'admin')}`);

      expect(res.status).toBe(400);

      const after = await Review.findById(review._id);
      expect(after.status).toBe('approved');
    });

    it('PATCH reject on an admin authoritative review is blocked with 400', async () => {
      const admin = await createAdmin();
      const product = await createProduct();
      const review = await createAuthoritativeReview(product, admin._id, 'admin');

      const res = await request(app)
        .patch(`/api/reviews/admin/${review._id.toString()}/reject`)
        .set('Authorization', `Bearer ${sign(admin, 'admin')}`)
        .send({ rejectionReason: 'no' });

      expect(res.status).toBe(400);

      const after = await Review.findById(review._id);
      expect(after.status).toBe('approved');
      expect(after.rejectionReason).toBeNull();
    });

    it('shopper reviews still moderate correctly end-to-end via the admin API', async () => {
      const admin = await createAdmin();
      const shopper = await createShopper();
      const product = await createProduct();
      const review = await createShopperReview(product, shopper, { rating: 4 });

      const res = await request(app)
        .patch(`/api/reviews/admin/${review._id.toString()}/approve`)
        .set('Authorization', `Bearer ${sign(admin, 'admin')}`);

      expect(res.status).toBe(200);
      const after = await Review.findById(review._id);
      expect(after.status).toBe('approved');
    });
  });
});
