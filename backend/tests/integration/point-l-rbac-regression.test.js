/**
 * Point L — RBAC Phase 5 full regression matrix.
 * Covers authentication, authorization, revocation, registration restriction,
 * and direct API access with PERMISSION_ENFORCEMENT=true.
 */
const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { MongoMemoryServer } = require("mongodb-memory-server");

const Admin = require("../../models/Admin");
const adminRoutes = require("../../routes/adminRoutes");
const { withAdminAuth } = require("../../utils/adminAuthChain");
const { resetEnforcementCache } = require("../../config/permissionEnforcement");
const { ERROR_CODES } = require("../../utils/errorHandler");

const TEST_PASSWORD = "TestPassword123!";

const signAdminToken = (admin) =>
  jwt.sign(
    {
      id: admin._id,
      role: "admin",
      name: admin.name,
      isSuperAdmin: admin.isSuperAdmin ?? false,
      tokenVersion: admin.tokenVersion ?? 0,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

describe("Point L RBAC regression (Phase 5)", () => {
  let mongoServer;
  let app;
  let superAdmin;
  let superToken;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
    process.env.PERMISSION_ENFORCEMENT = "true";
    process.env.PERMISSION_ENFORCED_DOMAINS = "*";
    resetEnforcementCache();

    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }

    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    app = express();
    app.use(express.json());
    app.use("/api/admin", adminRoutes);

    app.get(
      "/api/admin/test/catalog-view",
      ...withAdminAuth("catalog", "view"),
      (_req, res) => res.json({ success: true, action: "view" })
    );
    app.delete(
      "/api/admin/test/catalog-manage",
      ...withAdminAuth("catalog", "manage"),
      (_req, res) => res.json({ success: true, action: "manage" })
    );
    app.post(
      "/api/admin/test/finance-approve",
      ...withAdminAuth("finance", "approve"),
      (_req, res) => res.json({ success: true, action: "approve" })
    );
    app.post(
      "/api/admin/test/orders-fulfill",
      ...withAdminAuth("orders", "fulfill"),
      (_req, res) => res.json({ success: true, action: "fulfill" })
    );
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Admin.deleteMany({});

    superAdmin = new Admin({
      name: "Super Admin",
      username: "superadmin",
      email: "super@example.com",
      password: TEST_PASSWORD,
      isSuperAdmin: true,
      isActive: true,
      tokenVersion: 0,
    });
    await superAdmin.save();
    superToken = signAdminToken(superAdmin);
  });

  describe("Authentication", () => {
    it("issues token and admin payload for Super Admin login", async () => {
      const res = await request(app)
        .post("/api/admin/login")
        .send({ emailOrUsername: "super@example.com", password: TEST_PASSWORD })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.admin).toMatchObject({
        email: "super@example.com",
        isSuperAdmin: true,
        permissions: [],
      });
    });

    it("rejects inactive admin at login", async () => {
      superAdmin.isActive = false;
      await superAdmin.save({ validateBeforeSave: false });

      const res = await request(app)
        .post("/api/admin/login")
        .send({ emailOrUsername: "super@example.com", password: TEST_PASSWORD })
        .expect(403);

      expect(res.body.code).toBe(ERROR_CODES.AUTH_ACCESS_DENIED);
    });

    it("returns isSuperAdmin and permissions from /api/admin/me", async () => {
      const res = await request(app)
        .get("/api/admin/me")
        .set(authHeader(superToken))
        .expect(200);

      expect(res.body.data.isSuperAdmin).toBe(true);
      expect(res.body.data.permissions).toEqual([]);
    });
  });

  describe("Authorization", () => {
    it("allows Super Admin through all permission gates", async () => {
      await request(app)
        .get("/api/admin/test/catalog-view")
        .set(authHeader(superToken))
        .expect(200);

      await request(app)
        .delete("/api/admin/test/catalog-manage")
        .set(authHeader(superToken))
        .expect(200);

      await request(app)
        .post("/api/admin/test/finance-approve")
        .set(authHeader(superToken))
        .expect(200);

      await request(app)
        .post("/api/admin/test/orders-fulfill")
        .set(authHeader(superToken))
        .expect(200);
    });

    it("allows catalog:view but blocks catalog:manage for view-only staff", async () => {
      const staff = new Admin({
        name: "Catalog Viewer",
        username: "catalogview",
        email: "catalogview@example.com",
        password: TEST_PASSWORD,
        permissions: ["catalog:view"],
        isActive: true,
      });
      await staff.save();
      const token = signAdminToken(staff);

      await request(app)
        .get("/api/admin/test/catalog-view")
        .set(authHeader(token))
        .expect(200);

      const denied = await request(app)
        .delete("/api/admin/test/catalog-manage")
        .set(authHeader(token))
        .expect(403);

      expect(denied.body.code).toBe(ERROR_CODES.AUTH_ACCESS_DENIED);
    });

    it("blocks finance:approve without permission", async () => {
      const staff = new Admin({
        name: "Finance Viewer",
        username: "financeview",
        email: "financeview@example.com",
        password: TEST_PASSWORD,
        permissions: ["finance:view"],
        isActive: true,
      });
      await staff.save();
      const token = signAdminToken(staff);

      const res = await request(app)
        .post("/api/admin/test/finance-approve")
        .set(authHeader(token))
        .expect(403);

      expect(res.body.code).toBe(ERROR_CODES.AUTH_ACCESS_DENIED);
    });

    it("requires orders:fulfill for fulfillment endpoints", async () => {
      const orderStaff = new Admin({
        name: "Order Manager",
        username: "ordermgr",
        email: "ordermgr@example.com",
        password: TEST_PASSWORD,
        permissions: ["orders:view", "orders:manage"],
        isActive: true,
      });
      await orderStaff.save();
      const token = signAdminToken(orderStaff);

      const res = await request(app)
        .post("/api/admin/test/orders-fulfill")
        .set(authHeader(token))
        .expect(403);

      expect(res.body.code).toBe(ERROR_CODES.AUTH_ACCESS_DENIED);
    });
  });

  describe("Permission assignment and revocation", () => {
    it("Super Admin creates Editor staff with checkbox permissions", async () => {
      const res = await request(app)
        .post("/api/admin/users")
        .set(authHeader(superToken))
        .send({
          name: "Editor User",
          username: "editoruser",
          email: "editor@example.com",
          password: TEST_PASSWORD,
          displayLabel: "Editor",
          permissions: ["content:view", "content:manage", "cms:manage"],
        })
        .expect(201);

      expect(res.body.data.user).toMatchObject({
        email: "editor@example.com",
        displayLabel: "Editor",
        permissions: ["content:view", "content:manage", "cms:manage"],
        isSuperAdmin: false,
        isActive: true,
      });
    });

    it("rejects weak passwords when creating staff", async () => {
      const res = await request(app)
        .post("/api/admin/users")
        .set(authHeader(superToken))
        .send({
          name: "Weak Staff",
          username: "weakstaff",
          email: "weak@example.com",
          password: "password1",
          permissions: ["catalog:view"],
        })
        .expect(400);

      expect(res.body.message).toBe("Password does not meet requirements");
      expect(res.body.details.validationErrors[0]).toContain("special character");
    });

    it("rejects weak passwords when updating staff password", async () => {
      const staff = new Admin({
        name: "Mutable Staff",
        username: "mutablepw",
        email: "mutablepw@example.com",
        password: TEST_PASSWORD,
        permissions: ["catalog:view"],
        isActive: true,
      });
      await staff.save();

      const res = await request(app)
        .patch(`/api/admin/users/${staff._id}`)
        .set(authHeader(superToken))
        .send({ password: "12345678" })
        .expect(400);

      expect(res.body.message).toBe("Password does not meet requirements");
      expect(res.body.details.validationErrors[0]).toContain("special character");
    });

    it("updates staff permissions without password validation when password omitted", async () => {
      const staff = new Admin({
        name: "Permission Staff",
        username: "permstaff",
        email: "permstaff@example.com",
        password: TEST_PASSWORD,
        permissions: ["catalog:view"],
        isActive: true,
      });
      await staff.save();

      const res = await request(app)
        .patch(`/api/admin/users/${staff._id}`)
        .set(authHeader(superToken))
        .send({
          displayLabel: "Editor",
          permissions: ["catalog:view", "catalog:manage"],
        })
        .expect(200);

      expect(res.body.data.user).toMatchObject({
        displayLabel: "Editor",
        permissions: ["catalog:view", "catalog:manage"],
      });

      const unchanged = await Admin.findById(staff._id);
      expect(await unchanged.comparePassword(TEST_PASSWORD)).toBe(true);
    });

    it("bumps tokenVersion on permission change and invalidates old JWT", async () => {
      const staff = new Admin({
        name: "Mutable Staff",
        username: "mutable",
        email: "mutable@example.com",
        password: TEST_PASSWORD,
        permissions: ["catalog:view"],
        isActive: true,
      });
      await staff.save();
      const oldToken = signAdminToken(staff);

      await request(app)
        .patch(`/api/admin/users/${staff._id}`)
        .set(authHeader(superToken))
        .send({ permissions: ["catalog:view", "catalog:manage"] })
        .expect(200);

      const revoked = await request(app)
        .get("/api/admin/me")
        .set(authHeader(oldToken))
        .expect(403);

      expect(revoked.body.code).toBe(ERROR_CODES.AUTH_TOKEN_INVALID);
    });

    it("returns 403 immediately when staff is deactivated", async () => {
      const staff = new Admin({
        name: "Deactivate Me",
        username: "deactivate",
        email: "deactivate@example.com",
        password: TEST_PASSWORD,
        permissions: ["catalog:view"],
        isActive: true,
      });
      await staff.save();
      const token = signAdminToken(staff);

      await request(app)
        .patch(`/api/admin/users/${staff._id}`)
        .set(authHeader(superToken))
        .send({ isActive: false })
        .expect(200);

      const res = await request(app)
        .get("/api/admin/me")
        .set(authHeader(token))
        .expect(403);

      expect(res.body.code).toBe(ERROR_CODES.AUTH_ACCESS_DENIED);
    });
  });

  describe("Disabled users", () => {
    it("blocks deactivated admin from logging in", async () => {
      const staff = new Admin({
        name: "Inactive Staff",
        username: "inactive",
        email: "inactive@example.com",
        password: TEST_PASSWORD,
        isActive: false,
      });
      await staff.save();

      const res = await request(app)
        .post("/api/admin/login")
        .send({ emailOrUsername: "inactive@example.com", password: TEST_PASSWORD })
        .expect(403);

      expect(res.body.code).toBe(ERROR_CODES.AUTH_ACCESS_DENIED);
    });
  });

  describe("Direct API access", () => {
    it("returns 401 without JWT", async () => {
      const res = await request(app).get("/api/admin/test/catalog-view").expect(401);
      expect(res.body.message).toContain("No token");
    });

    it("returns 403 with valid JWT but missing permission", async () => {
      const staff = new Admin({
        name: "No Catalog",
        username: "nocatalog",
        email: "nocatalog@example.com",
        password: TEST_PASSWORD,
        permissions: [],
        isActive: true,
      });
      await staff.save();
      const token = signAdminToken(staff);

      const res = await request(app)
        .get("/api/admin/test/catalog-view")
        .set(authHeader(token))
        .expect(403);

      expect(res.body.code).toBe(ERROR_CODES.AUTH_ACCESS_DENIED);
    });
  });

  describe("Registration restriction", () => {
    it("returns 403 for public POST /api/admin/register", async () => {
      const res = await request(app)
        .post("/api/admin/register")
        .send({
          name: "Public Admin",
          username: "publicadmin",
          email: "public@example.com",
          password: TEST_PASSWORD,
        })
        .expect(403);

      expect(res.body.code).toBe(ERROR_CODES.AUTH_ACCESS_DENIED);
    });

    it("returns 403 for public POST /api/admin/verify-registration", async () => {
      const res = await request(app)
        .post("/api/admin/verify-registration")
        .send({ email: "public@example.com", otp: "123456" })
        .expect(403);

      expect(res.body.code).toBe(ERROR_CODES.AUTH_ACCESS_DENIED);
    });
  });

  describe("Enforcement flag off rollback", () => {
    it("allows staff without permissions when PERMISSION_ENFORCEMENT=false", async () => {
      process.env.PERMISSION_ENFORCEMENT = "false";
      resetEnforcementCache();

      const staff = new Admin({
        name: "Rollback Staff",
        username: "rollback",
        email: "rollback@example.com",
        password: TEST_PASSWORD,
        permissions: [],
        isActive: true,
      });
      await staff.save();
      const token = signAdminToken(staff);

      await request(app)
        .get("/api/admin/test/catalog-view")
        .set(authHeader(token))
        .expect(200);

      process.env.PERMISSION_ENFORCEMENT = "true";
      resetEnforcementCache();
    });
  });
});
