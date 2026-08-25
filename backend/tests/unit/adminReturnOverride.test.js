jest.mock("../../models/ReturnRequest");
jest.mock("../../models/Order");
jest.mock("../../services/returnRefundOrchestrationService", () => ({
  tryAfterSalesRefundOnResolution: jest.fn().mockResolvedValue({ processed: true }),
}));

const mongoose = require("mongoose");
const ReturnRequest = require("../../models/ReturnRequest");
const Order = require("../../models/Order");
const {
  reopenAfterSalesCase,
  overrideAfterSalesResolution,
} = require("../../services/adminReturnService");

describe("adminReturnService governance overrides", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ReturnRequest.findOneAndUpdate.mockReset();
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

  it("requires an audit note for reopen", async () => {
    const requestId = new mongoose.Types.ObjectId().toString();
    const result = await reopenAfterSalesCase({
      requestId,
      adminId: new mongoose.Types.ObjectId().toString(),
      note: "   ",
    });
    expect(result.invalid).toBe(true);
  });

  it("blocks reopen on legacy cases", async () => {
    const requestId = new mongoose.Types.ObjectId().toString();
    ReturnRequest.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          status: "rejected",
          caseFlow: "legacy",
          resolution: "rejected",
        }),
      }),
    });

    const result = await reopenAfterSalesCase({
      requestId,
      adminId: new mongoose.Types.ObjectId().toString(),
      note: "Dispute reopen",
    });

    expect(result.notAllowed).toBe(true);
  });

  it("reopens seller-rejected after-sales case to pending_review", async () => {
    const requestId = new mongoose.Types.ObjectId().toString();
    const adminId = new mongoose.Types.ObjectId().toString();

    ReturnRequest.findById
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            status: "rejected",
            caseFlow: "after_sales",
            resolution: "rejected",
          }),
        }),
      })
      .mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue({
          _id: requestId,
          status: "pending_review",
          caseFlow: "after_sales",
          order: "order1",
          statusHistory: [],
          resolutionHistory: [],
        }),
      });

    ReturnRequest.findOneAndUpdate.mockResolvedValue({
      _id: requestId,
      status: "pending_review",
      caseFlow: "after_sales",
      order: "order1",
      statusHistory: [],
      resolutionHistory: [],
      toObject: () => ({
        _id: requestId,
        status: "pending_review",
        caseFlow: "after_sales",
        order: "order1",
        statusHistory: [],
        resolutionHistory: [],
      }),
    });

    const result = await reopenAfterSalesCase({
      requestId,
      adminId,
      note: "Customer dispute — reopen for seller",
    });

    expect(result.overrideAction).toBe("reopen");
    expect(result.request).toBeDefined();
    expect(ReturnRequest.findOneAndUpdate).toHaveBeenCalled();
  });

  it("requires audit note for resolution override", async () => {
    const requestId = new mongoose.Types.ObjectId().toString();
    const result = await overrideAfterSalesResolution({
      requestId,
      adminId: new mongoose.Types.ObjectId().toString(),
      resolution: "refund",
      reasonCode: "SELLER_GOODWILL",
      note: "",
    });
    expect(result.invalid).toBe(true);
  });

  it("requires resolution reason code for override", async () => {
    const requestId = new mongoose.Types.ObjectId().toString();
    ReturnRequest.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: requestId,
        status: "rejected",
        caseFlow: "after_sales",
        order: "order1",
        resolution: "rejected",
      }),
    });
    const result = await overrideAfterSalesResolution({
      requestId,
      adminId: new mongoose.Types.ObjectId().toString(),
      resolution: "refund",
      note: "Customer dispute",
    });
    expect(result.invalid).toBe(true);
    expect(result.message).toMatch(/reason/i);
  });

  it("holds refund override before wallet or transition work (SEC-006)", async () => {
    const { REFUND_HOLD_MESSAGE } = require("../../services/adminAfterSalesOpsService");
    const requestId = new mongoose.Types.ObjectId().toString();

    const result = await overrideAfterSalesResolution({
      requestId,
      adminId: new mongoose.Types.ObjectId().toString(),
      resolution: "refund",
      reasonCode: "SELLER_GOODWILL",
      note: "Customer dispute — refund override",
    });

    expect(result.notAllowed).toBe(true);
    expect(result.message).toBe(REFUND_HOLD_MESSAGE);
    expect(ReturnRequest.findById).not.toHaveBeenCalled();
    expect(ReturnRequest.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
