const request = require("supertest");
const express = require("express");

jest.mock("../../models/Order");
jest.mock("../../services/manualConfirmationService");

const Order = require("../../models/Order");
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
  req.user = { id: "shopper123" };
  next();
};

app.get("/api/shopper/orders", mockVerifyShopper, listShopperOrders);

describe("Order Management Data Structure", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    buildManualConfirmationMap.mockResolvedValue(new Map());
  });

  test("returns listing DTO with product preview fields", async () => {
    const mockOrders = [
      {
        _id: "order1",
        buyer: "shopper123",
        invoiceNumber: "INV-TEST-1",
        items: [
          {
            product: {
              _id: "product1",
              name: "Test Product 1",
              slug: "test-product-1",
              mainImage: "product1.jpg",
            },
            quantity: 2,
            price: 100,
          },
        ],
        totalAmount: 400,
        status: "delivered",
        paymentMethod: "cod",
        paymentStatus: "pending",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
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

    const response = await request(app).get("/api/shopper/orders").expect(200);

    expect(response.body.orders).toHaveLength(1);
    expect(response.body.orders[0].itemsPreview).toHaveLength(1);
    expect(response.body.orders[0].itemsPreview[0]).toMatchObject({
      productName: "Test Product 1",
      productSlug: "test-product-1",
      image: "product1.jpg",
    });
    expectShopperVisibleFilter(Order.find.mock.calls[0][0], "shopper123");
    expect(response.body.orders[0]).toMatchObject({
      cancelEligibility: expect.objectContaining({ eligible: expect.any(Boolean) }),
      manualConfirmation: expect.objectContaining({ eligible: expect.any(Boolean) }),
      paymentVisibility: expect.any(Object),
      trackingSummary: expect.any(Object),
    });
  });

  test("handles orders with missing product data gracefully", async () => {
    const mockOrders = [
      {
        _id: "order1",
        buyer: "shopper123",
        items: [{ product: null, quantity: 1, price: 100 }],
        totalAmount: 100,
        status: "delivered",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
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

    const response = await request(app).get("/api/shopper/orders").expect(200);

    expect(response.body.orders[0].itemsPreview[0].productName).toBe(
      "Product unavailable"
    );
  });

  test("should handle database errors gracefully", async () => {
    Order.countDocuments.mockRejectedValue(new Error("Database connection failed"));

    const response = await request(app).get("/api/shopper/orders").expect(500);

    expect(response.body).toHaveProperty("message", "Failed to fetch orders");
  });
});
