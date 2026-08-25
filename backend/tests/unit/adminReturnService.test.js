jest.mock("../../models/ReturnRequest");
jest.mock("../../models/Order");
jest.mock("../../services/returnRefundFinancialService", () => ({
  runRefundFinancialReversal: jest.fn().mockResolvedValue({ summary: { commissionsCancelled: 1 } }),
}));

const mongoose = require("mongoose");
const ReturnRequest = require("../../models/ReturnRequest");
const Order = require("../../models/Order");
const { runRefundFinancialReversal } = require("../../services/returnRefundFinancialService");
const {
  reviewReturnRequest,
  reviewRefundRequest,
  completeRefundRequest,
} = require("../../services/adminReturnService");
const { REFUND_HOLD_MESSAGE } = require("../../services/adminAfterSalesOpsService");

describe("adminReturnService concurrency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Order.findById.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: "order1",
          status: "delivered",
          totalAmount: 1000,
          buyer: { firstName: "Test", lastName: "User" },
          items: [],
        }),
      }),
    });
  });

  it("returns conflict when conditional update matches no document", async () => {
    const requestId = new mongoose.Types.ObjectId().toString();
    ReturnRequest.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ status: "pending_review", caseFlow: "legacy" }),
      }),
    });
    ReturnRequest.findOneAndUpdate.mockResolvedValue(null);
    // Second findById after failed update (conflict path)
    ReturnRequest.findById
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({ status: "pending_review", caseFlow: "legacy" }),
        }),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({ status: "approved" }),
        }),
      });

    const result = await reviewReturnRequest({
      requestId,
      adminId: new mongoose.Types.ObjectId().toString(),
      action: "approve",
      note: "ok",
    });

    expect(result.conflict).toBe(true);
    expect(ReturnRequest.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: requestId, status: { $in: ["pending_review"] } },
      expect.any(Array),
      { new: true }
    );
  });

  it("holds Admin refund review under SEC-006 (no processing)", async () => {
    const result = await reviewRefundRequest({
      requestId: new mongoose.Types.ObjectId().toString(),
      adminId: new mongoose.Types.ObjectId().toString(),
      action: "approve",
    });

    expect(result.notAllowed).toBe(true);
    expect(result.message).toBe(REFUND_HOLD_MESSAGE);
    expect(ReturnRequest.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("holds Admin refund completion under SEC-006 (no financial reversal)", async () => {
    const result = await completeRefundRequest({
      requestId: new mongoose.Types.ObjectId().toString(),
      adminId: new mongoose.Types.ObjectId().toString(),
      note: "done",
    });

    expect(result.notAllowed).toBe(true);
    expect(result.message).toBe(REFUND_HOLD_MESSAGE);
    expect(runRefundFinancialReversal).not.toHaveBeenCalled();
    expect(ReturnRequest.findById).not.toHaveBeenCalled();
  });
});
