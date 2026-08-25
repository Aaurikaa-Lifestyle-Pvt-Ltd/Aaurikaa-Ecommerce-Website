const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");

process.env.PHONEPE_CLIENT_ID = process.env.PHONEPE_CLIENT_ID || "test_client_id";
process.env.PHONEPE_CLIENT_SECRET = process.env.PHONEPE_CLIENT_SECRET || "test_client_secret";
process.env.PHONEPE_CLIENT_VERSION = process.env.PHONEPE_CLIENT_VERSION || "1";
process.env.PHONEPE_ENV = process.env.PHONEPE_ENV || "UAT";

let mockBuyerId = null;

jest.mock("../../middleware/verifyShopper", () => {
  return (req, res, next) => {
    req.user = { id: mockBuyerId, role: "shopper" };
    next();
  };
});

jest.mock("../../services/phonePeService", () => ({
  createPaymentRequest: jest.fn().mockResolvedValue({ redirectUrl: "https://payment.phonepe.com/redirect" }),
  checkPaymentStatus: jest.fn(),
  isV2Enabled: jest.fn().mockReturnValue(true),
}));

jest.mock("../../services/orderFulfillmentService", () => ({
  maybeSyncShiprocket: jest.fn().mockResolvedValue(undefined),
}));

const paymentRoutes = require("../../routes/paymentRoutes");
const orderRoutes = require("../../routes/orderRoutes");
const Order = require("../../models/Order");
const Product = require("../../models/Product");
const ShippingZone = require("../../models/ShippingZone");
const WeightClass = require("../../models/WeightClass");
const FlatShippingRule = require("../../models/FlatShippingRule");
const State = require("../../models/location/State");
const Country = require("../../models/location/Country");
const phonePeService = require("../../services/phonePeService");
const orderFulfillmentService = require("../../services/orderFulfillmentService");

const app = express();
app.use(express.json());
app.use("/api/payment", paymentRoutes);
app.use("/api/orders", orderRoutes);

describe("Phase 2 - PhonePe V2 Integration", () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || "mongodb://localhost:27017/ecommerce_test_db");
    }
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await Order.deleteMany({ testFlag: true });
    await Product.deleteMany({ testFlag: true });
    mockBuyerId = new mongoose.Types.ObjectId();

    jest.clearAllMocks();
  });

  describe("Payment endpoints", () => {
    it("initiates payment for a pending order and persists transaction id", async () => {
      const order = await Order.create({
        testFlag: true,
        buyer: mockBuyerId,
        items: [
          {
            product: new mongoose.Types.ObjectId(),
            quantity: 1,
            price: 10,
            originalPrice: 10,
            bulkDiscount: { applied: false, discountAmount: 0, discountPercentage: 0, tierUsed: null },
          },
        ],
        totalAmount: 10,
        shippingCharge: 0,
        paymentMethod: "phonepe",
        paymentStatus: "pending",
        status: "pending",
        billingDetails: { name: "T", address: "A", city: "C", state: "S", pincode: "110001", country: "India" },
        shippingDetails: { name: "T", address: "A", city: "C", state: "S", pincode: "110001", country: "India" },
      });

      phonePeService.createPaymentRequest.mockResolvedValue({ redirectUrl: "https://payment.phonepe.com/redirect" });

      const initiateResp = await request(app)
        .post("/api/payment/initiate")
        .send({ orderId: order._id.toString() });

      expect(initiateResp.status).toBe(200);
      expect(initiateResp.body.success).toBe(true);
      expect(initiateResp.body.data.redirectUrl).toBe("https://payment.phonepe.com/redirect");

      const { transactionId } = initiateResp.body.data;
      const afterInit = await Order.findById(order._id);
      expect(afterInit.paymentTransactionId).toBe(transactionId);
    });

    it("POST /verify marks order paid when PhonePe returns COMPLETED", async () => {
      const order = await Order.create({
        testFlag: true,
        buyer: mockBuyerId,
        items: [
          {
            product: new mongoose.Types.ObjectId(),
            quantity: 1,
            price: 10,
            originalPrice: 10,
            bulkDiscount: { applied: false, discountAmount: 0, discountPercentage: 0, tierUsed: null },
          },
        ],
        totalAmount: 10,
        shippingCharge: 0,
        paymentMethod: "phonepe",
        paymentStatus: "pending",
        status: "pending",
        paymentTransactionId: "TXN_test_1",
        billingDetails: { name: "T", address: "A", city: "C", state: "S", pincode: "110001", country: "India" },
        shippingDetails: { name: "T", address: "A", city: "C", state: "S", pincode: "110001", country: "India" },
      });

      phonePeService.checkPaymentStatus.mockResolvedValueOnce({ state: "COMPLETED", amount: 1000 });

      const verifyResp = await request(app)
        .post("/api/payment/verify")
        .send({ orderId: order._id.toString() });

      expect(verifyResp.status).toBe(200);
      expect(verifyResp.body.success).toBe(true);

      const updated = await Order.findById(order._id);
      expect(updated.paymentStatus).toBe("success");
      expect(updated.status).toBe("paid");
      expect(updated.paymentDetails?.paymentType).toBe("ONLINE");
      expect(updated.paymentDetails?.gateway).toBe("PHONEPE");
      expect(updated.paymentDetails?.paymentStatus).toBe("PAID");
      expect(phonePeService.checkPaymentStatus).toHaveBeenCalledWith(
        "TXN_test_1",
        { details: true }
      );
      expect(orderFulfillmentService.maybeSyncShiprocket).toHaveBeenCalled();
    });

    it("POST /verify refuses COMPLETED when PhonePe amount mismatches order total", async () => {
      const order = await Order.create({
        testFlag: true,
        buyer: mockBuyerId,
        items: [
          {
            product: new mongoose.Types.ObjectId(),
            quantity: 1,
            price: 10,
            originalPrice: 10,
            bulkDiscount: { applied: false, discountAmount: 0, discountPercentage: 0, tierUsed: null },
          },
        ],
        totalAmount: 10,
        shippingCharge: 0,
        paymentMethod: "phonepe",
        paymentStatus: "pending",
        status: "pending",
        paymentTransactionId: "TXN_amt_mismatch",
        billingDetails: { name: "T", address: "A", city: "C", state: "S", pincode: "110001", country: "India" },
        shippingDetails: { name: "T", address: "A", city: "C", state: "S", pincode: "110001", country: "India" },
      });

      phonePeService.checkPaymentStatus.mockResolvedValueOnce({ state: "COMPLETED", amount: 1 });

      const verifyResp = await request(app)
        .post("/api/payment/verify")
        .send({ orderId: order._id.toString() });

      expect(verifyResp.status).toBe(200);
      expect(verifyResp.body.status).toBe("pending");

      const updated = await Order.findById(order._id);
      expect(updated.paymentStatus).toBe("pending");
      expect(updated.status).toBe("pending_verification");
      expect(orderFulfillmentService.maybeSyncShiprocket).not.toHaveBeenCalled();
    });

    it("POST /verify failure path cancels order when PhonePe returns FAILED", async () => {
      const order = await Order.create({
        testFlag: true,
        buyer: mockBuyerId,
        items: [
          {
            product: new mongoose.Types.ObjectId(),
            quantity: 1,
            price: 10,
            originalPrice: 10,
            bulkDiscount: { applied: false, discountAmount: 0, discountPercentage: 0, tierUsed: null },
          },
        ],
        totalAmount: 10,
        shippingCharge: 0,
        paymentMethod: "phonepe",
        paymentStatus: "pending",
        status: "pending",
        paymentTransactionId: "TXN_test_1",
        billingDetails: { name: "T", address: "A", city: "C", state: "S", pincode: "110001", country: "India" },
        shippingDetails: { name: "T", address: "A", city: "C", state: "S", pincode: "110001", country: "India" },
      });

      phonePeService.checkPaymentStatus.mockResolvedValueOnce({ state: "FAILED" });

      const verifyResp = await request(app)
        .post("/api/payment/verify")
        .send({ orderId: order._id.toString() });

      expect(verifyResp.status).toBe(200);
      const updated = await Order.findById(order._id);
      expect(updated.paymentStatus).toBe("failed");
      expect(updated.status).toBe("cancelled");
    });

    it("POST /verify is idempotent when already paid", async () => {
      const order = await Order.create({
        testFlag: true,
        buyer: mockBuyerId,
        items: [
          {
            product: new mongoose.Types.ObjectId(),
            quantity: 1,
            price: 10,
            originalPrice: 10,
            bulkDiscount: { applied: false, discountAmount: 0, discountPercentage: 0, tierUsed: null },
          },
        ],
        totalAmount: 10,
        shippingCharge: 0,
        paymentMethod: "phonepe",
        paymentStatus: "success",
        status: "paid",
        paymentTransactionId: "TXN_dup",
        billingDetails: { name: "T", address: "A", city: "C", state: "S", pincode: "110001", country: "India" },
        shippingDetails: { name: "T", address: "A", city: "C", state: "S", pincode: "110001", country: "India" },
      });

      const verifyResp = await request(app)
        .post("/api/payment/verify")
        .send({ orderId: order._id.toString() });

      expect(verifyResp.status).toBe(200);
      expect(verifyResp.body.message).toBe("Already verified");
      expect(phonePeService.checkPaymentStatus).not.toHaveBeenCalled();
    });
  });

  describe("COD integration", () => {
    it("rejects non-AAURIKAA shopper payment methods", async () => {
      for (const method of ["upi_manual", "razorpay", "stripe", "upi", "bank"]) {
        const resp = await request(app)
          .post("/api/orders")
          .set("Authorization", "Bearer mock-token")
          .send({
            items: [{ product: new mongoose.Types.ObjectId(), quantity: 1 }],
            paymentMethod: method,
            billingAddress: {
              name: "Test",
              email: "t@example.com",
              phone: "9999999999",
              address1: "Line 1",
              city: "City",
              stateId: new mongoose.Types.ObjectId(),
              countryId: new mongoose.Types.ObjectId(),
              zip: "110001",
            },
            shippingAddress: {
              name: "Test",
              email: "t@example.com",
              phone: "9999999999",
              address1: "Line 1",
              city: "City",
              stateId: new mongoose.Types.ObjectId(),
              countryId: new mongoose.Types.ObjectId(),
              zip: "110001",
            },
          });

        expect(resp.status).toBe(400);
        expect(resp.body.message).toMatch(/Unsupported payment method/i);
        expect(resp.body.allowedPaymentMethods).toEqual(["cod", "phonepe"]);
      }
    });

    it("COD creates a processing order and immediately triggers Shiprocket sync", async () => {
      const country = await Country.create({ name: `Phase2IN-${Date.now()}`, code: `P2${Date.now().toString().slice(-4)}` });
      const state = await State.create({ name: `Phase2State-${Date.now()}`, country: country._id });
      const zone = await ShippingZone.create({
        name: `Phase2Zone-${Date.now()}`,
        code: `P2Z${Date.now().toString().slice(-4)}`,
        country: "IN",
        states: [state.name],
        active: true,
      });
      const weightClass = await WeightClass.create({
        name: `Phase2Light-${Date.now()}`,
        minWeightG: 0,
        maxWeightG: 2000,
        active: true,
        sortOrder: 1,
      });
      await FlatShippingRule.create({
        zone: zone._id,
        weightClass: weightClass._id,
        rateINR: 50,
        active: true,
      });

      const product = await Product.create({
        testFlag: true,
        name: "COD Product",
        sku: `COD-${Date.now()}`,
        regularPrice: 100,
        salePrice: 100,
        stock: 5,
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
      });

      const resp = await request(app)
        .post("/api/orders/create-pending")
        .set("Authorization", "Bearer mock-token")
        .send({
          items: [{ product: product._id, quantity: 1 }],
          paymentMethod: "cod",
          billingAddress: {
            name: "Test",
            email: "t@example.com",
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
            email: "t@example.com",
            phone: "9999999999",
            address1: "Line 1",
            address2: "",
            city: "City",
            stateId: state._id,
            countryId: country._id,
            zip: "110001",
          },
          coupon: null,
          paymentData: {},
          timestamp: Date.now(),
        });

      expect(resp.status).toBe(201);
      expect(orderFulfillmentService.maybeSyncShiprocket).toHaveBeenCalled();

      const saved = await Order.findById(resp.body.order._id);
      expect(saved.status).toBe("processing");
      expect(saved.paymentStatus).toBe("pending");
    });
  });
});
