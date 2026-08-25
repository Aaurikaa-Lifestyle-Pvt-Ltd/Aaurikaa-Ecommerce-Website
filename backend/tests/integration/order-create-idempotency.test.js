/**
 * Order create idempotency — duplicate POST /api/orders (and /create-pending)
 * with the same Idempotency-Key must not create multiple orders or double stock.
 */

const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");

let mockBuyerId = null;

jest.mock("../../middleware/verifyShopper", () => {
  return (req, res, next) => {
    req.user = { id: mockBuyerId, role: "shopper" };
    next();
  };
});

jest.mock("../../services/orderFulfillmentService", () => ({
  maybeSyncShiprocket: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../services/orderCommerceIntegrityService", () => {
  const actual = jest.requireActual("../../services/orderCommerceIntegrityService");
  return {
    ...actual,
    onOrderCreated: jest.fn((...args) => actual.onOrderCreated(...args)),
  };
});

const orderRoutes = require("../../routes/orderRoutes");
const Order = require("../../models/Order");
const Product = require("../../models/Product");
const Shopper = require("../../models/Shopper");
const ShippingZone = require("../../models/ShippingZone");
const WeightClass = require("../../models/WeightClass");
const FlatShippingRule = require("../../models/FlatShippingRule");
const State = require("../../models/location/State");
const Country = require("../../models/location/Country");
const orderFulfillmentService = require("../../services/orderFulfillmentService");
const orderCommerceIntegrityService = require("../../services/orderCommerceIntegrityService");

const app = express();
app.use(express.json());
app.use("/api/orders", orderRoutes);

describe("Order create idempotency", () => {
  let country;
  let state;
  let weightClass;
  let product;
  let shopper;
  let zone;

  const addresses = () => ({
    billingAddress: {
      name: "Test",
      email: "idem@example.com",
      phone: "9999999999",
      address1: "Line 1",
      address2: "",
      city: "City",
      stateId: state._id,
      countryId: country._id,
      zip: "110001",
    },
    shippingAddress: {
      name: "Test",
      email: "idem@example.com",
      phone: "9999999999",
      address1: "Line 1",
      address2: "",
      city: "City",
      stateId: state._id,
      countryId: country._id,
      zip: "110001",
    },
  });

  const orderPayload = (paymentMethod, extras = {}) => ({
    items: [{ product: product._id, quantity: 1 }],
    paymentMethod,
    ...addresses(),
    coupon: null,
    paymentData: {},
    timestamp: Date.now(),
    ...extras,
  });

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(
        process.env.MONGODB_TEST_URI || "mongodb://localhost:27017/ecommerce_test_db"
      );
    }
    // Ensure partial unique index exists for concurrent tests
    await Order.syncIndexes();
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const stamp = Date.now();
    country = await Country.create({
      name: `IdemIN-${stamp}`,
      code: `I${String(stamp).slice(-4)}`,
    });
    state = await State.create({
      name: `IdemState-${stamp}`,
      country: country._id,
    });
    zone = await ShippingZone.create({
      name: `IdemZone-${stamp}`,
      code: `IZ${String(stamp).slice(-4)}`,
      country: "IN",
      states: [state.name],
      active: true,
    });
    weightClass = await WeightClass.create({
      name: `IdemLight-${stamp}`,
      minWeightG: 0,
      maxWeightG: 2000,
      active: true,
      sortOrder: 1,
    });
    await FlatShippingRule.create({
      zone: zone._id,
      weightClass: weightClass._id,
      rateINR: 40,
      active: true,
    });

    shopper = await Shopper.create({
      firstName: "Idem",
      lastName: "Shopper",
      username: `idem-${stamp}`,
      email: `idem-${stamp}@example.com`,
      password: "password123",
      phone: "9999999999",
    });
    mockBuyerId = shopper._id.toString();

    product = await Product.create({
      testFlag: true,
      name: "Idem Product",
      sku: `IDEM-${stamp}`,
      regularPrice: 100,
      salePrice: 100,
      stock: 10,
      category: new mongoose.Types.ObjectId(),
      subcategory: new mongoose.Types.ObjectId(),
      brand: new mongoose.Types.ObjectId(),
      description: "t",
      mainImage: "x.jpg",
      images: ["x.jpg"],
      isActive: true,
      taxRate: 18,
      weight: 500,
      weightClass: weightClass._id,
      bulkDiscount: { enabled: false, tiers: [] },
      salesCount: 0,
    });
  });

  afterEach(async () => {
    if (shopper?._id) {
      await Order.deleteMany({ buyer: shopper._id });
      await Shopper.deleteOne({ _id: shopper._id });
    }
    if (product?._id) await Product.deleteOne({ _id: product._id });
    if (zone?._id) {
      await FlatShippingRule.deleteMany({ zone: zone._id });
      await ShippingZone.deleteOne({ _id: zone._id });
    }
    if (weightClass?._id) await WeightClass.deleteOne({ _id: weightClass._id });
    if (country?._id) {
      await State.deleteMany({ country: country._id });
      await Country.deleteOne({ _id: country._id });
    }
  });

  it("identical duplicate request returns same order id; one Order document", async () => {
    const key = `idem-seq-${Date.now()}`;
    const body = orderPayload("cod");

    const first = await request(app)
      .post("/api/orders")
      .set("Authorization", "Bearer mock")
      .set("Idempotency-Key", key)
      .send(body);

    expect(first.status).toBe(201);
    expect(first.body.order).toBeDefined();
    expect(first.body.idempotentReplay).toBeUndefined();

    const second = await request(app)
      .post("/api/orders")
      .set("Authorization", "Bearer mock")
      .set("Idempotency-Key", key)
      .send(body);

    expect(second.status).toBe(200);
    expect(second.body.idempotentReplay).toBe(true);
    expect(String(second.body.order._id)).toBe(String(first.body.order._id));

    const count = await Order.countDocuments({
      buyer: shopper._id,
      checkoutIdempotencyKey: key,
    });
    expect(count).toBe(1);
  });

  it("concurrent duplicate requests with same key yield one Order and same id", async () => {
    const key = `idem-conc-${Date.now()}`;
    const body = orderPayload("cod");

    const [a, b] = await Promise.all([
      request(app)
        .post("/api/orders")
        .set("Authorization", "Bearer mock")
        .set("Idempotency-Key", key)
        .send(body),
      request(app)
        .post("/api/orders")
        .set("Authorization", "Bearer mock")
        .set("Idempotency-Key", key)
        .send(body),
    ]);

    expect([201, 200]).toContain(a.status);
    expect([201, 200]).toContain(b.status);
    expect(a.body.order).toBeDefined();
    expect(b.body.order).toBeDefined();
    expect(String(a.body.order._id)).toBe(String(b.body.order._id));

    const count = await Order.countDocuments({
      buyer: shopper._id,
      checkoutIdempotencyKey: key,
    });
    expect(count).toBe(1);

    const updated = await Product.findById(product._id);
    expect(updated.stock).toBe(9);
  });

  it("COD duplicate submission reserves/commits inventory only once", async () => {
    const key = `idem-cod-${Date.now()}`;
    const body = orderPayload("cod");

    const first = await request(app)
      .post("/api/orders")
      .set("Authorization", "Bearer mock")
      .set("Idempotency-Key", key)
      .send(body);
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/orders")
      .set("Authorization", "Bearer mock")
      .set("Idempotency-Key", key)
      .send(body);
    expect(second.status).toBe(200);
    expect(second.body.idempotentReplay).toBe(true);

    expect(orderCommerceIntegrityService.onOrderCreated).toHaveBeenCalledTimes(1);
    expect(orderFulfillmentService.maybeSyncShiprocket).toHaveBeenCalledTimes(1);

    const updated = await Product.findById(product._id);
    expect(updated.stock).toBe(9);

    const saved = await Order.findById(first.body.order._id);
    expect(saved.inventoryLifecycle.state).toBe("committed");
    expect(saved.status).toBe("processing");
  });

  it("phonepe duplicate submission creates one unpaid order and reserves stock once", async () => {
    const key = `idem-pp-${Date.now()}`;
    const body = orderPayload("phonepe");

    const first = await request(app)
      .post("/api/orders/create-pending")
      .set("Authorization", "Bearer mock")
      .set("Idempotency-Key", key)
      .send(body);
    expect(first.status).toBe(201);
    expect(first.body.order.status).toBe("pending");
    expect(first.body.order.paymentStatus).toBe("pending");

    const second = await request(app)
      .post("/api/orders/create-pending")
      .set("Authorization", "Bearer mock")
      .set("Idempotency-Key", key)
      .send(body);
    expect(second.status).toBe(200);
    expect(String(second.body.order._id)).toBe(String(first.body.order._id));

    expect(orderCommerceIntegrityService.onOrderCreated).toHaveBeenCalledTimes(1);
    expect(orderFulfillmentService.maybeSyncShiprocket).not.toHaveBeenCalled();

    const updated = await Product.findById(product._id);
    expect(updated.stock).toBe(9);

    const saved = await Order.findById(first.body.order._id);
    expect(saved.inventoryLifecycle.state).toBe("reserved");
    expect(saved.paymentMethod).toBe("phonepe");
  });

  it("replay returns existing order result (same shape fields)", async () => {
    const key = `idem-replay-${Date.now()}`;
    const body = orderPayload("cod");

    const first = await request(app)
      .post("/api/orders")
      .set("Authorization", "Bearer mock")
      .set("Idempotency-Key", key)
      .send(body);

    const second = await request(app)
      .post("/api/orders")
      .set("Authorization", "Bearer mock")
      .set("Idempotency-Key", key)
      .send(body);

    expect(second.body.message).toContain("Order created successfully");
    expect(second.body.order).toBeDefined();
    expect(second.body.invoiceNumber).toBe(first.body.invoiceNumber);
    expect(second.body.bulkDiscountSummary).toBeDefined();
    expect(second.body.idempotentReplay).toBe(true);
  });

  it("different keys or missing keys can still create separate orders", async () => {
    const body = orderPayload("cod");

    const a = await request(app)
      .post("/api/orders")
      .set("Authorization", "Bearer mock")
      .set("Idempotency-Key", `key-a-${Date.now()}`)
      .send(body);
    const b = await request(app)
      .post("/api/orders")
      .set("Authorization", "Bearer mock")
      .set("Idempotency-Key", `key-b-${Date.now()}`)
      .send(body);
    const c = await request(app)
      .post("/api/orders")
      .set("Authorization", "Bearer mock")
      .send(body);
    const d = await request(app)
      .post("/api/orders")
      .set("Authorization", "Bearer mock")
      .send(body);

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(c.status).toBe(201);
    expect(d.status).toBe(201);

    const ids = [
      String(a.body.order._id),
      String(b.body.order._id),
      String(c.body.order._id),
      String(d.body.order._id),
    ];
    expect(new Set(ids).size).toBe(4);

    const updated = await Product.findById(product._id);
    expect(updated.stock).toBe(6);
  });

  it("accepts body.idempotencyKey fallback when header absent", async () => {
    const key = `idem-body-${Date.now()}`;
    const body = orderPayload("cod", { idempotencyKey: key });

    const first = await request(app)
      .post("/api/orders")
      .set("Authorization", "Bearer mock")
      .send(body);
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/orders")
      .set("Authorization", "Bearer mock")
      .send(body);
    expect(second.status).toBe(200);
    expect(String(second.body.order._id)).toBe(String(first.body.order._id));
  });

  it("stock-fail clears checkoutIdempotencyKey so same key can create after restock", async () => {
    const key = `idem-stockfail-${Date.now()}`;
    const body = orderPayload("cod");

    orderCommerceIntegrityService.onOrderCreated
      .mockResolvedValueOnce({ success: false, error: "Insufficient stock (simulated)" })
      .mockImplementation((...args) =>
        jest.requireActual("../../services/orderCommerceIntegrityService").onOrderCreated(...args)
      );

    const failed = await request(app)
      .post("/api/orders")
      .set("Authorization", "Bearer mock")
      .set("Idempotency-Key", key)
      .send(body);
    expect(failed.status).toBe(409);

    const cancelled = await Order.findOne({ buyer: shopper._id }).sort({ createdAt: -1 });
    expect(cancelled).toBeTruthy();
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.checkoutIdempotencyKey == null || cancelled.checkoutIdempotencyKey === "").toBe(
      true
    );

    const retry = await request(app)
      .post("/api/orders")
      .set("Authorization", "Bearer mock")
      .set("Idempotency-Key", key)
      .send(body);
    expect(retry.status).toBe(201);
    expect(String(retry.body.order._id)).not.toBe(String(cancelled._id));
    expect(retry.body.order.status).toBe("processing");
  });
});
