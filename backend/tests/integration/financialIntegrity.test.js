const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

jest.mock("../../middleware/verifySeller", () => (req, res, next) => {
  const mong = require("mongoose");
  req.user = { _id: req.headers["x-test-seller-id"] ? new mong.Types.ObjectId(req.headers["x-test-seller-id"]) : new mong.Types.ObjectId(), role: "seller" };
  next();
});
jest.mock("../../middleware/verifyAdmin", () => (req, res, next) => {
  const mong = require("mongoose");
  req.user = { _id: new mong.Types.ObjectId(), role: "admin" };
  next();
});

const app = require("../helpers/testApp");
const Order = require("../../models/Order");
const Product = require("../../models/Product");
const Seller = require("../../models/Seller");
const Shopper = require("../../models/Shopper");
const Category = require("../../models/Category");
const Commission = require("../../models/Commission");
const SellerLedger = require("../../models/SellerLedger");
const Payout = require("../../models/Payout");
const { validateSellerLedgerIntegrity } = require("../../utils/financialIntegrityValidator");

let mongoServer;

beforeAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  mongoServer = await MongoMemoryReplSet.create({
    replSet: { count: 1, name: "rs0", storageEngine: "wiredTiger" },
  });
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  await Order.createCollection();
  await Product.createCollection();
  await Seller.createCollection();
  await Shopper.createCollection();
  await Category.createCollection();
  await Commission.createCollection();
  await SellerLedger.createCollection();
  await Payout.createCollection();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe("Financial integrity integration", () => {
  const orderAmount = 1000;
  const commissionRate = 10; // 10% -> commission 100, sellerNet 900
  let sellerId;
  let orderId;
  let productId;
  let categoryId;
  let buyerId;

  beforeEach(async () => {
    await Order.deleteMany({});
    await Product.deleteMany({});
    await Seller.deleteMany({});
    await Shopper.deleteMany({});
    await Category.deleteMany({});
    await Commission.deleteMany({});
    await SellerLedger.deleteMany({});
    await Payout.deleteMany({});

    const category = await Category.create({
      name: "Test Category",
      slug: "test-category",
      commissionRate: 10,
      commissionType: "percentage",
    });
    categoryId = category._id;

    const seller = await Seller.create({
      firstName: "Test",
      lastName: "Seller",
      email: "seller-fi@test.com",
      username: "sellerfi",
      password: "password123",
      phone: "1234567890",
      shopName: "Test Shop",
      shopUrl: "test-shop-fi",
      commission: 10,
      commissionType: "percentage",
      bankAccount: {
        accountNumber: "1234567890",
        accountNumberConfirm: "1234567890",
        ifscCode: "SBIN0001234",
      },
    });
    sellerId = seller._id;

    const product = await Product.create({
      name: "Test Product",
      sku: `SKU-${Date.now()}`,
      seller: sellerId,
      category: categoryId,
      regularPrice: 1000,
      salePrice: 1000,
      stock: 10,
    });
    productId = product._id;

    const buyer = await Shopper.create({
      firstName: "Buyer",
      lastName: "One",
      username: `buyer-${Date.now()}`,
      email: `buyer-${Date.now()}@test.com`,
      password: "password123",
    });
    buyerId = buyer._id;

    const order = await Order.create({
      buyer: buyerId,
      items: [
        {
          product: productId,
          quantity: 1,
          price: 1000,
          originalPrice: 1000,
        },
      ],
      totalAmount: 1000,
      status: "shipped",
      shippingCharge: 0,
    });
    orderId = order._id;
  });

  test("Delivered: ledger credits sellerNet 900, balanceAfter 900, invariant holds", async () => {
    const res = await request(app)
      .put(`/api/orders/seller/${orderId}/status`)
      .set("Authorization", "Bearer mock-token")
      .set("x-test-seller-id", sellerId.toString())
      .send({ status: "delivered" });

    expect(res.status).toBe(200);

    const ledgerEntries = await SellerLedger.find({ seller: sellerId }).sort({ createdAt: 1 });
    expect(ledgerEntries.length).toBe(1);
    expect(ledgerEntries[0].type).toBe("commission_earned");
    expect(ledgerEntries[0].amount).toBe(900);
    expect(ledgerEntries[0].balanceAfter).toBe(900);

    await expect(validateSellerLedgerIntegrity(sellerId)).resolves.not.toThrow();
  });

  test("After payout 400: balanceAfter 500, invariant holds", async () => {
    await request(app)
      .put(`/api/orders/seller/${orderId}/status`)
      .set("Authorization", "Bearer mock-token")
      .set("x-test-seller-id", sellerId.toString())
      .send({ status: "delivered" });

    const payoutRes = await request(app)
      .post("/api/seller/payouts/request")
      .set("Authorization", "Bearer mock-token")
      .set("x-test-seller-id", sellerId.toString())
      .send({ amount: 400, paymentMethod: "bank_transfer" });

    expect(payoutRes.status).toBe(201);

    const lastLedger = await SellerLedger.findOne({ seller: sellerId }).sort({ createdAt: -1 });
    expect(lastLedger.type).toBe("payout_requested");
    expect(lastLedger.balanceAfter).toBe(500);

    await expect(validateSellerLedgerIntegrity(sellerId)).resolves.not.toThrow();
  });

  test("After approve + mark paid: invariant holds", async () => {
    await request(app)
      .put(`/api/orders/seller/${orderId}/status`)
      .set("Authorization", "Bearer mock-token")
      .set("x-test-seller-id", sellerId.toString())
      .send({ status: "delivered" });

    const payoutRes = await request(app)
      .post("/api/seller/payouts/request")
      .set("Authorization", "Bearer mock-token")
      .set("x-test-seller-id", sellerId.toString())
      .send({ amount: 400, paymentMethod: "bank_transfer" });
    const payoutId = payoutRes.body.data.payout._id;

    await request(app)
      .post(`/api/admin/payouts/${payoutId}/approve`)
      .set("Authorization", "Bearer admin-token")
      .send();

    await request(app)
      .post(`/api/admin/payouts/${payoutId}/pay`)
      .set("Authorization", "Bearer admin-token")
      .send({ transactionReference: "TXN-FI-001" });

    await expect(validateSellerLedgerIntegrity(sellerId)).resolves.not.toThrow();
  });
});
