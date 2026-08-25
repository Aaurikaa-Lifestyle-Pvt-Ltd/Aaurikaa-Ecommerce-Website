/**
 * Unit tests — reverse logistics (Phase 3 / Module E) + idempotent scheduling.
 */

jest.mock("../../services/shipRocketService", () => {
  const actual = jest.requireActual("../../services/shipRocketService");
  return {
    createReturnOrder: jest.fn(),
    generateAWB: jest.fn(),
    getTracking: jest.fn(),
    findOrderByChannelOrderId: jest.fn(),
    constructor: {
      MAP_RETURN_TRACKING: actual.constructor.MAP_RETURN_TRACKING,
      MAP_STATUS: actual.constructor.MAP_STATUS,
      isDuplicateOrderError: actual.constructor.isDuplicateOrderError,
    },
  };
});

jest.mock("../../services/pickupLocationService", () => ({
  resolvePickupForSeller: jest.fn(),
}));

jest.mock("../../models/ReturnRequest");
jest.mock("../../models/Order");
jest.mock("../../models/Seller");

const ReturnRequest = require("../../models/ReturnRequest");
const Order = require("../../models/Order");
const Seller = require("../../models/Seller");
const pickupLocationService = require("../../services/pickupLocationService");
const shipRocketService = require("../../services/shipRocketService");
const {
  scheduleReturnPickup,
  retryReturnPickup,
  syncReturnTracking,
  toReverseLogisticsDTO,
  MAP_RETURN_TRACKING,
  buildExternalOrderKey,
} = require("../../services/reverseLogisticsService");

const requestId = "507f1f77bcf86cd799439021";
const sellerId = "507f1f77bcf86cd799439022";
const orderId = "507f1f77bcf86cd799439023";

function baseOrder() {
  return {
    _id: orderId,
    invoiceNumber: "INV-100",
    totalAmount: 500,
    shippingDetails: {
      name: "Buyer Name",
      email: "buyer@example.com",
      phone: "9876543210",
      address: "12 Test Street",
      city: "Delhi",
      state: "Delhi",
      pincode: "110001",
      country: "India",
    },
    items: [
      {
        product: { name: "Widget", sku: "W1", weight: 0.5 },
        quantity: 1,
        price: 500,
      },
    ],
  };
}

function mockOrderLookup(order = baseOrder()) {
  Order.findById.mockReturnValue({
    populate: jest.fn().mockResolvedValue(order),
  });
}

function mockSellerDestination() {
  pickupLocationService.resolvePickupForSeller.mockResolvedValue({
    name: "Warehouse A",
    shiprocketId: 99,
    email: "wh@example.com",
    phone: "9123456780",
    address: {
      address: "Seller St",
      city: "Mumbai",
      state: "Maharashtra",
      pincode: "400001",
      country: "India",
    },
  });
  Seller.findById.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        shopName: "Test Shop",
        email: "seller@example.com",
        phone: "9123456780",
      }),
    }),
  });
}

function mockLeanRequest(doc) {
  ReturnRequest.findById.mockReturnValue({
    lean: jest.fn().mockResolvedValue(doc),
  });
}

describe("reverseLogisticsService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.DISABLE_REVERSE_LOGISTICS;
    process.env.REVERSE_LOGISTICS_PROVIDER = "shiprocket";
    shipRocketService.findOrderByChannelOrderId.mockResolvedValue(null);
  });

  describe("MAP_RETURN_TRACKING", () => {
    it("maps carrier statuses to reverse logistics buckets", () => {
      expect(MAP_RETURN_TRACKING("PICKED UP")).toBe("in_transit");
      expect(MAP_RETURN_TRACKING("IN TRANSIT")).toBe("in_transit");
      expect(MAP_RETURN_TRACKING("DELIVERED")).toBe("delivered");
      expect(MAP_RETURN_TRACKING("PICKUP SCHEDULED")).toBe("scheduled");
      expect(MAP_RETURN_TRACKING("CANCELED")).toBe("failed");
      expect(MAP_RETURN_TRACKING(null)).toBeNull();
    });
  });

  describe("toReverseLogisticsDTO", () => {
    it("returns null for empty logistics", () => {
      expect(toReverseLogisticsDTO(null)).toBeNull();
      expect(toReverseLogisticsDTO({})).toBeNull();
    });

    it("maps fields and canRetry for failed status", () => {
      const dto = toReverseLogisticsDTO({
        provider: "shiprocket",
        status: "failed",
        awbCode: null,
        lastError: "API down",
        retryCount: 1,
      });
      expect(dto.status).toBe("failed");
      expect(dto.canRetry).toBe(true);
      expect(dto.lastError).toBe("API down");
    });

    it("does not allow retry while scheduling claim is held", () => {
      const dto = toReverseLogisticsDTO({
        status: "scheduling",
        provider: "shiprocket",
      });
      expect(dto.canRetry).toBe(false);
    });
  });

  describe("scheduleReturnPickup", () => {
    it("claims, creates, and persists scheduled logistics on Shiprocket success", async () => {
      const requestDoc = {
        _id: requestId,
        order: orderId,
        caseFlow: "after_sales",
        returnRequired: true,
        status: "awaiting_pickup",
        reverseLogistics: null,
      };

      mockLeanRequest(requestDoc);
      mockOrderLookup();
      mockSellerDestination();

      ReturnRequest.findOneAndUpdate.mockResolvedValue({
        ...requestDoc,
        reverseLogistics: {
          status: "scheduling",
          externalOrderKey: buildExternalOrderKey(baseOrder(), requestId),
          retryCount: 0,
        },
      });
      ReturnRequest.findByIdAndUpdate.mockResolvedValue({
        ...requestDoc,
        reverseLogistics: { status: "scheduled", awbCode: "AWB123" },
      });

      shipRocketService.createReturnOrder.mockResolvedValue({
        order_id: 111,
        shipment_id: 222,
      });
      shipRocketService.generateAWB.mockResolvedValue({
        response: { data: { awb_code: "AWB123", courier_name: "Blitz" } },
      });

      const result = await scheduleReturnPickup({
        requestId,
        sellerId,
        isRetry: false,
      });

      expect(result.scheduled).toBe(true);
      expect(ReturnRequest.findOneAndUpdate).toHaveBeenCalled();
      expect(shipRocketService.createReturnOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          order_id: buildExternalOrderKey(baseOrder(), requestId),
        })
      );
      const patchArg = ReturnRequest.findByIdAndUpdate.mock.calls[0][1];
      expect(patchArg.$set["reverseLogistics.status"]).toBe("scheduled");
      expect(patchArg.$set["reverseLogistics.awbCode"]).toBe("AWB123");
    });

    it("persists failed logistics when Shiprocket errors (non-duplicate)", async () => {
      mockLeanRequest({
        _id: requestId,
        order: orderId,
        caseFlow: "after_sales",
        returnRequired: true,
        status: "awaiting_pickup",
        reverseLogistics: { retryCount: 0 },
      });
      mockOrderLookup({ ...baseOrder(), invoiceNumber: "INV-101" });
      mockSellerDestination();

      ReturnRequest.findOneAndUpdate.mockResolvedValue({
        reverseLogistics: { status: "scheduling", retryCount: 0 },
      });
      ReturnRequest.findByIdAndUpdate.mockResolvedValue({
        reverseLogistics: { status: "failed" },
      });

      shipRocketService.createReturnOrder.mockRejectedValue(
        new Error("Shiprocket down")
      );

      const result = await scheduleReturnPickup({ requestId, sellerId });
      expect(result.failed).toBe(true);
      expect(result.message).toMatch(/Shiprocket down/);
      const patchArg = ReturnRequest.findByIdAndUpdate.mock.calls[0][1];
      expect(patchArg.$set["reverseLogistics.status"]).toBe("failed");
      expect(patchArg.$set["reverseLogistics.schedulingClaimedAt"]).toBeNull();
    });

    it("skips provider call when reverse logistics disabled", async () => {
      process.env.DISABLE_REVERSE_LOGISTICS = "true";
      mockLeanRequest({
        _id: requestId,
        caseFlow: "after_sales",
        returnRequired: true,
        status: "awaiting_pickup",
        reverseLogistics: {},
      });
      ReturnRequest.findByIdAndUpdate.mockResolvedValue({ _id: requestId });

      const result = await scheduleReturnPickup({ requestId, sellerId });
      expect(result.failed).toBe(true);
      expect(ReturnRequest.findOneAndUpdate).not.toHaveBeenCalled();
      expect(shipRocketService.createReturnOrder).not.toHaveBeenCalled();
    });

    it("blocks concurrent schedule when claim is already held", async () => {
      mockLeanRequest({
        _id: requestId,
        order: orderId,
        caseFlow: "after_sales",
        returnRequired: true,
        status: "awaiting_pickup",
        reverseLogistics: { status: "failed" },
      });
      mockOrderLookup();

      ReturnRequest.findOneAndUpdate.mockResolvedValue(null);
      // resolveClaimConflict re-reads
      ReturnRequest.findById.mockReturnValue({
        lean: jest
          .fn()
          .mockResolvedValueOnce({
            _id: requestId,
            order: orderId,
            caseFlow: "after_sales",
            returnRequired: true,
            status: "awaiting_pickup",
            reverseLogistics: { status: "failed" },
          })
          .mockResolvedValueOnce({
            _id: requestId,
            reverseLogistics: {
              status: "scheduling",
              schedulingClaimedAt: new Date(),
              provider: "shiprocket",
            },
          }),
      });

      const result = await scheduleReturnPickup({ requestId, sellerId });
      expect(result.conflict).toBe(true);
      expect(shipRocketService.createReturnOrder).not.toHaveBeenCalled();
    });

    it("recovers existing carrier order before create (timeout after success)", async () => {
      mockLeanRequest({
        _id: requestId,
        order: orderId,
        caseFlow: "after_sales",
        returnRequired: true,
        status: "awaiting_pickup",
        reverseLogistics: {
          status: "failed",
          externalOrderKey: buildExternalOrderKey(baseOrder(), requestId),
          lastError: "timeout",
        },
      });
      mockOrderLookup();
      mockSellerDestination();

      ReturnRequest.findOneAndUpdate.mockResolvedValue({
        reverseLogistics: {
          status: "scheduling",
          retryCount: 1,
          externalOrderKey: buildExternalOrderKey(baseOrder(), requestId),
        },
      });
      ReturnRequest.findByIdAndUpdate.mockResolvedValue({
        reverseLogistics: { status: "scheduled", awbCode: "AWB-REC" },
      });

      shipRocketService.findOrderByChannelOrderId.mockResolvedValue({
        id: 999,
        channel_order_id: buildExternalOrderKey(baseOrder(), requestId),
        shipments: [{ id: 888, awb: "AWB-REC", courier_name: "Blitz" }],
      });

      const result = await scheduleReturnPickup({
        requestId,
        sellerId,
        isRetry: true,
      });

      expect(result.scheduled).toBe(true);
      expect(result.recovered).toBe(true);
      expect(shipRocketService.createReturnOrder).not.toHaveBeenCalled();
      const patchArg = ReturnRequest.findByIdAndUpdate.mock.calls[0][1];
      expect(patchArg.$set["reverseLogistics.status"]).toBe("scheduled");
      expect(patchArg.$set["reverseLogistics.awbCode"]).toBe("AWB-REC");
      expect(patchArg.$set["reverseLogistics.shiprocketOrderId"]).toBe("999");
    });

    it("recovers when carrier reports duplicate order_id", async () => {
      mockLeanRequest({
        _id: requestId,
        order: orderId,
        caseFlow: "after_sales",
        returnRequired: true,
        status: "awaiting_pickup",
        reverseLogistics: { status: "failed" },
      });
      mockOrderLookup();
      mockSellerDestination();

      ReturnRequest.findOneAndUpdate.mockResolvedValue({
        reverseLogistics: {
          status: "scheduling",
          retryCount: 1,
          externalOrderKey: buildExternalOrderKey(baseOrder(), requestId),
        },
      });
      ReturnRequest.findByIdAndUpdate.mockResolvedValue({
        reverseLogistics: { status: "scheduled" },
      });

      // First lookup (pre-create) empty; second (after duplicate) finds order
      shipRocketService.findOrderByChannelOrderId
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 555,
          channel_order_id: buildExternalOrderKey(baseOrder(), requestId),
          shipments: [{ id: 556, awb: "AWB-DUP", courier_name: "X" }],
        });

      const dupError = new Error("order_id already exists");
      dupError.statusCode = 422;
      dupError.isDuplicate = true;
      shipRocketService.createReturnOrder.mockRejectedValue(dupError);

      const result = await scheduleReturnPickup({
        requestId,
        sellerId,
        isRetry: true,
      });

      expect(result.scheduled).toBe(true);
      expect(result.recovered).toBe(true);
      expect(result.duplicateRecovered).toBe(true);
      expect(shipRocketService.createReturnOrder).toHaveBeenCalledTimes(1);
      const patchArg = ReturnRequest.findByIdAndUpdate.mock.calls[0][1];
      expect(patchArg.$set["reverseLogistics.awbCode"]).toBe("AWB-DUP");
    });

    it("returns alreadyScheduled on repeated retry after success", async () => {
      mockLeanRequest({
        _id: requestId,
        order: orderId,
        caseFlow: "after_sales",
        returnRequired: true,
        status: "awaiting_pickup",
        reverseLogistics: {
          status: "scheduled",
          shiprocketOrderId: "111",
          awbCode: "AWB1",
        },
      });

      const result = await scheduleReturnPickup({
        requestId,
        sellerId,
        isRetry: true,
      });

      expect(result.alreadyScheduled).toBe(true);
      expect(ReturnRequest.findOneAndUpdate).not.toHaveBeenCalled();
      expect(shipRocketService.createReturnOrder).not.toHaveBeenCalled();
    });
  });

  describe("retryReturnPickup", () => {
    it("returns conflict when a fresh scheduling claim is held", async () => {
      mockLeanRequest({
        _id: requestId,
        reverseLogistics: {
          status: "scheduling",
          schedulingClaimedAt: new Date(),
          provider: "shiprocket",
        },
      });

      const result = await retryReturnPickup({ requestId, sellerId });
      expect(result.conflict).toBe(true);
      expect(shipRocketService.createReturnOrder).not.toHaveBeenCalled();
    });
  });

  describe("syncReturnTracking", () => {
    it("advances awaiting_pickup → in_transit on PICKED UP", async () => {
      const request = {
        _id: requestId,
        caseFlow: "after_sales",
        status: "awaiting_pickup",
        reverseLogistics: {
          awbCode: "AWB9",
          status: "scheduled",
          lastProviderStatus: "PICKUP SCHEDULED",
        },
      };

      shipRocketService.getTracking.mockResolvedValue({
        tracking_data: {
          shipment_track: [{ current_status: "PICKED UP" }],
        },
      });

      ReturnRequest.findByIdAndUpdate.mockResolvedValue({
        ...request,
        status: "in_transit",
        reverseLogistics: { ...request.reverseLogistics, status: "in_transit" },
      });

      const result = await syncReturnTracking(request);
      expect(result.synced).toBe(true);
      expect(result.statusAdvanced).toBe(true);
      const updateArg = ReturnRequest.findByIdAndUpdate.mock.calls[0][1];
      expect(updateArg.$set.status).toBe("in_transit");
      expect(updateArg.$push.statusHistory.toStatus).toBe("in_transit");
    });

    it("does not auto-confirm receipt on DELIVERED", async () => {
      const request = {
        _id: requestId,
        caseFlow: "after_sales",
        status: "in_transit",
        reverseLogistics: {
          awbCode: "AWB9",
          status: "in_transit",
        },
      };

      shipRocketService.getTracking.mockResolvedValue({
        tracking_data: {
          shipment_track: [{ current_status: "DELIVERED" }],
        },
      });

      ReturnRequest.findByIdAndUpdate.mockResolvedValue(request);

      const result = await syncReturnTracking(request);
      expect(result.synced).toBe(true);
      expect(result.statusAdvanced).toBe(false);
      const updateArg = ReturnRequest.findByIdAndUpdate.mock.calls[0][1];
      expect(updateArg.$set.status).toBeUndefined();
      expect(updateArg.$set["reverseLogistics.status"]).toBe("delivered");
    });
  });
});

describe("ShipRocketService.isDuplicateOrderError", () => {
  const { constructor: SR } = jest.requireActual(
    "../../services/shipRocketService"
  );

  it("detects 422 already-exists responses", () => {
    expect(
      SR.isDuplicateOrderError(422, "order_id already exists", null)
    ).toBe(true);
    expect(SR.isDuplicateOrderError(500, "timeout", null)).toBe(false);
  });
});
