const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Admin = require('../../models/Admin');
const Shopper = require('../../models/Shopper');
const adminOrderRoutes = require('../../routes/adminOrderRoutes');
const { resetEnforcementCache } = require('../../config/permissionEnforcement');

const TEST_PASSWORD = 'TestPassword123!';

const signAdminToken = (admin) =>
  jwt.sign(
    {
      id: admin._id,
      role: 'admin',
      name: admin.name,
      isSuperAdmin: admin.isSuperAdmin ?? false,
      tokenVersion: admin.tokenVersion ?? 0,
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

describe('Admin invoice download authorization', () => {
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
    app.use('/api/admin/orders', adminOrderRoutes);
  });

  afterAll(async () => {
    process.env.JWT_SECRET = previousSecret;
    process.env.PERMISSION_ENFORCEMENT = previousEnforcement;
    process.env.PERMISSION_ENFORCED_DOMAINS = previousDomains;
    resetEnforcementCache();
    await Admin.deleteMany({ email: /stage6inv/ });
    await Shopper.deleteMany({ email: /stage6inv/ });
  });

  beforeEach(async () => {
    await Admin.deleteMany({ email: /stage6inv/ });
    await Shopper.deleteMany({ email: /stage6inv/ });
  });

  const invoicePath = `/api/admin/orders/${new mongoose.Types.ObjectId()}/invoice`;

  it('rejects unauthenticated invoice download', async () => {
    const res = await request(app).get(invoicePath);
    expect(res.status).toBe(401);
  });

  it('rejects a shopper token', async () => {
    const shopper = await Shopper.create({
      firstName: 'Cust',
      lastName: 'Omer',
      username: `stage6invshopper${Date.now()}`,
      email: `stage6invshopper${Date.now()}@example.com`,
      password: 'Password1',
    });
    const token = jwt.sign(
      { id: shopper._id, role: 'shopper', name: 'Cust' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const res = await request(app).get(invoicePath).set('Authorization', `Bearer ${token}`);
    expect([401, 403]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });

  it('rejects staff without orders:view', async () => {
    const admin = await Admin.create({
      name: 'Catalog Admin',
      username: `stage6invnoperm${Date.now()}`,
      email: `stage6invnoperm${Date.now()}@example.com`,
      password: TEST_PASSWORD,
      isSuperAdmin: false,
      isActive: true,
      permissions: ['catalog:view'],
    });

    const res = await request(app)
      .get(invoicePath)
      .set('Authorization', `Bearer ${signAdminToken(admin)}`);

    expect(res.status).toBe(403);
  });

  it('allows orders:view to reach the invoice handler', async () => {
    const admin = await Admin.create({
      name: 'Orders Admin',
      username: `stage6invadmin${Date.now()}`,
      email: `stage6invadmin${Date.now()}@example.com`,
      password: TEST_PASSWORD,
      isSuperAdmin: false,
      isActive: true,
      permissions: ['orders:view'],
    });

    const res = await request(app)
      .get(invoicePath)
      .set('Authorization', `Bearer ${signAdminToken(admin)}`);

    expect(res.status).toBe(404);
  });
});
