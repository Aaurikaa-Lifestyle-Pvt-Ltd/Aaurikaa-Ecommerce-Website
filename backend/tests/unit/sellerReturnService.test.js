jest.mock("../../models/ReturnRequest");
jest.mock("../../models/Order");
jest.mock("../../models/Product");
jest.mock("../../services/reverseLogisticsService", () => ({
  scheduleReturnPickup: jest.fn().mockResolvedValue({
    scheduled: true,
    reverseLogistics: { status: "scheduled", awbCode: "AWB-TEST" },
  }),
  retryReturnPickup: jest.fn(),
  toReverseLogisticsDTO: jest.fn((rl) => rl || null),
}));
jest.mock("../../services/returnRefundOrchestrationService", () => ({
  tryAfterSalesRefundOnResolution: jest.fn().mockResolvedValue(null),
}));
jest.mock("../../services/inventoryLifecycleService", () => ({
  restoreStockForReturnedOrder: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock("../../services/replacementFulfillmentService", () => ({
  fulfillApprovedReplacement: jest.fn().mockResolvedValue({ processed: true }),
}));
jest.mock("../../services/returnAppealService", () => ({
  openAppealWindowOnResolution: jest.fn().mockResolvedValue(undefined),
  buildAppealDTO: jest.fn(() => ({
    canAppeal: false,
    appealCount: 0,
    windowEndsAt: null,
    appealedAt: null,
    reason: null,
    evidence: [],
    adminDecision: null,
    adminDecidedAt: null,
  })),
}));

const mongoose = require("mongoose");
const ReturnRequest = require("../../models/ReturnRequest");
const Order = require("../../models/Order");
const Product = require("../../models/Product");
const reverseLogisticsService = require("../../services/reverseLogisticsService");
const { fulfillApprovedReplacement } = require("../../services/replacementFulfillmentService");
const { restoreStockForReturnedOrder } = require("../../services/inventoryLifecycleService");
const {
  reviewSellerDecision,
  confirmSellerReceipt,
  selectSellerResolution,
  SELLER_QUEUE_STATUS_FILTERS,
} = require("../../services/sellerReturnService");

describe("sellerReturnService", () => {
  const sellerId = new mongoose.Types.ObjectId().toString();
  const requestId = new mongoose.Types.ObjectId().toString();
  const orderId = new mongoose.Types.ObjectId().toString();
  const productId = new mongoose.Types.ObjectId().toString();

  beforeEach(() => {
    jest.clearAllMocks();
    Product.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ _id: productId }]),
      }),
    });
  });

  function mockOwnedCase(requestOverrides = {}) {
    const request = {
      _id: requestId,
      order: orderId,
      status: "pending_review",
      caseFlow: "after_sales",
      returnRequired: null,
      resolution: null,
      resolutionHistory: [],
      evidence: [],
      ...requestOverrides,
    };

    ReturnRequest.findById.mockImplementation(() => {
      const leanResult = Promise.resolve(request);
      return {
        lean: jest.fn().mockResolvedValue(request),
        then: leanResult.then?.bind(leanResult),
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(request),
        }),
      };
    });

    // Document form for persistResolutionChange
    ReturnRequest.findById.mockReset();
    let call = 0;
    ReturnRequest.findById.mockImplementation(() => {
      call += 1;
      if (call === 1) {
        return { lean: jest.fn().mockResolvedValue(request) };
      }
      const doc = {
        ...request,
        resolution: request.resolution,
        resolutionHistory: [...(request.resolutionHistory || [])],
        save: jest.fn().mockResolvedValue(true),
      };
      return doc;
    });

    Order.findById.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: orderId,
          status: "delivered",
          totalAmount: 500,
          buyer: { firstName: "A", lastName: "B", email: "a@test.com" },
          items: [{ product: { _id: productId, name: "Item" }, quantity: 1, price: 500 }],
        }),
      }),
    });

    return request;
  }

  it("maps recommended seller queue filters", () => {
    expect(SELLER_QUEUE_STATUS_FILTERS.pending_review).toEqual(["pending_review"]);
    expect(SELLER_QUEUE_STATUS_FILTERS.awaiting_pickup).toEqual(["awaiting_pickup"]);
    expect(SELLER_QUEUE_STATUS_FILTERS.in_transit).toEqual(["in_transit"]);
    expect(SELLER_QUEUE_STATUS_FILTERS.awaiting_inspection).toEqual(["awaiting_inspection"]);
    expect(SELLER_QUEUE_STATUS_FILTERS.resolved).toEqual(["resolved"]);
    expect(SELLER_QUEUE_STATUS_FILTERS.closed).toEqual(["rejected", "closed"]);
  });

  it("requires returnRequired when accepting", async () => {
    mockOwnedCase();
    const result = await reviewSellerDecision({
      requestId,
      sellerId,
      action: "accept",
      note: "ok",
    });
    expect(result.invalid).toBe(true);
    expect(result.message).toMatch(/returnRequired/i);
  });

  it("rejects with resolution history", async () => {
    mockOwnedCase();
    ReturnRequest.findOneAndUpdate.mockResolvedValue({
      _id: requestId,
      order: orderId,
      status: "rejected",
      caseFlow: "after_sales",
    });

    const save = jest.fn().mockResolvedValue(true);
    const doc = {
      _id: requestId,
      status: "rejected",
      caseFlow: "after_sales",
      resolution: null,
      resolutionHistory: [],
      save,
    };

    ReturnRequest.findById
      .mockReturnValueOnce({ lean: jest.fn().mockResolvedValue({
        _id: requestId,
        order: orderId,
        status: "pending_review",
        caseFlow: "after_sales",
        returnRequired: null,
        evidence: [],
      }) })
      .mockReturnValueOnce(doc)
      .mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue({
          _id: requestId,
          order: orderId,
          status: "rejected",
          caseFlow: "after_sales",
          resolution: "rejected",
          resolutionHistory: [{ toResolution: "rejected" }],
          evidence: [],
        }),
      });

    const result = await reviewSellerDecision({
      requestId,
      sellerId,
      action: "reject",
      reasonCode: "USED_PRODUCT",
      note: "Not eligible",
    });

    expect(result.decision).toBe("reject");
    expect(result.request.status).toBe("rejected");
    expect(save).toHaveBeenCalled();
  });

  it("accepts with return required → awaiting_pickup", async () => {
    ReturnRequest.findOneAndUpdate.mockResolvedValue({
      _id: requestId,
      order: orderId,
      status: "awaiting_pickup",
      caseFlow: "after_sales",
      returnRequired: true,
    });

    ReturnRequest.findById
      .mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue({
          _id: requestId,
          order: orderId,
          status: "pending_review",
          caseFlow: "after_sales",
          returnRequired: null,
          evidence: [],
        }),
      })
      .mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue({
          _id: requestId,
          order: orderId,
          status: "awaiting_pickup",
          caseFlow: "after_sales",
          returnRequired: true,
          evidence: [],
          statusHistory: [],
          resolutionHistory: [],
        }),
      });

    Order.findById.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: orderId,
          status: "delivered",
          items: [{ product: { _id: productId }, quantity: 1, price: 100 }],
          buyer: { firstName: "A" },
        }),
      }),
    });

    const result = await reviewSellerDecision({
      requestId,
      sellerId,
      action: "accept",
      returnRequired: true,
    });

    expect(result.decision).toBe("accept");
    expect(result.request.status).toBe("awaiting_pickup");
    expect(reverseLogisticsService.scheduleReturnPickup).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId,
        sellerId,
        isRetry: false,
      })
    );
    expect(result.logistics?.scheduled).toBe(true);
    expect(ReturnRequest.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: requestId,
        status: { $in: ["pending_review"] },
        caseFlow: "after_sales",
      }),
      expect.any(Array),
      { new: true }
    );
  });

  it("confirms receipt from awaiting_pickup", async () => {
    ReturnRequest.findOneAndUpdate.mockResolvedValue({
      _id: requestId,
      order: orderId,
      status: "awaiting_inspection",
      caseFlow: "after_sales",
      receiptConfirmedAt: new Date(),
    });

    ReturnRequest.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: requestId,
        order: orderId,
        status: "awaiting_pickup",
        caseFlow: "after_sales",
        returnRequired: true,
        evidence: [],
      }),
    });

    Order.findById.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: orderId,
          items: [{ product: { _id: productId }, quantity: 1, price: 100 }],
          buyer: {},
        }),
      }),
      save: jest.fn().mockResolvedValue(true),
    });

    const result = await confirmSellerReceipt({ requestId, sellerId, note: "Received" });
    expect(result.request.status).toBe("awaiting_inspection");
    expect(restoreStockForReturnedOrder).toHaveBeenCalled();
  });

  it("records replacement and requests outbound fulfilment", async () => {
    ReturnRequest.findOneAndUpdate.mockResolvedValue({
      _id: requestId,
      order: orderId,
      status: "resolved",
      caseFlow: "after_sales",
    });

    const save = jest.fn().mockResolvedValue(true);
    const doc = {
      _id: requestId,
      status: "resolved",
      caseFlow: "after_sales",
      resolution: null,
      resolutionHistory: [],
      manualFollowUpRequired: false,
      save,
    };

    ReturnRequest.findById
      .mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue({
          _id: requestId,
          order: orderId,
          status: "awaiting_inspection",
          caseFlow: "after_sales",
          returnRequired: true,
          evidence: [],
        }),
      })
      .mockReturnValueOnce(doc)
      .mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue({
          _id: requestId,
          order: orderId,
          status: "resolved",
          caseFlow: "after_sales",
          resolution: "replacement",
          manualFollowUpRequired: true,
          evidence: [],
          statusHistory: [],
          resolutionHistory: [{ toResolution: "replacement" }],
        }),
      });

    Order.findById.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: orderId,
          items: [{ product: { _id: productId }, quantity: 1, price: 100 }],
          buyer: {},
        }),
      }),
    });

    const result = await selectSellerResolution({
      requestId,
      sellerId,
      resolution: "replacement",
      reasonCode: "MANUFACTURING_DEFECT",
      note: "Will ship manually",
    });

    expect(result.request.resolution).toBe("replacement");
    expect(fulfillApprovedReplacement).toHaveBeenCalledWith({ returnRequestId: requestId });
  });

  it("forbids sellers without products on the order", async () => {
    Product.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ _id: new mongoose.Types.ObjectId().toString() }]),
      }),
    });

    ReturnRequest.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: requestId,
        order: orderId,
        status: "pending_review",
        caseFlow: "after_sales",
      }),
    });

    Order.findById.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: orderId,
          items: [{ product: { _id: productId }, quantity: 1, price: 100 }],
        }),
      }),
    });

    const result = await reviewSellerDecision({
      requestId,
      sellerId,
      action: "reject",
    });
    expect(result.forbidden).toBe(true);
  });
});
