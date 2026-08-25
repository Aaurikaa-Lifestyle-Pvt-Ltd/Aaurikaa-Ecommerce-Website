jest.mock("../../services/aaurikaaFoundationService", () => ({
  getOrCreateInternalSeller: jest.fn(),
}));
jest.mock("../../services/sellerReturnService", () => ({
  reviewSellerDecision: jest.fn(),
  confirmSellerReceipt: jest.fn(),
  selectSellerResolution: jest.fn(),
  retrySellerReturnPickup: jest.fn(),
}));

const mongoose = require("mongoose");
const { getOrCreateInternalSeller } = require("../../services/aaurikaaFoundationService");
const {
  reviewSellerDecision,
  selectSellerResolution,
} = require("../../services/sellerReturnService");
const {
  REFUND_HOLD_MESSAGE,
  resolveAfterSalesCase,
  reviewAfterSalesCase,
} = require("../../services/adminAfterSalesOpsService");

describe("adminAfterSalesOpsService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("holds refund resolution without calling the after-sales engine", async () => {
    const result = await resolveAfterSalesCase({
      requestId: new mongoose.Types.ObjectId().toString(),
      resolution: "refund",
      reasonCode: "MANUFACTURING_DEFECT",
    });

    expect(result.notAllowed).toBe(true);
    expect(result.message).toBe(REFUND_HOLD_MESSAGE);
    expect(getOrCreateInternalSeller).not.toHaveBeenCalled();
    expect(selectSellerResolution).not.toHaveBeenCalled();
  });

  it("holds refund on after-sales review without calling the seller engine", async () => {
    const result = await reviewAfterSalesCase({
      requestId: new mongoose.Types.ObjectId().toString(),
      action: "accept",
      resolution: "Refund",
      reasonCode: "MANUFACTURING_DEFECT",
    });

    expect(result.notAllowed).toBe(true);
    expect(result.message).toBe(REFUND_HOLD_MESSAGE);
    expect(getOrCreateInternalSeller).not.toHaveBeenCalled();
    expect(reviewSellerDecision).not.toHaveBeenCalled();
  });

  it("delegates replacement resolution to the existing engine with internal seller", async () => {
    const sellerId = new mongoose.Types.ObjectId();
    getOrCreateInternalSeller.mockResolvedValue({ _id: sellerId });
    selectSellerResolution.mockResolvedValue({ request: { resolution: "replacement" } });

    const requestId = new mongoose.Types.ObjectId().toString();
    const result = await resolveAfterSalesCase({
      requestId,
      resolution: "replacement",
      reasonCode: "WRONG_ITEM",
    });

    expect(selectSellerResolution).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId,
        sellerId: String(sellerId),
        resolution: "replacement",
      })
    );
    expect(result.request.resolution).toBe("replacement");
  });
});
