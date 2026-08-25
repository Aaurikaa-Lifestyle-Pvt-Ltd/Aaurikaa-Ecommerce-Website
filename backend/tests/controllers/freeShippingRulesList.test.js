/**
 * Free shipping rules list — active-only public default; includeInactive for Admin.
 */
jest.mock('../../middleware/verifyAdmin', () => (req, res, next) => {
  req.user = { _id: 'admin-test-id', id: 'admin-test-id', role: 'admin' };
  next();
});

jest.mock('../../middleware/loadAdminContext', () => (req, res, next) => {
  req.adminUser = { isSuperAdmin: true, permissions: [] };
  next();
});

const request = require('supertest');
const mongoose = require('mongoose');
const FreeShippingRule = require('../../models/FreeShippingRule');
const app = require('../helpers/testApp');

describe('GET /api/shipping/free-rules', () => {
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
    await FreeShippingRule.deleteMany({});
    await FreeShippingRule.create([
      {
        name: 'Active threshold',
        minOrderAmountINR: 999,
        active: true,
        sortOrder: 1,
      },
      {
        name: 'Inactive threshold',
        minOrderAmountINR: 1499,
        active: false,
        sortOrder: 2,
      },
    ]);
  });

  it('returns only active rules by default', async () => {
    const res = await request(app).get('/api/shipping/free-rules');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Active threshold');
    expect(res.body[0].active).toBe(true);
  });

  it('returns active and inactive when includeInactive=true (admin-gated)', async () => {
    const res = await request(app).get('/api/shipping/free-rules?includeInactive=true');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    const names = res.body.map((r) => r.name).sort();
    expect(names).toEqual(['Active threshold', 'Inactive threshold']);
  });
});
