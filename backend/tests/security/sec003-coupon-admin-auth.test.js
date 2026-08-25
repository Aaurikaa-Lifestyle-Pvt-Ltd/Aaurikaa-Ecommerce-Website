const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Admin = require('../../models/Admin');
const Coupon = require('../../models/coupon');
const Shopper = require('../../models/Shopper');
const couponRoutes = require('../../routes/couponRoutes');
const { resetEnforcementCache } = require('../../config/permissionEnforcement');

const TEST_PASSWORD = 'TestPassword123!';

const signAdminToken = (admin, extra = {}) =>
  jwt.sign(
    {
      id: admin._id,
      role: 'admin',
      name: admin.name,
      isSuperAdmin: admin.isSuperAdmin ?? false,
      tokenVersion: admin.tokenVersion ?? 0,
      ...extra,
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

describe('SEC-003 coupon administration authorization', () => {
  let app;
  let previousEnforcement;
  let previousDomains;
  let previousSecret;

  beforeAll(async () => {
    previousSecret = process.env.JWT_SECRET;
    previousEnforcement = process.env.PERMISSION_ENFORCEMENT;
    previousDomains = process.env.PERMISSION_ENFORCED_DOMAINS;
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
    process.env.PERMISSION_ENFORCEMENT = 'true';
    process.env.PERMISSION_ENFORCED_DOMAINS = '*';
    resetEnforcementCache();

    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/ecommerce_test_db');
    }

    app = express();
    app.use(express.json());
    app.use('/api/admin/coupons', couponRoutes);
  });

  afterAll(async () => {
    process.env.JWT_SECRET = previousSecret;
    process.env.PERMISSION_ENFORCEMENT = previousEnforcement;
    process.env.PERMISSION_ENFORCED_DOMAINS = previousDomains;
    resetEnforcementCache();
    await Admin.deleteMany({ email: /sec003/ });
    await Coupon.deleteMany({ code: { $regex: /^SEC003/ } });
    await Shopper.deleteMany({ email: /sec003/ });
  });

  beforeEach(async () => {
    await Admin.deleteMany({ email: /sec003/ });
    await Coupon.deleteMany({ code: { $regex: /^SEC003/ } });
    await Shopper.deleteMany({ email: /sec003/ });
    await Coupon.create({
      code: 'SEC003LIVE',
      discountType: 'percentage',
      discountValue: 10,
      isActive: true,
      usageHistory: [{ userId: new mongoose.Types.ObjectId(), orderId: new mongoose.Types.ObjectId() }],
    });
  });

  it('rejects unauthenticated listing', async () => {
    const res = await request(app).get('/api/admin/coupons');
    expect(res.status).toBe(401);
  });

  it('rejects an ordinary customer token', async () => {
    const shopper = await Shopper.create({
      firstName: 'Cust',
      lastName: 'Omer',
      username: `sec003shopper${Date.now()}`,
      email: `sec003shopper${Date.now()}@example.com`,
      password: 'Password1',
    });
    const token = jwt.sign(
      { id: shopper._id, role: 'shopper', name: 'Cust' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const res = await request(app)
      .get('/api/admin/coupons')
      .set('Authorization', `Bearer ${token}`);

    expect([401, 403]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });

  it('allows an authorized admin with promotions:view', async () => {
    const admin = await Admin.create({
      name: 'Promo Admin',
      username: `sec003admin${Date.now()}`,
      email: `sec003admin${Date.now()}@example.com`,
      password: TEST_PASSWORD,
      isSuperAdmin: false,
      isActive: true,
      permissions: ['promotions:view'],
    });

    const res = await request(app)
      .get('/api/admin/coupons')
      .set('Authorization', `Bearer ${signAdminToken(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const coupons = res.body.data || res.body.coupons || [];
    expect(Array.isArray(coupons)).toBe(true);
    expect(coupons.some((c) => c.code === 'SEC003LIVE')).toBe(true);
  });

  it('rejects a staff admin without promotions permission', async () => {
    const admin = await Admin.create({
      name: 'Catalog Admin',
      username: `sec003nopromo${Date.now()}`,
      email: `sec003nopromo${Date.now()}@example.com`,
      password: TEST_PASSWORD,
      isSuperAdmin: false,
      isActive: true,
      permissions: ['catalog:view'],
    });

    const res = await request(app)
      .get('/api/admin/coupons')
      .set('Authorization', `Bearer ${signAdminToken(admin)}`);

    expect(res.status).toBe(403);
  });
});
