const request = require("supertest");
const express = require("express");

jest.mock("../../models/Order");
jest.mock("../../models/SiteSettings");
jest.mock("../../services/manualConfirmationService");

const Order = require("../../models/Order");
const SiteSettings = require("../../models/SiteSettings");
const { buildManualConfirmationMap } = require("../../services/manualConfirmationService");
const { listShopperOrders } = require("../../controllers/shopperOrderController");

function expectShopperVisibleFilter(callArg, buyerId) {
  expect(callArg.buyer).toBe(buyerId);
  expect(callArg.$or).toEqual([
    { status: { $nin: ["delivered", "completed", "cancelled"] } },
    { createdAt: { $gt: expect.any(Date) } },
  ]);
}

const app = express();
app.use(express.json());

const mockVerifyShopper = (req, res, next) => {
  req.user = { id: "507f1f77bcf86cd799439099" };
  next();
};

app.get("/api/shopper/orders", mockVerifyShopper, listShopperOrders);

describe("Shopper order listing (DTO)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    buildManualConfirmationMap.mockResolvedValue(
      new Map([
        [
          "507f1f77bcf86cd799439011",
          { eligible: true, status: "CALL_PENDING" },
        ],
      ])
    );
    SiteSettings.findOne.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ returnWindowDays: 7 }),
    });
  });

  it("returns paginated normalized DTOs", async () => {
    const mockOrders = [
      {
        _id: "507f1f77bcf86cd799439011",
        invoiceNumber: "INV-20260101-0001",
        buyer: "507f1f77bcf86cd799439099",
        status: "pending",
        totalAmount: 400,
        paymentMethod: "cod",
        paymentStatus: "pending",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        items: [
          {
            quantity: 1,
            product: {
              _id: "507f1f77bcf86cd799439012",
              name: "Test Product",
              slug: "test-product",
              mainImage: "img.png",
            },
          },
        ],
        shiprocketShipments: [],
      },
    ];

    Order.countDocuments.mockResolvedValue(1);
    Order.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockOrders),
    });

    const response = await request(app)
      .get("/api/shopper/orders?page=1&limit=10")
      .expect(200);

    expectShopperVisibleFilter(Order.find.mock.calls[0][0], "507f1f77bcf86cd799439099");
    expectShopperVisibleFilter(
      Order.countDocuments.mock.calls[0][0],
      "507f1f77bcf86cd799439099"
    );
    expect(response.body.pagination).toMatchObject({
      page: 1,
      limit: 10,
      totalCount: 1,
      totalPages: 1,
    });
    expect(response.body.orders).toHaveLength(1);
      expect(response.body.orders[0]).toMatchObject({
      _id: "507f1f77bcf86cd799439011",
      orderId: "INV-20260101-0001",
      orderStatus: "pending",
      total: 400,
      cancelEligibility: {
        eligible: true,
        reason: "ELIGIBLE",
        message: "Order can be cancelled.",
      },
      invoiceAvailable: true,
    });
    expect(response.body.orders[0].manualConfirmation).toEqual({
      eligible: true,
      status: "CALL_PENDING",
    });
    expect(response.body.orders[0].itemsPreview[0]).toMatchObject({
      productName: "Test Product",
      productSlug: "test-product",
    });
    expect(response.body.orders[0].paymentVisibility).toHaveProperty("paymentStatus");
    expect(response.body.orders[0].trackingSummary).toHaveProperty("awbAvailable", false);
  });

  it("handles database errors", async () => {
    Order.countDocuments.mockRejectedValue(new Error("Database connection failed"));

    const response = await request(app).get("/api/shopper/orders").expect(500);

    expect(response.body).toHaveProperty("message", "Failed to fetch orders");
  });

  it("excludes archived orders from pagination counts", async () => {
    Order.countDocuments.mockResolvedValue(2);
    Order.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });

    await request(app).get("/api/shopper/orders?page=1&limit=10").expect(200);

    const visibilityFilter = Order.countDocuments.mock.calls[0][0];
    expectShopperVisibleFilter(visibilityFilter, "507f1f77bcf86cd799439099");
    expect(Order.find).toHaveBeenCalledWith(visibilityFilter);
  });
});
