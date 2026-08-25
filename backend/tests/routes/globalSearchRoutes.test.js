/**
 * Global search routes: GET /api/search/suggestions
 */
const request = require("supertest");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { MongoMemoryServer } = require("mongodb-memory-server");

const Product = require("../../models/Product");
const Category = require("../../models/Category");
const Brand = require("../../models/brand");
const Seller = require("../../models/Seller");
const app = require("../helpers/testApp");

describe("GET /api/search/suggestions", () => {
  let mongoServer;

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  }, 60000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  beforeEach(async () => {
    await Product.deleteMany({});
    await Category.deleteMany({});
    await Brand.deleteMany({});
    await Seller.deleteMany({});

    await Category.create({ name: "Electronics", isActive: true });
    await Brand.create({ name: "Samsung", isActive: true });
    const token = `gsr-${Date.now()}`;
    await Seller.create({
      firstName: "Ravi",
      lastName: "Store",
      username: token,
      shopName: "Samsung Hub",
      shopUrl: `shop-${token}`,
      email: `${token}@test.com`,
      password: await bcrypt.hash("Test123!@#", 10),
      isApproved: true,
    });
    await Product.create({
      name: "Samsung TV",
      sku: `gsr-tv-${Date.now()}`,
      regularPrice: 30000,
      status: "published",
      approvalStatus: "approved",
      tags: ["television"],
    });
  });

  it("returns 400 when q is missing", async () => {
    const res = await request(app).get("/api/search/suggestions");
    expect(res.status).toBe(400);
  });

  it("returns 400 when q is shorter than 2 characters", async () => {
    const res = await request(app).get("/api/search/suggestions").query({ q: "S" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/at least 2 characters/i);
  });

  it("returns grouped suggestion sections for a valid q", async () => {
    const res = await request(app).get("/api/search/suggestions").query({ q: "Sam" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        products: expect.any(Array),
        categories: expect.any(Array),
        subcategories: expect.any(Array),
        childCategories: expect.any(Array),
        brands: expect.any(Array),
        sellers: expect.any(Array),
        tags: expect.any(Array),
      })
    );
    expect(res.body.brands.some((b) => b.name === "Samsung")).toBe(true);
    expect(res.body.products.some((p) => p.name === "Samsung TV")).toBe(true);
    // AAURIKAA single-store: keep sellers key, hide marketplace seller suggestions
    expect(res.body.sellers).toEqual([]);
  });

  it("accepts optional locale without changing response shape", async () => {
    const res = await request(app)
      .get("/api/search/suggestions")
      .query({ q: "Sam", locale: "en" });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.products)).toBe(true);
  });
});
