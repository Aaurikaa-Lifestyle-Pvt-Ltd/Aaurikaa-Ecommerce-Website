/**
 * AAURIKAA foundation HTTP / authorization tests.
 * Test 1: unauthenticated seller registration rejected
 * Test 2: customer cannot access seller-only endpoints
 * Test 3: ordinary admin cannot access seller finance without finance permission
 * Test 5: legitimate admin authentication still works
 */
const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { MongoMemoryServer } = require("mongodb-memory-server");

const Admin = require("../../models/Admin");
const Shopper = require("../../models/Shopper");
const { resetEnforcementCache } = require("../../config/permissionEnforcement");
const { ERROR_CODES } = require("../../utils/errorHandler");

const TEST_PASSWORD = "TestPassword123!";

describe("AAURIKAA foundation isolation and admin auth", () => {
  let mongoServer;
  let app;

  beforeAll(async () => {
    jest.setTimeout(30000);
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
    process.env.PERMISSION_ENFORCEMENT = "true";
    process.env.PERMISSION_ENFORCED_DOMAINS = "*";
    delete process.env.AAURIKAA_ENABLE_MARKETPLACE_SURFACES;
    resetEnforcementCache();

    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    app = express();
    app.use(express.json());
    app.use("/api/admin", require("../../routes/adminRoutes"));
    app.use("/api/seller", require("../../routes/sellerAuthRoutes"));
    app.use("/api/seller/products", require("../../routes/seller/productRoutes"));
    app.use("/api/seller/payouts", require("../../routes/sellerPayoutRoutes"));
    app.use("/api/orders/seller", require("../../routes/sellerOrderRoutes"));
    app.use("/api/sellers", require("../../routes/publicSellerRoutes"));
    app.use("/api/commissions", require("../../routes/commissionRoutes"));
    app.use("/api/admin/payouts", require("../../routes/admin/payoutRoutes"));
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  beforeEach(async () => {
    await Promise.all([Admin.deleteMany({}), Shopper.deleteMany({})]);
  });

  it("Test 1: unauthenticated seller registration is rejected", async () => {
    const res = await request(app)
      .post("/api/seller/register")
      .send({
        firstName: "Public",
        lastName: "User",
        username: "publicseller",
        email: "publicseller@example.com",
        phone: "9876543210",
        shopName: "Public Shop",
        shopUrl: "public-shop",
        password: "Password123",
        confirmPassword: "Password123",
        address1: "1 Street",
        pincode: "400001",
        country: new mongoose.Types.ObjectId().toString(),
        state: new mongoose.Types.ObjectId().toString(),
        district: new mongoose.Types.ObjectId().toString(),
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/disabled/i);
    expect(res.body.code).toBe(ERROR_CODES.AUTH_ACCESS_DENIED);
  });

  it("rejects seller registration OTP verification while public onboarding is disabled", async () => {
    const res = await request(app)
      .post("/api/seller/verify-registration")
      .send({ email: "publicseller@example.com", otp: "123456" });

    expect(res.status).toBe(403);
  });

  it("does not expose the public seller storefront", async () => {
    const res = await request(app).get("/api/sellers/storefront/aaurikaa");
    expect(res.status).toBe(404);
  });

  it("Test 2: a normal customer is rejected on seller-only endpoints", async () => {
    const shopper = await Shopper.create({
      firstName: "Cust",
      lastName: "Omer",
      username: "customer1",
      email: "customer1@example.com",
      password: "hashed",
    });
    const token = jwt.sign(
      { id: shopper._id, role: "shopper", name: "Cust Omer" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const products = await request(app)
      .get("/api/seller/products/all")
      .set("Authorization", `Bearer ${token}`);
    expect([401, 403]).toContain(products.status);

    const payouts = await request(app)
      .get("/api/seller/payouts/summary")
      .set("Authorization", `Bearer ${token}`);
    expect([401, 403]).toContain(payouts.status);

    const sellerOrders = await request(app)
      .get("/api/orders/seller")
      .set("Authorization", `Bearer ${token}`);
    expect([401, 403]).toContain(sellerOrders.status);
  });

  it("Test 3: ordinary admin cannot access seller finance without finance permission", async () => {
    const staff = new Admin({
      name: "Ops Admin",
      username: "opsadmin",
      email: "opsadmin@example.com",
      password: TEST_PASSWORD,
      isSuperAdmin: false,
      permissions: ["catalog:view", "catalog:manage", "orders:view"],
      isActive: true,
    });
    await staff.save();
    const token = jwt.sign(
      {
        id: staff._id,
        role: "admin",
        name: staff.name,
        isSuperAdmin: false,
        tokenVersion: 0,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const commissions = await request(app)
      .get("/api/commissions")
      .set("Authorization", `Bearer ${token}`);
    expect(commissions.status).toBe(403);

    const payouts = await request(app)
      .get("/api/admin/payouts")
      .set("Authorization", `Bearer ${token}`);
    expect(payouts.status).toBe(403);
  });

  it("Test 5: legitimate Admin authentication continues to work", async () => {
    const admin = new Admin({
      name: "Super Admin",
      username: "superadmin",
      email: "super@example.com",
      password: TEST_PASSWORD,
      isSuperAdmin: true,
      isActive: true,
      tokenVersion: 0,
    });
    await admin.save();

    const res = await request(app)
      .post("/api/admin/login")
      .send({ emailOrUsername: "super@example.com", password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.admin).toMatchObject({
      email: "super@example.com",
      isSuperAdmin: true,
    });
  });
});
