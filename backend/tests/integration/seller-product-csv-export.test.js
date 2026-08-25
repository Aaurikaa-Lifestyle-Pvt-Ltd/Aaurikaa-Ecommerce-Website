// Ensures seller CSV export is scoped to the authenticated seller only.

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
    res.status(401).json({ message: "Unauthorized" });
  };
});

const app = require("../helpers/testApp");
const Product = require("../../models/Product");
const Seller = require("../../models/Seller");
const Category = require("../../models/Category");

describe("Seller product CSV export ownership", () => {
  let sellerAId;
  let sellerBId;
  let categoryId;
  const authToken = "test-token";

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(
        process.env.MONGODB_TEST_URI || "mongodb://localhost:27017/test-seller-csv-export"
      );
    }

    const [sellerA, sellerB, category] = await Promise.all([
      Seller.create({
        firstName: "Export",
        lastName: "Alpha",
        username: "exportsellera",
        email: "exportsellera@example.com",
        password: "password123",
        phone: "1111111111",
        shopName: "Export Shop A",
        shopUrl: "export-shop-a",
        isApproved: true,
      }),
      Seller.create({
        firstName: "Export",
        lastName: "Beta",
        username: "exportsellerb",
        email: "exportsellerb@example.com",
        password: "password123",
        phone: "2222222222",
        shopName: "Export Shop B",
        shopUrl: "export-shop-b",
        isApproved: true,
      }),
      Category.create({
        name: "Export Category",
        slug: "export-csv-category",
        description: "For seller CSV export tests",
      }),
    ]);

    sellerAId = sellerA._id;
    sellerBId = sellerB._id;
    categoryId = category._id;
  });

  afterAll(async () => {
    await Product.deleteMany({ sku: /^EXPORT-CSV-/ });
    await Seller.deleteMany({ username: { $in: ["exportsellera", "exportsellerb"] } });
    await Category.deleteMany({ slug: "export-csv-category" });
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  });

  beforeEach(async () => {
    await Product.deleteMany({ sku: /^EXPORT-CSV-/ });
  });

  it("exports only the authenticated seller's products", async () => {
    await Product.create([
      {
        name: "Seller A Product",
        sku: "EXPORT-CSV-A1",
        regularPrice: 100,
        stock: 5,
        seller: sellerAId,
        ownerUserId: sellerAId,
        category: categoryId,
        status: "draft",
      },
      {
        name: "Seller B Product",
        sku: "EXPORT-CSV-B1",
        regularPrice: 200,
        stock: 3,
        seller: sellerBId,
        ownerUserId: sellerBId,
        category: categoryId,
        status: "draft",
      },
    ]);

    const res = await request(app)
      .get("/api/seller/products/export")
      .set("Authorization", `Bearer ${authToken}`)
      .set("x-test-seller-id", sellerAId.toString());

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.text).toContain("EXPORT-CSV-A1");
    expect(res.text).toContain("Seller A Product");
    expect(res.text).not.toContain("EXPORT-CSV-B1");
    expect(res.text).not.toContain("Seller B Product");
  });
});
