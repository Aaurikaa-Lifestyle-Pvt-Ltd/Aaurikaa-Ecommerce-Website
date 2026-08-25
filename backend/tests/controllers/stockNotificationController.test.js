const request = require("supertest");
const express = require("express");

jest.mock("../../services/stockNotificationService");

const {
  createStockNotificationRequest,
  listStockNotificationRequests,
} = require("../../services/stockNotificationService");
const stockNotificationController = require("../../controllers/stockNotificationController");

const app = express();
app.use(express.json());

const mockVerifyShopper = (req, res, next) => {
  req.user = { id: "507f1f77bcf86cd799439099" };
  next();
};

const mockVerifyAdmin = (req, res, next) => {
  req.user = { id: "507f1f77bcf86cd799439088", role: "admin" };
  next();
};

app.post("/api/shopper/stock-notifications", mockVerifyShopper, stockNotificationController.createNotificationRequest);
app.get("/api/admin/stock-notifications", mockVerifyAdmin, stockNotificationController.listNotificationRequests);

describe("stockNotificationController", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates notification request for authenticated shopper", async () => {
    createStockNotificationRequest.mockResolvedValue({
      success: true,
      statusCode: 201,
      message: "We will notify you when this item is back in stock.",
      requestId: "507f1f77bcf86cd799439020",
      alreadyExists: false,
    });

    const response = await request(app)
      .post("/api/shopper/stock-notifications")
      .send({ productId: "507f1f77bcf86cd799439012" })
      .expect(201);

    expect(createStockNotificationRequest).toHaveBeenCalledWith({
      shopperId: "507f1f77bcf86cd799439099",
      productId: "507f1f77bcf86cd799439012",
      variantCombination: undefined,
    });
    expect(response.body.success).toBe(true);
  });

  it("requires productId in request body", async () => {
    const response = await request(app).post("/api/shopper/stock-notifications").send({}).expect(400);

    expect(response.body.message).toMatch(/productId/i);
    expect(createStockNotificationRequest).not.toHaveBeenCalled();
  });

  it("lists active requests for admin", async () => {
    listStockNotificationRequests.mockResolvedValue({
      requests: [{ _id: "507f1f77bcf86cd799439020", status: "pending" }],
      pagination: { page: 1, limit: 20, totalCount: 1, totalPages: 1 },
    });

    const response = await request(app).get("/api/admin/stock-notifications?status=pending").expect(200);

    expect(listStockNotificationRequests).toHaveBeenCalledWith({
      status: "pending",
      page: undefined,
      limit: undefined,
    });
    expect(response.body.requests).toHaveLength(1);
  });
});
