const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");

const Shopper = require("../../models/Shopper");
const googleShopperAuthService = require("../../services/googleShopperAuthService");
const googleShopperAuthController = require("../../controllers/googleShopperAuthController");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-google-auth";
process.env.GOOGLE_CLIENT_ID = "test-google-client-id.apps.googleusercontent.com";

let mongoServer;
let app;

beforeAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  app = express();
  app.use(express.json());
  app.post("/api/shopper/google", googleShopperAuthController.googleAuth);
  app.post("/api/shopper/google/link", googleShopperAuthController.linkGoogleAccount);
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

beforeEach(async () => {
  await Shopper.deleteMany({});
  jest.restoreAllMocks();
  process.env.GOOGLE_CLIENT_ID = "test-google-client-id.apps.googleusercontent.com";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-google-auth";
});

function mockGoogleIdentity(overrides = {}) {
  return jest.spyOn(googleShopperAuthService, "verifyGoogleIdToken").mockResolvedValue({
    googleId: "google-sub-100",
    email: "newuser@example.com",
    name: "New User",
    givenName: "New",
    familyName: "User",
    picture: "https://example.com/photo.jpg",
    ...overrides,
  });
}

describe("Google Shopper auth", () => {
  test("1. new Google user → JWT + shopper created with googleId", async () => {
    mockGoogleIdentity();

    const res = await request(app)
      .post("/api/shopper/google")
      .send({ idToken: "fake-id-token" })
      .expect(200);

    expect(res.body.message).toBeTruthy();
    expect(res.body.token).toBeTruthy();
    expect(res.body.shopper).toMatchObject({
      firstName: "New",
      lastName: "User",
      email: "newuser@example.com",
      profileImage: "https://example.com/photo.jpg",
    });
    expect(res.body.shopper.username).toMatch(/^newuser/);

    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
    expect(decoded).toMatchObject({
      id: String(res.body.shopper.id),
      role: "shopper",
      name: "New",
    });

    const stored = await Shopper.findById(res.body.shopper.id);
    expect(stored.googleId).toBe("google-sub-100");
    expect(stored.password).toBeTruthy();
  });

  test("2. existing googleId → JWT (no duplicate)", async () => {
    await Shopper.create({
      firstName: "Existing",
      lastName: "Google",
      username: "existinggoogle",
      email: "existing-google@example.com",
      phone: "",
      password: await bcrypt.hash("unused", 10),
      googleId: "google-sub-100",
      role: "shopper",
    });

    mockGoogleIdentity({
      email: "existing-google@example.com",
      givenName: "Existing",
      familyName: "Google",
    });

    const beforeCount = await Shopper.countDocuments();
    const res = await request(app)
      .post("/api/shopper/google")
      .send({ idToken: "fake-id-token" })
      .expect(200);

    expect(res.body.token).toBeTruthy();
    expect(res.body.shopper.email).toBe("existing-google@example.com");
    expect(await Shopper.countDocuments()).toBe(beforeCount);
  });

  test("3. existing email without googleId → 409 GOOGLE_LINK_REQUIRED (no silent link)", async () => {
    await Shopper.create({
      firstName: "Password",
      lastName: "User",
      username: "passworduser",
      email: "linked@example.com",
      phone: "9999999999",
      password: await bcrypt.hash("CorrectPass1!", 10),
      role: "shopper",
    });

    mockGoogleIdentity({
      googleId: "google-sub-link-me",
      email: "linked@example.com",
      name: "Password User",
    });

    const res = await request(app)
      .post("/api/shopper/google")
      .send({ idToken: "fake-id-token" })
      .expect(409);

    expect(res.body).toMatchObject({
      code: "GOOGLE_LINK_REQUIRED",
      email: "linked@example.com",
    });
    expect(res.body.message).toContain("already exists");
    expect(res.body.linkToken).toBeUndefined();

    const stored = await Shopper.findOne({ email: "linked@example.com" });
    expect(stored.googleId).toBeUndefined();
  });

  test("4. link with idToken + correct password → JWT + googleId set", async () => {
    await Shopper.create({
      firstName: "Password",
      lastName: "User",
      username: "passworduser2",
      email: "linkok@example.com",
      phone: "",
      password: await bcrypt.hash("CorrectPass1!", 10),
      role: "shopper",
    });

    mockGoogleIdentity({
      googleId: "google-sub-linked",
      email: "linkok@example.com",
      givenName: "Password",
      familyName: "User",
    });

    const res = await request(app)
      .post("/api/shopper/google/link")
      .send({ idToken: "fake-id-token", password: "CorrectPass1!" })
      .expect(200);

    expect(res.body.token).toBeTruthy();
    expect(res.body.shopper.email).toBe("linkok@example.com");

    const stored = await Shopper.findOne({ email: "linkok@example.com" });
    expect(stored.googleId).toBe("google-sub-linked");

    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
    expect(decoded.role).toBe("shopper");
    expect(decoded.name).toBe("Password");
  });

  test("5. link with wrong password → fail, no link", async () => {
    await Shopper.create({
      firstName: "Password",
      lastName: "User",
      username: "passworduser3",
      email: "linkfail@example.com",
      phone: "",
      password: await bcrypt.hash("CorrectPass1!", 10),
      role: "shopper",
    });

    mockGoogleIdentity({
      googleId: "google-sub-should-not-attach",
      email: "linkfail@example.com",
    });

    const res = await request(app)
      .post("/api/shopper/google/link")
      .send({ idToken: "fake-id-token", password: "WrongPassword!" })
      .expect(400);

    expect(res.body.code).toBe("INVALID_CREDENTIALS");

    const stored = await Shopper.findOne({ email: "linkfail@example.com" });
    expect(stored.googleId).toBeUndefined();
  });

  test("6a. missing GOOGLE_CLIENT_ID → error", async () => {
    delete process.env.GOOGLE_CLIENT_ID;

    const res = await request(app)
      .post("/api/shopper/google")
      .send({ idToken: "fake-id-token" })
      .expect(503);

    expect(res.body.code).toBe("GOOGLE_AUTH_NOT_CONFIGURED");
  });

  test("6b. invalid token → error", async () => {
    jest
      .spyOn(googleShopperAuthService, "verifyGoogleIdToken")
      .mockRejectedValue(
        Object.assign(new Error("Invalid Google token"), {
          status: 401,
          code: "INVALID_GOOGLE_TOKEN",
        })
      );

    const res = await request(app)
      .post("/api/shopper/google")
      .send({ idToken: "bad-token" })
      .expect(401);

    expect(res.body.code).toBe("INVALID_GOOGLE_TOKEN");
  });
});

describe("Shopper login rate-limit path", () => {
  test("server.js mounts loginLimiter on /api/shopper/login (not /api/shoppers/login)", () => {
    const serverSrc = fs.readFileSync(
      path.join(__dirname, "../../server.js"),
      "utf8"
    );
    expect(serverSrc).toMatch(/app\.use\(\s*["']\/api\/shopper\/login["']/);
    expect(serverSrc).not.toMatch(/app\.use\(\s*["']\/api\/shoppers\/login["']/);
  });
});
