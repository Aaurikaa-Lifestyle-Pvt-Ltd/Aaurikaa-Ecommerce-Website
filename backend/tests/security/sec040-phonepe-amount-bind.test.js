/**
 * SEC-040: PhonePe COMPLETED amount must match order.totalAmount (paisa) before marking paid.
 */
process.env.PHONEPE_CLIENT_ID = process.env.PHONEPE_CLIENT_ID || "test_client_id";
process.env.PHONEPE_CLIENT_SECRET = process.env.PHONEPE_CLIENT_SECRET || "test_client_secret";
process.env.PHONEPE_CLIENT_VERSION = process.env.PHONEPE_CLIENT_VERSION || "1";
process.env.PHONEPE_ENV = process.env.PHONEPE_ENV || "UAT";

jest.mock("../../services/orderCommerceIntegrityService", () => ({
  onPaymentSucceeded: jest.fn().mockResolvedValue({ success: true }),
  onPaymentFailed: jest.fn().mockResolvedValue({ success: true }),
  onPaymentRetry: jest.fn().mockResolvedValue({ success: true }),
  onOrderCreated: jest.fn().mockResolvedValue({ success: true }),
  onOrderCancelled: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock("../../services/paymentVisibilityService", () => ({
  normalizeAndPersist: jest.fn(async (order) => {
    if (typeof order.save === "function") await order.save();
    return {};
  }),
}));

const {
  applyPhonePeStateToOrder,
  extractPhonePeAmountPaisa,
} = require("../../controllers/paymentController");
const { onPaymentSucceeded } = require("../../services/orderCommerceIntegrityService");

describe("SEC-040 PhonePe amount bind", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("marks paid when COMPLETED amount matches order total", async () => {
    const order = {
      _id: "ord-1",
      totalAmount: 149.99,
      paymentStatus: "pending",
      status: "pending",
      save: jest.fn().mockResolvedValue(true),
      markModified: jest.fn(),
    };

    await applyPhonePeStateToOrder(order, { state: "COMPLETED", amount: 14999 });

    expect(order.paymentStatus).toBe("success");
    expect(order.status).toBe("paid");
    expect(onPaymentSucceeded).toHaveBeenCalledWith(order);
  });

  it("does not mark paid or commit integrity on amount mismatch", async () => {
    const order = {
      _id: "ord-2",
      totalAmount: 500,
      paymentStatus: "pending",
      status: "pending",
      save: jest.fn().mockResolvedValue(true),
      markModified: jest.fn(),
    };
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});

    await applyPhonePeStateToOrder(order, { state: "COMPLETED", amount: 100 });

    expect(order.paymentStatus).toBe("pending");
    expect(order.status).toBe("pending_verification");
    expect(onPaymentSucceeded).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("SEC-040"));
    spy.mockRestore();
  });

  it("allows COMPLETED when amount field absent (poll bind when present only)", async () => {
    const order = {
      _id: "ord-3",
      totalAmount: 10,
      paymentStatus: "pending",
      status: "pending",
      save: jest.fn().mockResolvedValue(true),
      markModified: jest.fn(),
    };

    await applyPhonePeStateToOrder(order, { state: "COMPLETED" });

    expect(order.paymentStatus).toBe("success");
    expect(onPaymentSucceeded).toHaveBeenCalled();
  });

  it("extractPhonePeAmountPaisa supports paymentDetails COMPLETED entry", () => {
    expect(
      extractPhonePeAmountPaisa({
        state: "COMPLETED",
        paymentDetails: [
          { state: "FAILED", amount: 50 },
          { state: "COMPLETED", amount: 4200 },
        ],
      })
    ).toBe(4200);
  });
});
