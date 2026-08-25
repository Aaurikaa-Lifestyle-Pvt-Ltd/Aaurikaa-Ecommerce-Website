/**
 * Spin-to-Win integration tests (Phase 5a V1)
 */

const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const app = require("../helpers/testApp");
const SpinCampaign = require("../../models/SpinCampaign");
const SpinAttempt = require("../../models/SpinAttempt");
const Coupon = require("../../models/coupon");
const Shopper = require("../../models/Shopper");
const Admin = require("../../models/Admin");
const { ELIGIBILITY } = require("../../services/spinCampaignService");

const createShopper = async () =>
  Shopper.create({
    firstName: "Spin",
    lastName: "Shopper",
    username: `spinshopper${Date.now()}`,
    email: `spinshopper${Date.now()}@test.com`,
    password: await bcrypt.hash("Test123!@#", 10),
    role: "shopper",
  });

const createAdmin = async () =>
  Admin.create({
    name: "Spin Admin",
    username: `spinadmin${Date.now()}`,
    email: `spinadmin${Date.now()}@test.com`,
    password: "Test123!@",
    role: "admin",
    isSuperAdmin: true,
  });

const shopperToken = (shopper) =>
  jwt.sign({ id: shopper._id, role: "shopper" }, process.env.JWT_SECRET || "test-secret", {
    expiresIn: "7d",
  });

const adminToken = (admin) =>
  jwt.sign(
    {
      id: admin._id,
      role: "admin",
      name: admin.name,
      isSuperAdmin: admin.isSuperAdmin,
      tokenVersion: admin.tokenVersion ?? 0,
    },
    process.env.JWT_SECRET || "test-secret",
    { expiresIn: "7d" }
  );

const baseCampaignPayload = (overrides = {}) => ({
  name: "Summer Spin",
  slug: `summer-spin-${Date.now()}`,
  status: "active",
  startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  headline: "Spin to win",
  description: "One spin per shopper",
  couponCodePrefix: "SPININT",
  segments: [
    {
      label: "10% Off",
      type: "coupon",
      weight: 100,
      displayMessage: "You won 10% off!",
      couponTemplate: {
        discountType: "percentage",
        discountValue: 10,
        minOrder: 500,
        freeShipping: false,
        validityDays: 7,
      },
    },
    {
      label: "Try Again",
      type: "lose",
      weight: 0,
      displayMessage: "Better luck next time",
    },
  ],
  ...overrides,
});

describe("Spin-to-Win integration", () => {
  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || "mongodb://localhost:27017/ecommerce_test_db");
    }
  });

  beforeEach(async () => {
    await SpinAttempt.deleteMany({});
    await SpinCampaign.deleteMany({});
    await Coupon.deleteMany({ code: /^SPININT-/ });
    await Shopper.deleteMany({ email: /spinshopper/ });
    await Admin.deleteMany({ email: /spinadmin/ });
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  it("rejects unauthenticated spin status and spin requests", async () => {
    const statusRes = await request(app).get("/api/shopper/spin/status");
    expect(statusRes.status).toBe(401);

    const spinRes = await request(app).post("/api/shopper/spin/spin");
    expect(spinRes.status).toBe(401);
  });

  it("returns no_active_campaign when nothing is configured", async () => {
    const shopper = await createShopper();
    const token = shopperToken(shopper);

    const res = await request(app)
      .get("/api/shopper/spin/status")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.eligibility).toBe(ELIGIBILITY.NO_ACTIVE_CAMPAIGN);
    expect(res.body.data.campaign).toBeNull();
  });

  it("returns campaign_inactive for draft campaigns", async () => {
    const shopper = await createShopper();
    const admin = await createAdmin();
    const token = shopperToken(shopper);

    const createRes = await request(app)
      .post("/api/admin/spin-campaigns")
      .set("Authorization", `Bearer ${adminToken(admin)}`)
      .send(baseCampaignPayload({ status: "draft" }));

    expect(createRes.status).toBe(201);
    const campaignId = createRes.body.data._id;

    const statusRes = await request(app)
      .get(`/api/shopper/spin/status?campaignId=${campaignId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.eligibility).toBe(ELIGIBILITY.CAMPAIGN_INACTIVE);

    const spinRes = await request(app)
      .post("/api/shopper/spin/spin")
      .set("Authorization", `Bearer ${token}`)
      .send({ campaignId });

    expect(spinRes.status).toBe(400);
    expect(spinRes.body.details.eligibility).toBe(ELIGIBILITY.CAMPAIGN_INACTIVE);
  });

  it("returns campaign_expired when endDate is in the past", async () => {
    const shopper = await createShopper();
    const admin = await createAdmin();
    const token = shopperToken(shopper);

    const createRes = await request(app)
      .post("/api/admin/spin-campaigns")
      .set("Authorization", `Bearer ${adminToken(admin)}`)
      .send(
        baseCampaignPayload({
          startDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        })
      );

    const campaignId = createRes.body.data._id;

    const statusRes = await request(app)
      .get(`/api/shopper/spin/status?campaignId=${campaignId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(statusRes.body.data.eligibility).toBe(ELIGIBILITY.CAMPAIGN_EXPIRED);

    const spinRes = await request(app)
      .post("/api/shopper/spin/spin")
      .set("Authorization", `Bearer ${token}`)
      .send({ campaignId });

    expect(spinRes.status).toBe(400);
    expect(spinRes.body.details.eligibility).toBe(ELIGIBILITY.CAMPAIGN_EXPIRED);
  });

  it("issues a unique one-time coupon on winning spin and persists attempt", async () => {
    const shopper = await createShopper();
    const admin = await createAdmin();
    const token = shopperToken(shopper);

    const createRes = await request(app)
      .post("/api/admin/spin-campaigns")
      .set("Authorization", `Bearer ${adminToken(admin)}`)
      .send(baseCampaignPayload());

    const campaignId = createRes.body.data._id;

    const spinRes = await request(app)
      .post("/api/shopper/spin/spin")
      .set("Authorization", `Bearer ${token}`)
      .send({ campaignId });

    expect(spinRes.status).toBe(201);
    expect(spinRes.body.data.attempt.outcome).toBe("win");
    expect(spinRes.body.data.attempt.couponCode).toMatch(/^SPININT-/);

    const attempt = await SpinAttempt.findOne({ campaignId, shopperId: shopper._id }).lean();
    expect(attempt).toBeTruthy();
    expect(String(attempt.segmentId)).toBe(String(createRes.body.data.segments[0]._id));

    const coupon = await Coupon.findById(attempt.couponId).lean();
    expect(coupon).toBeTruthy();
    expect(coupon.usageLimit).toBe(1);
    expect(coupon.perUserLimit).toBe(1);
    expect(coupon.discountType).toBe("percentage");
    expect(coupon.discountValue).toBe(10);
    expect(coupon.minOrder).toBe(500);
    expect(coupon.validTo.getTime()).toBeGreaterThan(Date.now());
  });

  it("returns 409 on duplicate spin for the same shopper and campaign", async () => {
    const shopper = await createShopper();
    const admin = await createAdmin();
    const token = shopperToken(shopper);

    const createRes = await request(app)
      .post("/api/admin/spin-campaigns")
      .set("Authorization", `Bearer ${adminToken(admin)}`)
      .send(
        baseCampaignPayload({
          segments: [
            {
              label: "No reward",
              type: "no_reward",
              weight: 100,
              displayMessage: "Thanks for playing",
            },
          ],
        })
      );

    const campaignId = createRes.body.data._id;

    const firstSpin = await request(app)
      .post("/api/shopper/spin/spin")
      .set("Authorization", `Bearer ${token}`)
      .send({ campaignId });

    expect(firstSpin.status).toBe(201);
    expect(firstSpin.body.data.attempt.outcome).toBe("no_reward");

    const secondSpin = await request(app)
      .post("/api/shopper/spin/spin")
      .set("Authorization", `Bearer ${token}`)
      .send({ campaignId });

    expect(secondSpin.status).toBe(409);
    expect(secondSpin.body.details.eligibility).toBe(ELIGIBILITY.ALREADY_SPUN);

    const statusRes = await request(app)
      .get(`/api/shopper/spin/status?campaignId=${campaignId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(statusRes.body.data.eligibility).toBe(ELIGIBILITY.ALREADY_SPUN);
    expect(statusRes.body.data.attempt.outcome).toBe("no_reward");

    const attemptCount = await SpinAttempt.countDocuments({ campaignId, shopperId: shopper._id });
    expect(attemptCount).toBe(1);
  });

  it("GET /api/spin/active hides campaigns outside the schedule window", async () => {
    const admin = await createAdmin();

    await request(app)
      .post("/api/admin/spin-campaigns")
      .set("Authorization", `Bearer ${adminToken(admin)}`)
      .send(
        baseCampaignPayload({
          slug: `future-spin-${Date.now()}`,
          startDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000).toISOString(),
        })
      );

    const previewRes = await request(app).get("/api/spin/active");
    expect(previewRes.status).toBe(200);
    expect(previewRes.body.data.campaign).toBeNull();
  });

  it("lists attempts for admin review", async () => {
    const shopper = await createShopper();
    const admin = await createAdmin();
    const token = shopperToken(shopper);

    const createRes = await request(app)
      .post("/api/admin/spin-campaigns")
      .set("Authorization", `Bearer ${adminToken(admin)}`)
      .send(baseCampaignPayload());

    const campaignId = createRes.body.data._id;

    await request(app)
      .post("/api/shopper/spin/spin")
      .set("Authorization", `Bearer ${token}`)
      .send({ campaignId });

    const attemptsRes = await request(app)
      .get(`/api/admin/spin-campaigns/${campaignId}/attempts`)
      .set("Authorization", `Bearer ${adminToken(admin)}`);

    expect(attemptsRes.status).toBe(200);
    expect(attemptsRes.body.data.items).toHaveLength(1);
    expect(attemptsRes.body.data.items[0].outcome).toBe("win");
    expect(attemptsRes.body.data.items[0].couponCode).toMatch(/^SPININT-/);
  });
});
