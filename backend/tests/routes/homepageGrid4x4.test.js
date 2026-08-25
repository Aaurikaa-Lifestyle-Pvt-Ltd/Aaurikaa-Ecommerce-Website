/**
 * Task 3.4 – Homepage Grid 4x4: public GET, null state, schema
 */
const request = require('supertest');
const mongoose = require('mongoose');
const HomepageGrid4x4 = require('../../models/HomepageGrid4x4');
const app = require('../helpers/testApp');

describe('Homepage Grid 4x4 API', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/ecommerce_test_db');
    }
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await HomepageGrid4x4.deleteMany({});
  });

  describe('GET /api/homepage/grid-4x4', () => {
    it('returns groups (empty when no doc)', async () => {
      const res = await request(app).get('/api/homepage/grid-4x4');
      expect(res.status).toBe(200);
      const data = res.body.data !== undefined ? res.body.data : res.body;
      expect(data).toHaveProperty('groups');
      expect(Array.isArray(data.groups)).toBe(true);
      expect(data.groups).toHaveLength(0);
    });

    it('returns groups with only active items sorted by order', async () => {
      await HomepageGrid4x4.create({
        heading: 'Test',
        items: [
          { image: 'a.jpg', caption: 'A', link: '/a', order: 2, isActive: true },
          { image: 'b.jpg', caption: 'B', link: '/b', order: 0, isActive: true },
          { image: 'c.jpg', caption: 'C', link: '/c', order: 1, isActive: false },
        ],
      });
      const res = await request(app).get('/api/homepage/grid-4x4');
      expect(res.status).toBe(200);
      const data = res.body.data !== undefined ? res.body.data : res.body;
      expect(data.groups).toBeDefined();
      expect(data.groups.length).toBeGreaterThan(0);
      const firstGroupItems = data.groups[0].items || [];
      expect(firstGroupItems).toHaveLength(2);
      expect(firstGroupItems[0].caption).toBe('B');
      expect(firstGroupItems[1].caption).toBe('A');
    });

    it('null state: no active items returns empty groups', async () => {
      await HomepageGrid4x4.create({
        heading: 'Empty',
        items: [
          { image: '', caption: '', link: '', order: 0, isActive: false },
        ],
      });
      const res = await request(app).get('/api/homepage/grid-4x4');
      expect(res.status).toBe(200);
      const data = res.body.data !== undefined ? res.body.data : res.body;
      expect(data.groups).toHaveLength(0);
    });
  });

  describe('HomepageGrid4x4 model', () => {
    it('accepts up to 16 items', async () => {
      const items = Array.from({ length: 16 }, (_, i) => ({
        image: `img${i}.jpg`,
        caption: `Cap ${i}`,
        link: `https://example.com/${i}`,
        order: i,
        isActive: true,
      }));
      const doc = await HomepageGrid4x4.create({ heading: 'H', items });
      expect(doc.items).toHaveLength(16);
    });
  });
});
