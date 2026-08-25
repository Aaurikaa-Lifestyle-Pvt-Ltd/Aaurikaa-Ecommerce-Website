/**
 * Review Moderation End-to-End Integration Tests (AAURIKAA Phase 4a)
 *
 * Product rules:
 *  - eligible shopper POST → status=approved + verifiedPurchase immediately
 *  - ineligible POST rejected server-side
 *  - shopper edits of approved reviews stay approved (no moderation queue)
 *  - admin reject/approve remain for content-safety hide/restore + re-aggregate
 *  - public APIs count approved only
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
const Order = require('../../models/Order');
const {
  approveReview,
  rejectReview,
} = require('../../services/reviewModerationService');

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const sign = (user, role) =>
  jwt.sign({ id: user._id, role }, JWT_SECRET, { expiresIn: '7d' });

const makeShopper = async () => {
  const t = Date.now() + Math.floor(Math.random() * 1e6);
  return Shopper.create({
    firstName: 'Flow',
    lastName: 'Shopper',
    username: `flowshopper${t}`,
    email: `flowshopper${t}@test.com`,
    password: await bcrypt.hash('Test123!@#', 10),
    role: 'shopper',
  });
};

const makeSeller = async () => {
  const t = Date.now() + Math.floor(Math.random() * 1e6);
  return Seller.create({
    firstName: 'Flow',
    lastName: 'Seller',
    username: `flowseller${t}`,
    email: `flowseller${t}@test.com`,
    password: await bcrypt.hash('Test123!@#', 10),
    shopName: `Flow Shop ${t}`,
    shopUrl: `flow-shop-${t}`,
    role: 'seller',
    isApproved: true,
  });
};

const makeAdmin = async () => {
  const t = Date.now() + Math.floor(Math.random() * 1e6);
  return Admin.create({
    name: 'Flow Admin',
    username: `flowadmin${t}`,
    email: `flowadmin${t}@test.com`,
    password: 'Test123!@',
    role: 'admin',
    isSuperAdmin: true,
  });
};

const makeProduct = async (overrides = {}) => {
  const seller = overrides.seller || (await makeSeller());
  return Product.create({
    name: 'Flow Product',
    sku: `FLOW-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    seller: seller._id,
    regularPrice: 100,
    stock: 10,
    status: 'published',
    approvalStatus: 'approved',
    ...overrides,
  });
};

const makeDeliveredOrder = async (shopper, product) =>
  Order.create({
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

const seedPendingShopperReview = async (product, shopper, { rating = 3, comment = 'pending seed' } = {}) =>
  Review.create({
    product: product._id,
    productSku: product.sku,
    seller: product.seller,
    reviewer: {
      userId: shopper._id,
      role: 'shopper',
      roleModel: 'Shopper',
      name: 'Flow Shopper',
    },
    rating,
    comment,
    status: 'pending',
    verifiedPurchase: false,
    isAuthoritative: false,
  });

describe('Review Moderation End-to-End Flow', () => {
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

  describe('Shopper review creation (AAURIKAA auto-approve)', () => {
    it('eligible shopper reviews persist as status="approved" with verifiedPurchase', async () => {
      const shopper = await makeShopper();
      const product = await makeProduct();
      await makeDeliveredOrder(shopper, product);
      const token = sign(shopper, 'shopper');

      const res = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: product._id.toString(), rating: 5, comment: 'great' });
      expect(res.status).toBe(201);
      expect(res.body.data.review.status).toBe('approved');
      expect(res.body.data.review.verifiedPurchase).toBe(true);

      const review = await Review.findOne({
        product: product._id,
        'reviewer.userId': shopper._id,
      });
      expect(review.status).toBe('approved');
      expect(review.verifiedPurchase).toBe(true);
      expect(review.isAuthoritative).toBe(false);
    });

    it('ineligible shopper create is rejected with 403', async () => {
      const shopper = await makeShopper();
      const product = await makeProduct();
      const token = sign(shopper, 'shopper');

      const res = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: product._id.toString(), rating: 5, comment: 'no purchase' });
      expect(res.status).toBe(403);
      expect(await Review.countDocuments({ product: product._id })).toBe(0);
    });

    it('seller authoritative reviews remain auto-approved', async () => {
      const seller = await makeSeller();
      const product = await makeProduct({ seller: seller._id });

      const res = await request(app)
        .post(`/api/reviews/seller/${product._id.toString()}`)
        .set('Authorization', `Bearer ${sign(seller, 'seller')}`)
        .send({ rating: 5, comment: 'seller note' });
      expect(res.status).toBe(201);

      const review = await Review.findOne({ product: product._id, 'reviewer.role': 'seller' });
      expect(review.status).toBe('approved');
      expect(review.isAuthoritative).toBe(true);
    });

    it('admin authoritative reviews remain auto-approved', async () => {
      const admin = await makeAdmin();
      const product = await makeProduct();

      const res = await request(app)
        .post(`/api/reviews/admin/${product._id.toString()}`)
        .set('Authorization', `Bearer ${sign(admin, 'admin')}`)
        .send({ rating: 5, comment: 'admin endorsement' });
      expect(res.status).toBe(201);

      const review = await Review.findOne({ product: product._id, 'reviewer.role': 'admin' });
      expect(review.status).toBe('approved');
      expect(review.isAuthoritative).toBe(true);
    });

    it('eligible shopper review contributes to Product/Seller aggregates immediately', async () => {
      const seller = await makeSeller();
      const product = await makeProduct({ seller: seller._id });
      const shopper = await makeShopper();
      await makeDeliveredOrder(shopper, product);

      await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${sign(shopper, 'shopper')}`)
        .send({ productId: product._id.toString(), rating: 5, comment: 'great' });

      const p = await Product.findById(product._id);
      const s = await Seller.findById(seller._id);
      expect(p.avgRating).toBe(5);
      expect(p.reviewCount).toBe(1);
      expect(s.avgRating).toBe(5);
      expect(s.reviewCount).toBe(1);
    });
  });

  describe('Shopper edit stays approved', () => {
    it('PUT /api/reviews/:id keeps approved status and updates aggregates', async () => {
      const shopper = await makeShopper();
      const product = await makeProduct();
      await makeDeliveredOrder(shopper, product);

      await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${sign(shopper, 'shopper')}`)
        .send({ productId: product._id.toString(), rating: 4, comment: 'good' });

      const original = await Review.findOne({ product: product._id });
      expect(original.status).toBe('approved');

      const editRes = await request(app)
        .put(`/api/reviews/${original._id.toString()}`)
        .set('Authorization', `Bearer ${sign(shopper, 'shopper')}`)
        .send({ rating: 5, comment: 'even better' });
      expect(editRes.status).toBe(200);

      const after = await Review.findById(original._id);
      expect(after.status).toBe('approved');
      expect(after.rating).toBe(5);
      expect(after.comment).toBe('even better');
      expect(after.verifiedPurchase).toBe(true);

      const p = await Product.findById(product._id);
      expect(p.avgRating).toBe(5);
      expect(p.reviewCount).toBe(1);
    });

    it('POST /api/reviews on an existing approved review stays approved', async () => {
      const shopper = await makeShopper();
      const product = await makeProduct();
      await makeDeliveredOrder(shopper, product);

      await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${sign(shopper, 'shopper')}`)
        .send({ productId: product._id.toString(), rating: 4, comment: 'initial' });

      const review = await Review.findOne({ product: product._id });

      const res = await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${sign(shopper, 'shopper')}`)
        .send({ productId: product._id.toString(), rating: 5, comment: 'updated' });

      expect(res.status).toBe(200);

      const after = await Review.findById(review._id);
      expect(after.status).toBe('approved');
      expect(after.rating).toBe(5);
      expect(after.comment).toBe('updated');
    });

    it('editing a rejected review does NOT auto-restore to approved', async () => {
      const admin = await makeAdmin();
      const shopper = await makeShopper();
      const product = await makeProduct();
      await makeDeliveredOrder(shopper, product);

      await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${sign(shopper, 'shopper')}`)
        .send({ productId: product._id.toString(), rating: 2, comment: 'bad' });

      const review = await Review.findOne({ product: product._id });
      await rejectReview(review._id, admin._id, 'Profanity');

      const editRes = await request(app)
        .put(`/api/reviews/${review._id.toString()}`)
        .set('Authorization', `Bearer ${sign(shopper, 'shopper')}`)
        .send({ comment: 'edited but still rejected' });
      expect(editRes.status).toBe(200);

      const after = await Review.findById(review._id);
      expect(after.status).toBe('rejected');
      expect(after.rejectionReason).toBe('Profanity');
    });
  });

  describe('Public review visibility', () => {
    it('GET /api/reviews/product/:id hides pending and rejected reviews', async () => {
      const admin = await makeAdmin();
      const product = await makeProduct();
      const s1 = await makeShopper();
      const s2 = await makeShopper();
      const s3 = await makeShopper();
      await makeDeliveredOrder(s1, product);
      await makeDeliveredOrder(s2, product);

      await request(app).post('/api/reviews').set('Authorization', `Bearer ${sign(s1, 'shopper')}`).send({
        productId: product._id.toString(),
        rating: 5,
        comment: 'approved soon',
      });
      await request(app).post('/api/reviews').set('Authorization', `Bearer ${sign(s2, 'shopper')}`).send({
        productId: product._id.toString(),
        rating: 1,
        comment: 'will be rejected',
      });
      await seedPendingShopperReview(product, s3, { rating: 4, comment: 'pending' });

      const r2 = await Review.findOne({ 'reviewer.userId': s2._id });
      await rejectReview(r2._id, admin._id, 'spam');

      const res = await request(app).get(`/api/reviews/product/${product._id.toString()}`);
      expect(res.status).toBe(200);
      expect(res.body.data.summary.reviewCount).toBe(1);
      expect(res.body.data.summary.avgRating).toBe(5);
      expect(res.body.data.customerReviews.length).toBe(1);
      expect(res.body.data.customerReviews[0].comment).toBe('approved soon');
      expect(res.body.data.customerReviews[0].verifiedPurchase).toBe(true);
    });

    it('GET /api/reviews/seller/:id excludes pending and rejected reviews from aggregates', async () => {
      const admin = await makeAdmin();
      const seller = await makeSeller();
      const product = await makeProduct({ seller: seller._id });
      const s1 = await makeShopper();
      const s2 = await makeShopper();
      await makeDeliveredOrder(s1, product);
      await makeDeliveredOrder(s2, product);

      await request(app).post('/api/reviews').set('Authorization', `Bearer ${sign(s1, 'shopper')}`).send({
        productId: product._id.toString(),
        rating: 5,
        comment: 'approve me',
      });
      await request(app).post('/api/reviews').set('Authorization', `Bearer ${sign(s2, 'shopper')}`).send({
        productId: product._id.toString(),
        rating: 1,
        comment: 'reject me',
      });

      const r2 = await Review.findOne({ 'reviewer.userId': s2._id });
      await rejectReview(r2._id, admin._id, 'spam');

      const res = await request(app).get(`/api/reviews/seller/${seller._id.toString()}`);
      expect(res.status).toBe(200);
      expect(res.body.data.seller.reviewCount).toBe(1);
      expect(res.body.data.seller.avgRating).toBe(5);
      expect(res.body.data.seller.ratingBreakdown.fiveStar).toBe(1);
      expect(res.body.data.seller.ratingBreakdown.oneStar).toBe(0);
    });

    it('GET /api/reviews/me returns shopper-owned approved/pending/rejected reviews', async () => {
      const admin = await makeAdmin();
      const shopper = await makeShopper();
      const productA = await makeProduct();
      const productB = await makeProduct();
      const productC = await makeProduct();
      const token = sign(shopper, 'shopper');
      await makeDeliveredOrder(shopper, productA);
      await makeDeliveredOrder(shopper, productB);

      await request(app).post('/api/reviews').set('Authorization', `Bearer ${token}`).send({
        productId: productA._id.toString(),
        rating: 5,
        comment: 'A',
      });
      await request(app).post('/api/reviews').set('Authorization', `Bearer ${token}`).send({
        productId: productB._id.toString(),
        rating: 1,
        comment: 'B',
      });
      await seedPendingShopperReview(productC, shopper, { rating: 3, comment: 'C' });

      const rB = await Review.findOne({ product: productB._id });
      await rejectReview(rB._id, admin._id, 'spam');

      const me = await request(app)
        .get('/api/reviews/me')
        .set('Authorization', `Bearer ${token}`);
      expect(me.status).toBe(200);
      expect(me.body.data.reviews.length).toBe(3);
      const statuses = me.body.data.reviews.map((r) => r.status).sort();
      expect(statuses).toEqual(['approved', 'pending', 'rejected']);
    });
  });

  describe('Aggregate integrity across transitions', () => {
    it('seeded pending review never affects aggregates', async () => {
      const seller = await makeSeller();
      const product = await makeProduct({ seller: seller._id });
      const shoppers = await Promise.all([makeShopper(), makeShopper(), makeShopper()]);
      for (const s of shoppers) {
        await seedPendingShopperReview(product, s, { rating: 5 });
      }

      const p = await Product.findById(product._id);
      const sellerDoc = await Seller.findById(seller._id);
      expect(p.avgRating).toBe(0);
      expect(p.reviewCount).toBe(0);
      expect(sellerDoc.avgRating).toBe(0);
      expect(sellerDoc.reviewCount).toBe(0);
    });

    it('reject after publish decrements aggregates; re-approve restores', async () => {
      const admin = await makeAdmin();
      const seller = await makeSeller();
      const product = await makeProduct({ seller: seller._id });
      const shopper = await makeShopper();
      await makeDeliveredOrder(shopper, product);

      await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${sign(shopper, 'shopper')}`)
        .send({ productId: product._id.toString(), rating: 4, comment: 'good' });

      const review = await Review.findOne({ product: product._id });

      let p = await Product.findById(product._id);
      let s = await Seller.findById(seller._id);
      expect(p.avgRating).toBe(4);
      expect(p.reviewCount).toBe(1);
      expect(s.avgRating).toBe(4);
      expect(s.reviewCount).toBe(1);
      expect(s.ratingBreakdown.fourStar).toBe(1);

      await rejectReview(review._id, admin._id, 'misleading');
      p = await Product.findById(product._id);
      s = await Seller.findById(seller._id);
      expect(p.avgRating).toBe(0);
      expect(p.reviewCount).toBe(0);
      expect(s.avgRating).toBe(0);
      expect(s.ratingBreakdown.fourStar).toBe(0);

      await approveReview(review._id, admin._id);
      p = await Product.findById(product._id);
      s = await Seller.findById(seller._id);
      expect(p.avgRating).toBe(4);
      expect(p.reviewCount).toBe(1);
      expect(s.avgRating).toBe(4);
      expect(s.ratingBreakdown.fourStar).toBe(1);
    });

    it('shopper edit of approved review updates aggregates without unpublishing', async () => {
      const seller = await makeSeller();
      const product = await makeProduct({ seller: seller._id });
      const shopper = await makeShopper();
      await makeDeliveredOrder(shopper, product);

      await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${sign(shopper, 'shopper')}`)
        .send({ productId: product._id.toString(), rating: 5, comment: 'love it' });

      const review = await Review.findOne({ product: product._id });

      let p = await Product.findById(product._id);
      expect(p.avgRating).toBe(5);
      expect(p.reviewCount).toBe(1);

      await request(app)
        .put(`/api/reviews/${review._id.toString()}`)
        .set('Authorization', `Bearer ${sign(shopper, 'shopper')}`)
        .send({ rating: 4, comment: 'reconsidered' });

      p = await Product.findById(product._id);
      expect(p.avgRating).toBe(4);
      expect(p.reviewCount).toBe(1);
      expect((await Review.findById(review._id)).status).toBe('approved');
    });

    it('seller breakdown mirrors only approved reviews after hide', async () => {
      const admin = await makeAdmin();
      const seller = await makeSeller();
      const productA = await makeProduct({ seller: seller._id });
      const productB = await makeProduct({ seller: seller._id });

      const buyers = await Promise.all([
        makeShopper(),
        makeShopper(),
        makeShopper(),
        makeShopper(),
      ]);
      const ratings = [5, 4, 3, 2];
      const products = [productA, productA, productB, productB];

      for (let i = 0; i < 4; i += 1) {
        await makeDeliveredOrder(buyers[i], products[i]);
        await request(app)
          .post('/api/reviews')
          .set('Authorization', `Bearer ${sign(buyers[i], 'shopper')}`)
          .send({ productId: products[i]._id.toString(), rating: ratings[i], comment: `r${i}` });
      }

      const allReviews = await Review.find({ seller: seller._id }).sort({ rating: -1 });
      // Hide lowest two (ratings 3 and 2)
      await rejectReview(allReviews[2]._id, admin._id, 'spam');
      await rejectReview(allReviews[3]._id, admin._id, 'spam');

      const s = await Seller.findById(seller._id);
      expect(s.reviewCount).toBe(2);
      expect(s.avgRating).toBe(4.5);
      expect(s.ratingBreakdown.fiveStar).toBe(1);
      expect(s.ratingBreakdown.fourStar).toBe(1);
      expect(s.ratingBreakdown.threeStar).toBe(0);
      expect(s.ratingBreakdown.twoStar).toBe(0);
    });
  });

  describe('Edge cases', () => {
    it('product with zero approved reviews returns avgRating=0 and reviewCount=0', async () => {
      const admin = await makeAdmin();
      const product = await makeProduct();
      const shopper = await makeShopper();
      await makeDeliveredOrder(shopper, product);

      await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${sign(shopper, 'shopper')}`)
        .send({ productId: product._id.toString(), rating: 5, comment: 'x' });

      const review = await Review.findOne({ product: product._id });
      await rejectReview(review._id, admin._id, 'spam');

      const summary = await request(app).get(`/api/reviews/product/${product._id.toString()}`);
      expect(summary.body.data.summary.avgRating).toBe(0);
      expect(summary.body.data.summary.reviewCount).toBe(0);
      expect(summary.body.data.customerReviews.length).toBe(0);

      const p = await Product.findById(product._id);
      expect(p.avgRating).toBe(0);
      expect(p.reviewCount).toBe(0);
    });

    it('reviews persist and remain queryable by SKU after product deletion (only approved are public)', async () => {
      const admin = await makeAdmin();
      const product = await makeProduct();
      const s1 = await makeShopper();
      const s2 = await makeShopper();
      await makeDeliveredOrder(s1, product);
      await makeDeliveredOrder(s2, product);

      await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${sign(s1, 'shopper')}`)
        .send({ productId: product._id.toString(), rating: 5, comment: 'approved' });
      await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${sign(s2, 'shopper')}`)
        .send({ productId: product._id.toString(), rating: 1, comment: 'rejected' });

      const r2 = await Review.findOne({ 'reviewer.userId': s2._id });
      await rejectReview(r2._id, admin._id, 'spam');

      const sku = product.sku;
      await Product.findByIdAndDelete(product._id);

      const remaining = await Review.find({ productSku: sku });
      expect(remaining.length).toBe(2);

      const publicAfterDelete = await request(app).get(
        `/api/reviews/product/${product._id.toString()}?sku=${sku}`
      );
      expect(publicAfterDelete.status).toBe(200);
      expect(publicAfterDelete.body.data.productDeleted).toBe(true);
      expect(publicAfterDelete.body.data.customerReviews.length).toBe(1);
      expect(publicAfterDelete.body.data.customerReviews[0].comment).toBe('approved');
    });

    it('approve on already-approved review is blocked at HTTP layer', async () => {
      const admin = await makeAdmin();
      const shopper = await makeShopper();
      const product = await makeProduct();
      await makeDeliveredOrder(shopper, product);

      await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${sign(shopper, 'shopper')}`)
        .send({ productId: product._id.toString(), rating: 5, comment: 'x' });
      const review = await Review.findOne({ product: product._id });
      expect(review.status).toBe('approved');

      const first = await request(app)
        .patch(`/api/reviews/admin/${review._id.toString()}/approve`)
        .set('Authorization', `Bearer ${sign(admin, 'admin')}`);
      expect(first.status).toBe(400);
    });

    it('repeated reject on already-rejected review is blocked at HTTP layer', async () => {
      const admin = await makeAdmin();
      const shopper = await makeShopper();
      const product = await makeProduct();
      await makeDeliveredOrder(shopper, product);

      await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${sign(shopper, 'shopper')}`)
        .send({ productId: product._id.toString(), rating: 1, comment: 'x' });
      const review = await Review.findOne({ product: product._id });

      const first = await request(app)
        .patch(`/api/reviews/admin/${review._id.toString()}/reject`)
        .set('Authorization', `Bearer ${sign(admin, 'admin')}`)
        .send({ rejectionReason: 'spam' });
      expect(first.status).toBe(200);

      const second = await request(app)
        .patch(`/api/reviews/admin/${review._id.toString()}/reject`)
        .set('Authorization', `Bearer ${sign(admin, 'admin')}`)
        .send({ rejectionReason: 'still spam' });
      expect(second.status).toBe(400);
    });

    it('delete recomputes aggregates', async () => {
      const shopper = await makeShopper();
      const product = await makeProduct();
      await makeDeliveredOrder(shopper, product);
      const token = sign(shopper, 'shopper');

      await request(app)
        .post('/api/reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: product._id.toString(), rating: 5, comment: 'keep' });

      let p = await Product.findById(product._id);
      expect(p.reviewCount).toBe(1);

      const review = await Review.findOne({ product: product._id });
      const del = await request(app)
        .delete(`/api/reviews/${review._id.toString()}`)
        .set('Authorization', `Bearer ${token}`);
      expect(del.status).toBe(200);

      p = await Product.findById(product._id);
      expect(p.avgRating).toBe(0);
      expect(p.reviewCount).toBe(0);
    });

    it('concurrent eligible submissions publish immediately and update aggregates', async () => {
      const product = await makeProduct();
      const s1 = await makeShopper();
      const s2 = await makeShopper();
      await makeDeliveredOrder(s1, product);
      await makeDeliveredOrder(s2, product);

      const [r1, r2] = await Promise.all([
        request(app)
          .post('/api/reviews')
          .set('Authorization', `Bearer ${sign(s1, 'shopper')}`)
          .send({ productId: product._id.toString(), rating: 5, comment: 'A' }),
        request(app)
          .post('/api/reviews')
          .set('Authorization', `Bearer ${sign(s2, 'shopper')}`)
          .send({ productId: product._id.toString(), rating: 4, comment: 'B' }),
      ]);
      expect(r1.status).toBe(201);
      expect(r2.status).toBe(201);

      const reviews = await Review.find({ product: product._id });
      expect(reviews.length).toBe(2);
      expect(reviews.every((r) => r.status === 'approved')).toBe(true);

      const p = await Product.findById(product._id);
      expect(p.avgRating).toBe(4.5);
      expect(p.reviewCount).toBe(2);
    });
  });
});
