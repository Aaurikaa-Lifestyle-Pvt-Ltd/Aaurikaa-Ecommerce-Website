const request = require("supertest");
const express = require("express");

jest.mock("../../models/Order");
jest.mock("../../models/Review");
jest.mock("../../models/SiteSettings");
jest.mock("../../services/manualConfirmationService");

const Order = require("../../models/Order");
const Review = require("../../models/Review");
const SiteSettings = require("../../models/SiteSettings");
const {
  isManualConfirmationEligible,
  toShopperManualConfirmationDTO,
} = require("../../services/manualConfirmationService");
const { getShopperOrderDetail } = require("../../controllers/shopperOrderController");

const app = express();
app.use(express.json());

const mockVerifyShopper = (req, res, next) => {
  req.user = { id: "507f1f77bcf86cd799439099" };
  next();
};

app.get("/api/shopper/orders/:id", mockVerifyShopper, getShopperOrderDetail);

describe("Shopper order detail (DTO)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isManualConfirmationEligible.mockResolvedValue(false);
    toShopperManualConfirmationDTO.mockReturnValue({ eligible: false, status: null });
    SiteSettings.findOne.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ returnWindowDays: 7 }),
    });
  });

  it("returns normalized detail DTO for owned order", async () => {
    const mockOrder = {
      _id: "507f1f77bcf86cd799439011",
      invoiceNumber: "INV-20260101-0001",
      buyer: "507f1f77bcf86cd799439099",
      status: "delivered",
      deliveredAt: new Date(),
      totalAmount: 500,
      paymentMethod: "cod",
      paymentStatus: "pending",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      shippingCharge: 0,
      bulkDiscountSummary: {},
      coupon: {},
      tax: { totalTaxAmount: 0 },
      items: [
        {
          quantity: 1,
          price: 500,
          product: {
            _id: "507f1f77bcf86cd799439012",
            name: "Test Product",
            slug: "test-product",
            mainImage: "img.png",
            seller: { shopName: "Shop", shopUrl: "shop" },
          },
        },
      ],
      shiprocketShipments: [],
    };

    Order.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockOrder),
    });
    Review.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });
    isManualConfirmationEligible.mockResolvedValue(true);
    toShopperManualConfirmationDTO.mockReturnValue({
      eligible: true,
      status: "CALL_PENDING",
    });

    const response = await request(app)
      .get("/api/shopper/orders/507f1f77bcf86cd799439011")
      .expect(200);

    expect(Order.findOne).toHaveBeenCalledWith({
      _id: "507f1f77bcf86cd799439011",
      buyer: "507f1f77bcf86cd799439099",
    });
    expect(response.body.order).toMatchObject({
      _id: "507f1f77bcf86cd799439011",
      orderId: "INV-20260101-0001",
      orderStatus: "delivered",
    });
    expect(response.body.order.manualConfirmation).toEqual({
      eligible: true,
      status: "CALL_PENDING",
    });
    expect(response.body.order.paymentVisibility).toHaveProperty("paymentType", "COD");
    expect(response.body.order.pricingSummary).toHaveProperty("total", 500);
    expect(response.body.order.reviewEligibility).toEqual({
      eligible: true,
      alreadyReviewed: false,
      delivered: true,
      reason: "ELIGIBLE",
    });
    expect(response.body.order.items[0].reviewEligibility).toEqual({
      eligible: true,
      alreadyReviewed: false,
      delivered: true,
      reason: "ELIGIBLE",
    });
  });

  it("returns detail for archived orders (direct access not blocked)", async () => {
    const archivedOrder = {
      _id: "507f1f77bcf86cd799439020",
      invoiceNumber: "INV-OLD-0001",
      buyer: "507f1f77bcf86cd799439099",
      status: "delivered",
      deliveredAt: new Date("2020-01-05T00:00:00.000Z"),
      totalAmount: 300,
      paymentMethod: "cod",
      paymentStatus: "success",
      createdAt: new Date("2020-01-01T00:00:00.000Z"),
      updatedAt: new Date("2020-01-05T00:00:00.000Z"),
      shippingCharge: 0,
      bulkDiscountSummary: {},
      coupon: {},
      tax: { totalTaxAmount: 0 },
      items: [
        {
          quantity: 1,
          price: 300,
          product: {
            _id: "507f1f77bcf86cd799439012",
            name: "Archived Product",
            slug: "archived-product",
            mainImage: "img.png",
            seller: { shopName: "Shop", shopUrl: "shop" },
          },
        },
      ],
      shiprocketShipments: [],
    };

    Order.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(archivedOrder),
    });
    Review.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });

    const response = await request(app)
      .get("/api/shopper/orders/507f1f77bcf86cd799439020")
      .expect(200);

    expect(Order.findOne).toHaveBeenCalledWith({
      _id: "507f1f77bcf86cd799439020",
      buyer: "507f1f77bcf86cd799439099",
    });
    expect(response.body.order.orderStatus).toBe("delivered");
    expect(response.body.order.orderId).toBe("INV-OLD-0001");
  });

  it("returns 404 when order is not found or not owned", async () => {
    Order.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null),
    });

    const response = await request(app)
      .get("/api/shopper/orders/507f1f77bcf86cd799439011")
      .expect(404);

    expect(response.body).toHaveProperty("message", "Order not found");
  });

  it("handles database errors", async () => {
    Order.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockRejectedValue(new Error("Database connection failed")),
    });

    const response = await request(app)
      .get("/api/shopper/orders/507f1f77bcf86cd799439011")
      .expect(500);

    expect(response.body).toHaveProperty("message", "Failed to fetch order details");
  });
});
