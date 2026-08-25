jest.mock("../../models/Order");
jest.mock("../../models/ReturnRequest");
jest.mock("../../services/orderCommerceIntegrityService", () => ({
  onOrderCreated: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock("../../services/orderFulfillmentService", () => ({
  maybeSyncShiprocket: jest.fn().mockResolvedValue(undefined),
}));

const mongoose = require("mongoose");
const Order = require("../../models/Order");
const ReturnRequest = require("../../models/ReturnRequest");
const { onOrderCreated } = require("../../services/orderCommerceIntegrityService");
const orderFulfillmentService = require("../../services/orderFulfillmentService");
const {
  fulfillApprovedReplacement,
} = require("../../services/replacementFulfillmentService");

describe("replacementFulfillmentService", () => {
  const returnRequestId = new mongoose.Types.ObjectId();
  const sourceOrderId = new mongoose.Types.ObjectId();
  const buyerId = new mongoose.Types.ObjectId();
  const productId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    jest.clearAllMocks();
    Order.countDocuments.mockResolvedValue(0);
  });

  it("skips when resolution is not replacement", async () => {
    ReturnRequest.findById.mockResolvedValue({
      _id: returnRequestId,
      resolution: "repair",
    });

    const result = await fulfillApprovedReplacement({ returnRequestId });
    expect(result.skipped).toBe(true);
    expect(onOrderCreated).not.toHaveBeenCalled();
  });

  it("is idempotent when a replacement order already exists", async () => {
    const existingId = new mongoose.Types.ObjectId();
    ReturnRequest.findById.mockResolvedValue({
      _id: returnRequestId,
      resolution: "replacement",
      replacementOrder: existingId,
    });
    Order.findById.mockResolvedValue({
      _id: existingId,
      invoiceNumber: "INV-REPL-1",
    });

    const result = await fulfillApprovedReplacement({ returnRequestId });
    expect(result.alreadyApplied).toBe(true);
    expect(result.orderId).toBe(String(existingId));
    expect(onOrderCreated).not.toHaveBeenCalled();
  });

  it("creates a zero-total processing order and commits inventory", async () => {
    const returnDoc = {
      _id: returnRequestId,
      order: sourceOrderId,
      resolution: "replacement",
      replacementOrder: null,
      save: jest.fn().mockResolvedValue(true),
    };
    ReturnRequest.findById.mockResolvedValue(returnDoc);

    const source = {
      _id: sourceOrderId,
      buyer: buyerId,
      billingDetails: { name: "Asha" },
      shippingDetails: { city: "Pune", pincode: "411001" },
      shippingMethod: "flat",
      shippingProvider: "shiprocket",
      shippingApplicability: "full",
      items: [
        {
          toObject: () => ({
            product: productId,
            quantity: 1,
            price: 1999,
            variantKey: "finish:gold",
          }),
        },
      ],
      paymentMethod: "cod",
    };

    Order.findById.mockResolvedValue(source);

    const saved = [];
    Order.mockImplementation(function OrderCtor(doc) {
      Object.assign(this, doc);
      this._id = new mongoose.Types.ObjectId();
      this.save = jest.fn().mockImplementation(async () => {
        saved.push(this);
        return this;
      });
    });

    const result = await fulfillApprovedReplacement({ returnRequestId });

    expect(result.processed).toBe(true);
    expect(onOrderCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        fulfilmentKind: "replacement",
        totalAmount: 0,
        status: "processing",
        paymentStatus: "success",
      }),
      { isCod: true }
    );
    expect(returnDoc.manualFollowUpRequired).toBe(false);
    expect(returnDoc.save).toHaveBeenCalled();
    expect(orderFulfillmentService.maybeSyncShiprocket).toHaveBeenCalled();
    expect(saved[0].items[0]).toMatchObject({
      product: productId,
      quantity: 1,
      variantKey: "finish:gold",
    });
  });

  it("does not persist when inventory commit fails", async () => {
    onOrderCreated.mockResolvedValueOnce({
      success: false,
      error: "Insufficient stock for one or more items",
    });
    const returnDoc = {
      _id: returnRequestId,
      order: sourceOrderId,
      resolution: "replacement",
      replacementOrder: null,
      save: jest.fn(),
    };
    ReturnRequest.findById.mockResolvedValue(returnDoc);
    Order.findById.mockResolvedValue({
      _id: sourceOrderId,
      buyer: buyerId,
      items: [{ toObject: () => ({ product: productId, quantity: 1, price: 10 }) }],
      paymentMethod: "phonepe",
    });
    Order.mockImplementation(function OrderCtor(doc) {
      Object.assign(this, doc);
      this.save = jest.fn();
    });

    const result = await fulfillApprovedReplacement({ returnRequestId });
    expect(result.inventoryFailed).toBe(true);
    expect(returnDoc.save).not.toHaveBeenCalled();
  });
});
