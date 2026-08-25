/**
 * Phase 1 — Order lifecycle, payment update, address mapping (ORDER.md)
 */
jest.mock("../../middleware/verifyAdmin", () => (req, res, next) => {
  req.user = { id: "admin-test-id", role: "admin", _id: "admin-test-id" };
  next();
});

jest.mock("../../services/orderFulfillmentService", () => ({
  maybeSyncShiprocket: jest.fn().mockResolvedValue(undefined),
  syncToShiprocket: jest.fn().mockResolvedValue(undefined),
}));

const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../helpers/testApp");
const Order = require("../../models/Order");
const Product = require("../../models/Product");
const { mapCheckoutAddressToDetails } = require("../../services/orderProcessingService");

describe("Phase 1 order stabilization", () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(
        process.env.MONGODB_TEST_URI || "mongodb://localhost:27017/ecommerce_test_db"
      );
    }
  });

  afterEach(async () => {
    await Order.deleteMany({ testFlag: true });
    await Product.deleteMany({ sku: { $regex: /^SKU/ } });
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  it("mapCheckoutAddressToDetails maps flat checkout fields", async () => {
    const d = await mapCheckoutAddressToDetails({
      name: "A B",
      email: "a@b.com",
      phone: "999",
      address1: "Line 1",
      address2: "Line 2",
      city: "Mumbai",
      stateId: "MH",
      zip: "400001",
    });
    expect(d.name).toBe("A B");
    expect(d.address).toContain("Line 1");
    expect(d.city).toBe("Mumbai");
    expect(d.pincode).toBe("400001");
  });

  it("POST /api/payment/update-status sets paid and is idempotent", async () => {
    const buyer = new mongoose.Types.ObjectId();
    const product = await Product.create({
      name: "P1",
      sku: `SKU-${Date.now()}`,
      regularPrice: 10,
      salePrice: 10,
      stock: 5,
      category: new mongoose.Types.ObjectId(),
      subcategory: new mongoose.Types.ObjectId(),
      brand: new mongoose.Types.ObjectId(),
      description: "t",
      mainImage: "x.jpg",
      images: ["x.jpg"],
      isActive: true,
    });

    const order = await Order.create({
      testFlag: true,
      buyer,
      items: [
        {
          product: product._id,
          quantity: 1,
          price: 10,
          originalPrice: 10,
          bulkDiscount: {
            applied: false,
            discountAmount: 0,
            discountPercentage: 0,
          },
        },
      ],
      totalAmount: 10,
      shippingCharge: 0,
      paymentMethod: "upi",
      status: "pending",
      paymentStatus: "pending",
      billingDetails: {
        name: "Test",
        address: "Addr",
        city: "City",
        state: "ST",
        pincode: "110001",
      },
      shippingDetails: {
        name: "Test",
        address: "Addr",
        city: "City",
        state: "ST",
        pincode: "110001",
      },
    });

    const auth = { Authorization: "Bearer admin-token" };

    const r1 = await request(app)
      .post("/api/payment/update-status")
      .set(auth)
      .send({ orderId: order._id.toString(), status: "success", transactionId: "txn-1" });

    expect(r1.status).toBe(200);
    expect(r1.body.success).toBe(true);

    const updated = await Order.findById(order._id);
    expect(updated.paymentStatus).toBe("success");
    expect(updated.status).toBe("paid");
    expect(updated.paymentTransactionId).toBe("txn-1");

    const r2 = await request(app)
      .post("/api/payment/update-status")
      .set(auth)
      .send({ orderId: order._id.toString(), status: "success", transactionId: "txn-2" });

    expect(r2.status).toBe(200);
    expect(r2.body.data.paymentStatus).toBe("success");
    const again = await Order.findById(order._id);
    expect(again.paymentTransactionId).toBe("txn-1");
  });

  it("admin rejects invalid status transition pending -> delivered", async () => {
    const buyer = new mongoose.Types.ObjectId();
    const product = await Product.create({
      name: "P2",
      sku: `SKU2-${Date.now()}`,
      regularPrice: 10,
      salePrice: 10,
      stock: 5,
      category: new mongoose.Types.ObjectId(),
      subcategory: new mongoose.Types.ObjectId(),
      brand: new mongoose.Types.ObjectId(),
      description: "t",
      mainImage: "x.jpg",
      images: ["x.jpg"],
      isActive: true,
    });

    const order = await Order.create({
      testFlag: true,
      buyer,
      items: [
        {
          product: product._id,
          quantity: 1,
          price: 10,
          originalPrice: 10,
          bulkDiscount: {
            applied: false,
            discountAmount: 0,
            discountPercentage: 0,
          },
        },
      ],
      totalAmount: 10,
      shippingCharge: 0,
      paymentMethod: "cod",
      status: "pending",
      paymentStatus: "pending",
      billingDetails: { name: "T", address: "A", city: "C", state: "S", pincode: "1" },
      shippingDetails: { name: "T", address: "A", city: "C", state: "S", pincode: "1" },
    });

    const res = await request(app)
      .put(`/api/admin/orders/${order._id}/status`)
      .set({ Authorization: "Bearer admin-token" })
      .send({ status: "delivered" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
