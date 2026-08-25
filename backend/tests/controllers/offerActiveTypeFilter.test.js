/**
 * Active offers type filter + announcement default.
 */
jest.mock('../../middleware/verifyAdmin', () => (req, res, next) => {
  req.user = { id: 'admin-test-id', _id: 'admin-test-id', role: 'admin' };
  next();
});

jest.mock('../../middleware/loadAdminContext', () => (req, res, next) => {
  req.adminUser = { isSuperAdmin: true, permissions: [] };
  next();
});

const request = require('supertest');
const mongoose = require('mongoose');
const Offer = require('../../models/offer');
const app = require('../helpers/testApp');
const { resolveActiveOfferTypeFilter } = require('../../routes/offerRoutes');

describe('Offers active type filter', () => {
  const adminId = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(
        process.env.MONGODB_TEST_URI ||
          process.env.MONGODB_URI ||
          'mongodb://localhost:27017/ecommerce_test_db'
      );
    }
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await Offer.deleteMany({});
    const now = new Date();
    await Offer.create([
      {
        text: 'Announcement bar line',
        type: 'announcement',
        isActive: true,
        validFrom: new Date(now.getTime() - 86400000),
        metadata: { createdBy: adminId },
      },
      {
        text: 'Discount promo line',
        type: 'discount',
        isActive: true,
        validFrom: new Date(now.getTime() - 86400000),
        metadata: { createdBy: adminId },
      },
      {
        text: 'Inactive announcement',
        type: 'announcement',
        isActive: false,
        validFrom: new Date(now.getTime() - 86400000),
        metadata: { createdBy: adminId },
      },
    ]);
  });

  it('resolveActiveOfferTypeFilter defaults to announcement', () => {
    expect(resolveActiveOfferTypeFilter(undefined)).toBe('announcement');
    expect(resolveActiveOfferTypeFilter('')).toBe('announcement');
    expect(resolveActiveOfferTypeFilter('all')).toBeNull();
    expect(resolveActiveOfferTypeFilter('discount')).toBe('discount');
  });

  it('GET /api/admin/offers/active defaults to announcement-only', async () => {
    const res = await request(app).get('/api/admin/offers/active');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].text).toBe('Announcement bar line');
    expect(res.body[0].type).toBe('announcement');
  });

  it('GET /api/admin/offers/active?type=announcement filters announcements', async () => {
    const res = await request(app).get('/api/admin/offers/active?type=announcement');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].type).toBe('announcement');
  });

  it('GET /api/admin/offers/active?type=all returns every active type', async () => {
    const res = await request(app).get('/api/admin/offers/active?type=all');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    const types = res.body.map((o) => o.type).sort();
    expect(types).toEqual(['announcement', 'discount']);
  });

  it('GET /api/admin/offers/active?type=discount returns discount only', async () => {
    const res = await request(app).get('/api/admin/offers/active?type=discount');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].type).toBe('discount');
  });

  it('GET /api/admin/offers/active includes offers with validTo null', async () => {
    await Offer.deleteMany({});
    await Offer.create({
      text: 'Open-ended announcement',
      type: 'announcement',
      isActive: true,
      validFrom: new Date(Date.now() - 86400000),
      validTo: null,
      metadata: { createdBy: adminId },
    });
    const res = await request(app).get('/api/admin/offers/active?type=announcement');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].text).toBe('Open-ended announcement');
  });
});
