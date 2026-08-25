/**
 * Public brand visibility: inactive brands excluded from public surfaces;
 * homepage bundle cache invalidated on brand mutations.
 */
jest.mock('../../middleware/verifyAdmin', () => (req, res, next) => {
  req.user = { _id: 'admin-test-id', role: 'admin' };
  next();
});

const request = require('supertest');
const mongoose = require('mongoose');
const Brand = require('../../models/brand');
const cache = require('../../utils/cache');
const app = require('../helpers/testApp');

describe('Public brand visibility', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(
        process.env.MONGODB_TEST_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/ecommerce_test_db'
      );
    }
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    cache.flushAll();
    await Brand.deleteMany({});
  });

  describe('GET /api/brands', () => {
    it('excludes inactive brands by default', async () => {
      await Brand.create([
        { name: 'Active Brand', isActive: true },
        { name: 'Inactive Brand', isActive: false },
      ]);

      const res = await request(app).get('/api/brands');
      expect(res.status).toBe(200);
      const brands = res.body.data || res.body;
      expect(Array.isArray(brands)).toBe(true);
      expect(brands).toHaveLength(1);
      expect(brands[0].name).toBe('Active Brand');
    });

    it('includes inactive brands when includeInactive=1', async () => {
      await Brand.create([
        { name: 'Active Brand', isActive: true },
        { name: 'Inactive Brand', isActive: false },
      ]);

      const res = await request(app).get('/api/brands?includeInactive=1');
      expect(res.status).toBe(200);
      const brands = res.body.data || res.body;
      expect(brands).toHaveLength(2);
    });
  });

  describe('GET /api/homepage-bundle', () => {
    it('returns only active brands in bundle payload', async () => {
      await Brand.create([
        { name: 'Visible Brand', isActive: true, sortOrder: 1 },
        { name: 'Hidden Brand', isActive: false, sortOrder: 0 },
      ]);

      const res = await request(app).get('/api/homepage-bundle');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.brands)).toBe(true);
      expect(res.body.brands).toHaveLength(1);
      expect(res.body.brands[0].name).toBe('Visible Brand');
    });

    it('reflects brand deactivation after cache invalidation', async () => {
      const active = await Brand.create({ name: 'Soon Hidden', isActive: true });

      const first = await request(app).get('/api/homepage-bundle');
      expect(first.body.brands.some((b) => b.name === 'Soon Hidden')).toBe(true);

      active.isActive = false;
      await active.save();
      cache.flushAll();

      const second = await request(app).get('/api/homepage-bundle');
      expect(second.body.brands.some((b) => b.name === 'Soon Hidden')).toBe(false);
    });
  });

  describe('Brand CRUD cache invalidation', () => {
    it('clears homepage-bundle cache keys on brand update', async () => {
      const brand = await Brand.create({ name: 'Cache Test', isActive: true });
      cache.set('homepage-bundle-en', { brands: [] }, 120);
      cache.set('homepage-bundle-fr', { brands: [] }, 120);
      expect(cache.keys().filter((k) => k.startsWith('homepage-bundle-'))).toHaveLength(2);

      const res = await request(app)
        .put(`/api/brands/${brand._id}`)
        .send({ name: 'Cache Test Updated' });

      expect(res.status).toBe(200);
      expect(cache.keys().filter((k) => k.startsWith('homepage-bundle-'))).toHaveLength(0);
    });
  });
});
