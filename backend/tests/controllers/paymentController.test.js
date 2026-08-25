// Mock environment variables BEFORE importing anything
const originalEnv = process.env;

process.env.PHONEPE_CLIENT_ID = process.env.PHONEPE_CLIENT_ID || "test_client_id";
process.env.PHONEPE_CLIENT_SECRET = process.env.PHONEPE_CLIENT_SECRET || "test_client_secret";
process.env.PHONEPE_CLIENT_VERSION = process.env.PHONEPE_CLIENT_VERSION || "1";
process.env.PHONEPE_ENV = process.env.PHONEPE_ENV || "UAT";

const request = require("supertest");
const express = require("express");

jest.mock("../../models/Order");
jest.mock("../../services/orderFulfillmentService", () => ({
  maybeSyncShiprocket: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../services/phonePeService", () => ({
  createPaymentRequest: jest.fn().mockResolvedValue({ redirectUrl: "https://payment.phonepe.com/redirect" }),
  checkPaymentStatus: jest.fn(),
  isV2Enabled: jest.fn().mockReturnValue(true),
}));
jest.mock("../../services/orderCommerceIntegrityService", () => ({
  onPaymentSucceeded: jest.fn().mockResolvedValue({ success: true }),
  onPaymentFailed: jest.fn().mockResolvedValue({ success: true }),
  onPaymentRetry: jest.fn().mockResolvedValue({ success: true }),
}));

const paymentController = require("../../controllers/paymentController");
const Order = require("../../models/Order");
const orderFulfillmentService = require("../../services/orderFulfillmentService");
const phonePeService = require("../../services/phonePeService");
const {
  onPaymentSucceeded,
  onPaymentFailed,
} = require("../../services/orderCommerceIntegrityService");

beforeAll(() => {
  process.env.PHONEPE_CLIENT_ID = "test_client_id";
  process.env.PHONEPE_CLIENT_SECRET = "test_client_secret";
  process.env.PHONEPE_CLIENT_VERSION = "1";
  process.env.PHONEPE_ENV = "UAT";
});

beforeEach(() => {
  process.env.PHONEPE_CLIENT_ID = "test_client_id";
  process.env.PHONEPE_CLIENT_SECRET = "test_client_secret";
  process.env.PHONEPE_CLIENT_VERSION = "1";
  process.env.PHONEPE_ENV = "UAT";
});

afterAll(() => {
  process.env = originalEnv;
});

describe("Payment Controller (PhonePe V2)", () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.post("/verify-status", (req, res, next) => {
      req.user = { id: "buyer-1" };
      next();
    }, paymentController.verifyPaymentStatus);
    app.post("/admin-reverify/:orderId", paymentController.verifyPaymentAdmin);
    app.post("/initiate-payment", paymentController.initiatePayment);

    jest.clearAllMocks();
    phonePeService.isV2Enabled.mockReturnValue(true);
  });

  describe("initiatePayment", () => {
    it("should return 503 when PhonePe V2 not configured", async () => {
      phonePeService.isV2Enabled.mockReturnValue(false);

      const response = await request(app).post("/initiate-payment").send({ orderId: "test-order-3" });

      expect(response.status).toBe(503);
      expect(response.body.message).toContain("PhonePe not configured");
      phonePeService.isV2Enabled.mockReturnValue(true);
    });

    it("should reject when order is not eligible (not pending)", async () => {
      Order.findById.mockResolvedValue({
        _id: "test-order-3",
        status: "processing",
        paymentStatus: "pending",
        totalAmount: 10,
        buyer: "buyer-1",
      });

      const response = await request(app).post("/initiate-payment").send({ orderId: "test-order-3" });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it("should initiate payment and return redirectUrl", async () => {
      Order.findById.mockResolvedValue({
        _id: "test-order-4",
        status: "pending",
        paymentStatus: "pending",
        totalAmount: 12.5,
        buyer: "buyer-1",
        save: jest.fn().mockResolvedValue(true),
        markModified: jest.fn(),
      });

      const response = await request(app).post("/initiate-payment").send({ orderId: "test-order-4" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.redirectUrl).toBe("https://payment.phonepe.com/redirect");
      expect(phonePeService.createPaymentRequest).toHaveBeenCalledWith(
        expect.objectContaining({ amountPaisa: 1250 })
      );
    });

    it("should reuse existing pending paymentTransactionId on re-initiate", async () => {
      const order = {
        _id: "test-order-reuse-txn",
        status: "pending_verification",
        paymentStatus: "pending",
        paymentTransactionId: "TXN_existing_pending",
        totalAmount: 20,
        buyer: "buyer-1",
        save: jest.fn().mockResolvedValue(true),
        markModified: jest.fn(),
      };
      Order.findById.mockResolvedValue(order);

      const response = await request(app)
        .post("/initiate-payment")
        .send({ orderId: "test-order-reuse-txn" });

      expect(response.status).toBe(200);
      expect(response.body.data.transactionId).toBe("TXN_existing_pending");
      expect(order.paymentTransactionId).toBe("TXN_existing_pending");
      expect(phonePeService.createPaymentRequest).toHaveBeenCalledWith(
        expect.objectContaining({ merchantTransactionId: "TXN_existing_pending" })
      );
    });

    it("should mint a new TXN after cancelled/failed retry (do not reuse terminal id)", async () => {
      const save = jest.fn().mockResolvedValue(true);
      const order = {
        _id: "abcdef12retry99",
        status: "cancelled",
        paymentStatus: "failed",
        paymentTransactionId: "TXN_old_failed",
        totalAmount: 12.5,
        buyer: "buyer-1",
        save,
        markModified: jest.fn(),
      };
      Order.findById.mockResolvedValue(order);

      const response = await request(app)
        .post("/initiate-payment")
        .send({ orderId: "abcdef12retry99" });

      expect(response.status).toBe(200);
      expect(response.body.data.transactionId).toBeTruthy();
      expect(response.body.data.transactionId).not.toBe("TXN_old_failed");
      expect(phonePeService.createPaymentRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          merchantTransactionId: response.body.data.transactionId,
        })
      );
    });

    it("should allow retry for cancelled/failed orders (resets back to pending)", async () => {
      const save = jest.fn().mockResolvedValue(true);
      Order.findById.mockResolvedValue({
        _id: "test-order-5-retry",
        status: "cancelled",
        paymentStatus: "failed",
        totalAmount: 12.5,
        buyer: "buyer-1",
        save,
        markModified: jest.fn(),
      });

      const response = await request(app).post("/initiate-payment").send({ orderId: "test-order-5-retry" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(save).toHaveBeenCalled();
      expect(phonePeService.createPaymentRequest).toHaveBeenCalled();
    });
  });

  describe("verifyPaymentStatus", () => {
    it("should require orderId", async () => {
      const response = await request(app).post("/verify-status").send({});
      expect(response.status).toBe(400);
      expect(response.body.message).toContain("Missing orderId");
    });

    it("should return 404 when order not found", async () => {
      Order.findById.mockResolvedValue(null);
      const response = await request(app).post("/verify-status").send({ orderId: "missing" });
      expect(response.status).toBe(404);
    });

    it("should return already verified when payment already success", async () => {
      Order.findById.mockResolvedValue({
        _id: "o1",
        buyer: "buyer-1",
        paymentStatus: "success",
        status: "paid",
        paymentTransactionId: "TXN",
      });
      const response = await request(app).post("/verify-status").send({ orderId: "o1" });
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Already verified");
      expect(phonePeService.checkPaymentStatus).not.toHaveBeenCalled();
    });

    it("should reject when no paymentTransactionId", async () => {
      Order.findById.mockResolvedValue({
        _id: "o1",
        buyer: "buyer-1",
        paymentStatus: "pending",
        status: "pending",
        paymentTransactionId: null,
      });
      const response = await request(app).post("/verify-status").send({ orderId: "o1" });
      expect(response.status).toBe(400);
    });

    it("should return 503 when V2 not configured", async () => {
      phonePeService.isV2Enabled.mockReturnValue(false);
      Order.findById.mockResolvedValue({
        _id: "o1",
        buyer: "buyer-1",
        paymentStatus: "pending",
        status: "pending",
        paymentTransactionId: "TXN",
      });
      const response = await request(app).post("/verify-status").send({ orderId: "o1" });
      expect(response.status).toBe(503);
      phonePeService.isV2Enabled.mockReturnValue(true);
    });

    it("should update order from status API COMPLETED and sync Shiprocket", async () => {
      const save = jest.fn().mockResolvedValue(true);
      Order.findById.mockResolvedValue({
        _id: "o1",
        buyer: "buyer-1",
        paymentStatus: "pending",
        status: "pending",
        totalAmount: 10,
        paymentTransactionId: "TXN_1",
        save,
        markModified: jest.fn(),
      });
      phonePeService.checkPaymentStatus.mockResolvedValue({ state: "COMPLETED", amount: 1000 });

      const response = await request(app).post("/verify-status").send({ orderId: "o1" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.status).toBe("success");
      expect(phonePeService.checkPaymentStatus).toHaveBeenCalledWith("TXN_1", { details: true });
      expect(onPaymentSucceeded).toHaveBeenCalled();
      expect(save).toHaveBeenCalled();
      expect(orderFulfillmentService.maybeSyncShiprocket).toHaveBeenCalled();
    });

    it("SEC-040: COMPLETED with matching amount marks paid and commits integrity", async () => {
      const save = jest.fn().mockResolvedValue(true);
      const order = {
        _id: "o-match",
        buyer: "buyer-1",
        paymentStatus: "pending",
        status: "pending",
        totalAmount: 99.5,
        paymentTransactionId: "TXN_MATCH",
        save,
        markModified: jest.fn(),
      };
      Order.findById.mockResolvedValue(order);
      phonePeService.checkPaymentStatus.mockResolvedValue({
        state: "COMPLETED",
        amount: 9950,
        paymentDetails: [{ state: "COMPLETED", amount: 9950, paymentMode: "UPI_QR" }],
      });

      const response = await request(app).post("/verify-status").send({ orderId: "o-match" });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("success");
      expect(order.paymentStatus).toBe("success");
      expect(order.status).toBe("paid");
      expect(onPaymentSucceeded).toHaveBeenCalledWith(order);
    });

    it("SEC-040: COMPLETED with amount mismatch does not mark paid or commit integrity", async () => {
      const save = jest.fn().mockResolvedValue(true);
      const order = {
        _id: "o-mismatch",
        buyer: "buyer-1",
        paymentStatus: "pending",
        status: "pending",
        totalAmount: 100,
        paymentTransactionId: "TXN_MISMATCH",
        save,
        markModified: jest.fn(),
      };
      Order.findById.mockResolvedValue(order);
      phonePeService.checkPaymentStatus.mockResolvedValue({
        state: "COMPLETED",
        amount: 1,
      });

      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      const response = await request(app).post("/verify-status").send({ orderId: "o-mismatch" });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("pending");
      expect(order.paymentStatus).toBe("pending");
      expect(order.status).toBe("pending_verification");
      expect(onPaymentSucceeded).not.toHaveBeenCalled();
      expect(orderFulfillmentService.maybeSyncShiprocket).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("PhonePe amount mismatch (SEC-040)")
      );
      consoleSpy.mockRestore();
    });

    it("SEC-040: nested data.amount shape is reconciled", async () => {
      const save = jest.fn().mockResolvedValue(true);
      const order = {
        _id: "o-nested",
        buyer: "buyer-1",
        paymentStatus: "pending",
        status: "pending",
        totalAmount: 25,
        paymentTransactionId: "TXN_NESTED",
        save,
        markModified: jest.fn(),
      };
      Order.findById.mockResolvedValue(order);
      phonePeService.checkPaymentStatus.mockResolvedValue({
        data: { state: "COMPLETED", amount: 2500 },
      });

      const response = await request(app).post("/verify-status").send({ orderId: "o-nested" });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("success");
      expect(onPaymentSucceeded).toHaveBeenCalled();
    });

    it("duplicate COMPLETED verify stays idempotent (already success)", async () => {
      Order.findById.mockResolvedValue({
        _id: "o-dup",
        buyer: "buyer-1",
        paymentStatus: "success",
        status: "paid",
        totalAmount: 10,
        paymentTransactionId: "TXN_DUP",
      });

      const response = await request(app).post("/verify-status").send({ orderId: "o-dup" });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Already verified");
      expect(phonePeService.checkPaymentStatus).not.toHaveBeenCalled();
      expect(onPaymentSucceeded).not.toHaveBeenCalled();
    });

    it("should cancel order when status API returns FAILED", async () => {
      const save = jest.fn().mockResolvedValue(true);
      Order.findById.mockResolvedValue({
        _id: "o1",
        buyer: "buyer-1",
        paymentStatus: "pending",
        status: "pending",
        paymentTransactionId: "TXN_1",
        save,
        markModified: jest.fn(),
      });
      phonePeService.checkPaymentStatus.mockResolvedValue({ state: "FAILED" });

      const response = await request(app).post("/verify-status").send({ orderId: "o1" });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("failed");
      expect(onPaymentFailed).toHaveBeenCalled();
      expect(orderFulfillmentService.maybeSyncShiprocket).not.toHaveBeenCalled();
    });

    it("should return graceful pending when status API throws (no hard-fail)", async () => {
      const save = jest.fn().mockResolvedValue(true);
      Order.findById.mockResolvedValue({
        _id: "o1",
        buyer: "buyer-1",
        paymentStatus: "pending",
        status: "pending",
        paymentTransactionId: "TXN_1",
        save,
        markModified: jest.fn(),
      });
      phonePeService.checkPaymentStatus.mockRejectedValue(new Error("network"));

      const response = await request(app).post("/verify-status").send({ orderId: "o1" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(false);
      expect(response.body.status).toBe("pending");
      expect(response.body.retry).toBe(true);
      expect(save).not.toHaveBeenCalled();
    });

    it("should reject when buyer does not match", async () => {
      Order.findById.mockResolvedValue({
        _id: "o1",
        buyer: "other-buyer",
        paymentStatus: "pending",
        status: "pending",
        paymentTransactionId: "TXN",
      });
      const response = await request(app).post("/verify-status").send({ orderId: "o1" });
      expect(response.status).toBe(403);
    });
  });

  describe("verifyPaymentAdmin", () => {
    it("should return 404 when order not found", async () => {
      Order.findById.mockResolvedValue(null);
      const response = await request(app).post("/admin-reverify/o-missing");
      expect(response.status).toBe(404);
    });

    it("should return 400 when transaction id missing", async () => {
      Order.findById.mockResolvedValue({
        _id: "o1",
        paymentStatus: "pending",
        paymentTransactionId: null,
        save: jest.fn(),
      });
      const response = await request(app).post("/admin-reverify/o1");
      expect(response.status).toBe(400);
    });

    it("should mark paid when status API returns COMPLETED", async () => {
      const save = jest.fn().mockResolvedValue(true);
      Order.findById.mockResolvedValue({
        _id: "o1",
        paymentStatus: "pending",
        status: "pending",
        totalAmount: 10,
        paymentTransactionId: "TXN_1",
        save,
        markModified: jest.fn(),
      });
      phonePeService.checkPaymentStatus.mockResolvedValue({ state: "COMPLETED", amount: 1000 });

      const response = await request(app).post("/admin-reverify/o1");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.status).toBe("success");
      expect(orderFulfillmentService.maybeSyncShiprocket).toHaveBeenCalled();
    });

    it("SEC-040: admin reverify refuses amount mismatch", async () => {
      const save = jest.fn().mockResolvedValue(true);
      const order = {
        _id: "o1",
        paymentStatus: "pending",
        status: "pending",
        totalAmount: 50,
        paymentTransactionId: "TXN_1",
        save,
        markModified: jest.fn(),
      };
      Order.findById.mockResolvedValue(order);
      phonePeService.checkPaymentStatus.mockResolvedValue({ state: "COMPLETED", amount: 999 });

      const response = await request(app).post("/admin-reverify/o1");

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("pending");
      expect(order.status).toBe("pending_verification");
      expect(onPaymentSucceeded).not.toHaveBeenCalled();
      expect(orderFulfillmentService.maybeSyncShiprocket).not.toHaveBeenCalled();
    });
  });

  describe("extractPhonePeAmountPaisa", () => {
    it("reads common V2 shapes defensively", () => {
      expect(paymentController.extractPhonePeAmountPaisa({ amount: 1000 })).toBe(1000);
      expect(paymentController.extractPhonePeAmountPaisa({ data: { amount: "2500" } })).toBe(2500);
      expect(
        paymentController.extractPhonePeAmountPaisa({
          paymentDetails: [{ state: "FAILED", amount: 1 }, { state: "COMPLETED", amount: 3000 }],
        })
      ).toBe(3000);
      expect(paymentController.extractPhonePeAmountPaisa({ state: "COMPLETED" })).toBeNull();
    });
  });
});
