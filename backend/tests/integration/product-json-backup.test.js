// backend/tests/integration/product-json-backup.test.js
// End-to-end tests for JSON Backup Export and Restore (products).

const request = require("supertest");
const mongoose = require("mongoose");

jest.mock("../../middleware/verifySeller", () => {
  const mongoose = require("mongoose");
  return (req, res, next) => {
    const id = req.headers["x-test-seller-id"];
    if (id && mongoose.Types.ObjectId.isValid(id)) {
      req.user = { _id: new mongoose.Types.ObjectId(id), role: "seller" };
      return next();
    }
    if (req.headers["authorization"]) {
      req.user = { _id: null, role: "seller" };
      return next();
    }
    res.status(401).json({ message: "Unauthorized" });
  };
});

jest.mock("../../middleware/verifyAdmin", () => {
  const mongoose = require("mongoose");
  return (req, res, next) => {
    const id = req.headers["x-test-admin-id"];
    if (id && mongoose.Types.ObjectId.isValid(id)) {
      req.user = { _id: new mongoose.Types.ObjectId(id), role: "admin" };
      return next();
    }
    if (req.headers["authorization"]) {
      req.user = { _id: null, role: "admin" };
      return next();
    }
    res.status(401).json({ message: "Unauthorized" });
  };
});

const app = require("../helpers/testApp");
const Product = require("../../models/Product");
const Seller = require("../../models/Seller");
const Admin = require("../../models/Admin");
const Category = require("../../models/Category");

describe("Product JSON Backup (Export & Import)", () => {
  let sellerId;
  let adminId;
  let categoryId;
  const authToken = "test-token";

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(
        process.env.MONGODB_TEST_URI || "mongodb://localhost:27017/test-json-backup"
      );
    }

    const [seller, admin, category] = await Promise.all([
      Seller.create({
        firstName: "Backup",
        lastName: "Seller",
        username: "backuptest",
        email: "backuptest@example.com",
        password: "password123",
        phone: "1234567890",
        shopName: "Backup Shop",
        shopUrl: "backup-shop",
        isApproved: true,
      }),
      Admin.create({
        name: "Backup Admin",
        username: "backupadmin",
        email: "backupadmin@example.com",
        password: "TestPass1!",
      }),
      Category.create({
        name: "Backup Category",
        slug: "backup-category",
        description: "For backup tests",
      }),
    ]);

    sellerId = seller._id;
    adminId = admin._id;
    categoryId = category._id;
  });

  afterAll(async () => {
    await Product.deleteMany({});
    await Seller.deleteMany({ username: "backuptest" });
    await Admin.deleteMany({ username: "backupadmin" });
    await Category.deleteMany({ slug: "backup-category" });
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  });

  beforeEach(async () => {
    await Product.deleteMany({
      $or: [{ sku: /^BACKUP-/ }, { sku: /^RESTORE-/ }],
    });
  });

  describe("Export JSON", () => {
    it("seller export returns metadata and products array", async () => {
      await Product.create({
        name: "Backup Product 1",
        sku: "BACKUP-001",
        regularPrice: 100,
        stock: 5,
        seller: sellerId,
        ownerUserId: sellerId,
        category: categoryId,
        status: "draft",
        galleryImages: ["http://example.com/g1.jpg", "http://example.com/g2.jpg"],
        variantPricing: { "Size-M": { price: 100, salePrice: 90 } },
        variantStock: { "Size-M": 10 },
        variantSku: { "Size-M": "BACKUP-001-M" },
        variantMedia: {
          "Size-M": {
            mainImage: "http://example.com/v-main.jpg",
            galleryImages: ["http://example.com/v-g1.jpg", "http://example.com/v-g2.jpg"],
            video: "",
          },
        },
      });

      const res = await request(app)
        .get("/api/seller/products/export-json")
        .set("Authorization", `Bearer ${authToken}`)
        .set("x-test-seller-id", sellerId.toString());

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/application\/json/);
      expect(res.headers["content-disposition"]).toMatch(/attachment/);

      const body = JSON.parse(res.text);
      expect(body.metadata).toBeDefined();
      expect(body.metadata.mode).toBe("json-backup");
      expect(body.metadata.version).toBe("1.0");
      expect(body.metadata.exportedAt).toBeDefined();
      expect(body.metadata.exportedBy).toBeDefined();
      expect(Array.isArray(body.products)).toBe(true);
      expect(body.products.length).toBeGreaterThanOrEqual(1);

      const product = body.products.find((p) => p.sku === "BACKUP-001");
      expect(product).toBeDefined();
      expect(product.name).toBe("Backup Product 1");
      expect(Array.isArray(product.galleryImages)).toBe(true);
      expect(product.galleryImages).toContain("http://example.com/g1.jpg");
      expect(product.galleryImages).toContain("http://example.com/g2.jpg");
      expect(product.variantMedia).toBeDefined();
      expect(product.variantMedia["Size-M"]).toBeDefined();
      expect(product.variantMedia["Size-M"].mainImage).toBe("http://example.com/v-main.jpg");
      expect(Array.isArray(product.variantMedia["Size-M"].galleryImages)).toBe(true);
      expect(product.variantMedia["Size-M"].galleryImages).toContain("http://example.com/v-g1.jpg");
      expect(product.variantMedia["Size-M"].galleryImages).toContain("http://example.com/v-g2.jpg");
      expect(product.variantPricing["Size-M"].price).toBe(100);
      expect(product.variantStock["Size-M"]).toBe(10);
      expect(product.variantSku["Size-M"]).toBe("BACKUP-001-M");
    });

    it("admin export returns all products with same structure", async () => {
      await Product.create({
        name: "Admin Backup Product",
        sku: "BACKUP-ADMIN-1",
        regularPrice: 50,
        stock: 3,
        seller: sellerId,
        ownerUserId: sellerId,
        category: categoryId,
        status: "draft",
        galleryImages: ["http://example.com/admin-g.jpg"],
      });

      const res = await request(app)
        .get("/api/admin/products/export-json")
        .set("Authorization", `Bearer ${authToken}`)
        .set("x-test-admin-id", adminId.toString());

      expect(res.status).toBe(200);
      const body = JSON.parse(res.text);
      expect(body.metadata.mode).toBe("json-backup");
      expect(Array.isArray(body.products)).toBe(true);
      const found = body.products.find((p) => p.sku === "BACKUP-ADMIN-1");
      expect(found).toBeDefined();
      expect(found.galleryImages).toEqual(["http://example.com/admin-g.jpg"]);
    });
  });

  describe("Import JSON validation", () => {
    it("rejects missing products", async () => {
      const res = await request(app)
        .post("/api/seller/products/import-json")
        .set("Authorization", `Bearer ${authToken}`)
        .set("Content-Type", "application/json")
        .set("x-test-seller-id", sellerId.toString())
        .send({ metadata: {} });

      expect(res.status).toBe(400);
      expect(res.body.message).toBeDefined();
    });

    it("rejects non-array products", async () => {
      const res = await request(app)
        .post("/api/seller/products/import-json")
        .set("Authorization", `Bearer ${authToken}`)
        .set("Content-Type", "application/json")
        .set("x-test-seller-id", sellerId.toString())
        .send({ metadata: {}, products: "not-array" });

      expect(res.status).toBe(400);
    });

    it("rejects empty products array", async () => {
      const res = await request(app)
        .post("/api/seller/products/import-json")
        .set("Authorization", `Bearer ${authToken}`)
        .set("Content-Type", "application/json")
        .set("x-test-seller-id", sellerId.toString())
        .send({ metadata: {}, products: [] });

      expect(res.status).toBe(400);
    });
  });

  describe("Import JSON insert and skip", () => {
    it("inserts products and returns inserted count", async () => {
      const payload = {
        metadata: { version: "1.0" },
        products: [
          {
            name: "Restore Product 1",
            sku: "RESTORE-001",
            regularPrice: 99,
            stock: 7,
            category: categoryId.toString(),
            status: "draft",
            galleryImages: ["http://example.com/r1.jpg", "http://example.com/r2.jpg"],
            variantPricing: { "Color-Red": { price: 99, salePrice: 89 } },
            variantStock: { "Color-Red": 7 },
            variantSku: { "Color-Red": "RESTORE-001-RED" },
            variantMedia: {
              "Color-Red": {
                mainImage: "http://example.com/red-main.jpg",
                galleryImages: ["http://example.com/red-g1.jpg"],
                video: "",
              },
            },
          },
        ],
      };

      const res = await request(app)
        .post("/api/seller/products/import-json")
        .set("Authorization", `Bearer ${authToken}`)
        .set("Content-Type", "application/json")
        .set("x-test-seller-id", sellerId.toString())
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.inserted).toBe(1);
      expect(res.body.failed).toBe(0);
      expect(Array.isArray(res.body.errors)).toBe(true);

      const saved = await Product.findOne({ sku: "RESTORE-001" }).lean();
      expect(saved).toBeDefined();
      expect(saved.name).toBe("Restore Product 1");
      expect(saved.seller.toString()).toBe(sellerId.toString());
      expect(saved.ownerUserId.toString()).toBe(sellerId.toString());
      expect(Array.isArray(saved.galleryImages)).toBe(true);
      expect(saved.galleryImages).toContain("http://example.com/r1.jpg");
      expect(saved.galleryImages).toContain("http://example.com/r2.jpg");
      expect(saved.variantMedia).toBeDefined();
      expect(saved.variantMedia["Color-Red"]).toBeDefined();
      expect(saved.variantMedia["Color-Red"].mainImage).toBe("http://example.com/red-main.jpg");
      expect(Array.isArray(saved.variantMedia["Color-Red"].galleryImages)).toBe(true);
      expect(saved.variantMedia["Color-Red"].galleryImages).toContain("http://example.com/red-g1.jpg");
      expect(saved.variantPricing["Color-Red"].price).toBe(99);
      expect(saved.variantStock["Color-Red"]).toBe(7);
      expect(saved.variantSku["Color-Red"]).toBe("RESTORE-001-RED");
    });

    it("skips product when SKU already exists", async () => {
      await Product.create({
        name: "Existing",
        sku: "RESTORE-SKIP",
        regularPrice: 1,
        stock: 0,
        seller: sellerId,
        ownerUserId: sellerId,
        category: categoryId,
        status: "draft",
      });

      const res = await request(app)
        .post("/api/seller/products/import-json")
        .set("Authorization", `Bearer ${authToken}`)
        .set("Content-Type", "application/json")
        .set("x-test-seller-id", sellerId.toString())
        .send({
          metadata: {},
          products: [
            {
              name: "Should Be Skipped",
              sku: "RESTORE-SKIP",
              regularPrice: 999,
              stock: 99,
              category: categoryId.toString(),
              status: "draft",
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.inserted).toBe(0);
      expect(res.body.skipped).toBe(1);

      const existing = await Product.findOne({ sku: "RESTORE-SKIP" }).lean();
      expect(existing.regularPrice).toBe(1);
    });
  });

  describe("E2E: Export then Import round-trip", () => {
    it("preserves main galleryImages and variantMedia (including variant galleryImages) after export-import", async () => {
      const mainGallery = ["https://cdn.example.com/main1.jpg", "https://cdn.example.com/main2.jpg"];
      const variantGallery = ["https://cdn.example.com/v1.jpg", "https://cdn.example.com/v2.jpg"];

      const created = await Product.create({
        name: "Round Trip Product",
        sku: "BACKUP-ROUNDTRIP",
        regularPrice: 200,
        stock: 10,
        seller: sellerId,
        ownerUserId: sellerId,
        category: categoryId,
        status: "draft",
        galleryImages: mainGallery,
        variantPricing: { "Size-L": { price: 200, salePrice: 180 } },
        variantStock: { "Size-L": 5 },
        variantSku: { "Size-L": "BACKUP-ROUNDTRIP-L" },
        variantMedia: {
          "Size-L": {
            mainImage: "https://cdn.example.com/v-main.jpg",
            galleryImages: variantGallery,
            video: "",
          },
        },
      });
      created.markModified("variantMedia");
      await created.save();

      const exportRes = await request(app)
        .get("/api/seller/products/export-json")
        .set("Authorization", `Bearer ${authToken}`)
        .set("x-test-seller-id", sellerId.toString());

      expect(exportRes.status).toBe(200);
      const exportBody = JSON.parse(exportRes.text);
      const exportedProduct = exportBody.products.find((p) => p.sku === "BACKUP-ROUNDTRIP");
      expect(exportedProduct).toBeDefined();
      expect(exportedProduct.galleryImages).toEqual(mainGallery);
      expect(exportedProduct.variantMedia["Size-L"].galleryImages).toEqual(variantGallery);

      await Product.deleteOne({ sku: "BACKUP-ROUNDTRIP" });

      const importPayload = {
        metadata: exportBody.metadata,
        products: exportBody.products.filter((p) => p.sku === "BACKUP-ROUNDTRIP"),
      };

      const importRes = await request(app)
        .post("/api/seller/products/import-json")
        .set("Authorization", `Bearer ${authToken}`)
        .set("Content-Type", "application/json")
        .set("x-test-seller-id", sellerId.toString())
        .send(importPayload);

      expect(importRes.status).toBe(200);
      expect(importRes.body.inserted).toBe(1);

      const restored = await Product.findOne({ sku: "BACKUP-ROUNDTRIP" }).lean();
      expect(restored).toBeDefined();
      expect(restored.name).toBe("Round Trip Product");
      expect(Array.isArray(restored.galleryImages)).toBe(true);
      expect(restored.galleryImages).toEqual(mainGallery);
      expect(restored.variantMedia).toBeDefined();
      expect(restored.variantMedia["Size-L"]).toBeDefined();
      expect(restored.variantMedia["Size-L"].mainImage).toBe("https://cdn.example.com/v-main.jpg");
      expect(Array.isArray(restored.variantMedia["Size-L"].galleryImages)).toBe(true);
      expect(restored.variantMedia["Size-L"].galleryImages).toEqual(variantGallery);
      expect(restored.variantPricing["Size-L"].price).toBe(200);
      expect(restored.variantStock["Size-L"]).toBe(5);
      expect(restored.variantSku["Size-L"]).toBe("BACKUP-ROUNDTRIP-L");
    });
  });
});
