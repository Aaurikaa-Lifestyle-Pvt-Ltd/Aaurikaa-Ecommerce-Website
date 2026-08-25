const request = require("supertest");
const express = require("express");

jest.mock("../../services/buyAgainService");

const { processBuyAgain } = require("../../services/buyAgainService");
const { buyAgainFromOrder } = require("../../controllers/shopperOrderController");

const app = express();
app.use(express.json());

const mockVerifyShopper = (req, res, next) => {
  req.user = { id: "507f1f77bcf86cd799439099" };
  next();
};

app.post("/api/shopper/orders/:id/buy-again", mockVerifyShopper, buyAgainFromOrder);

describe("Shopper Buy Again endpoint", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns structured buy again summary", async () => {
    processBuyAgain.mockResolvedValue({
      notFound: false,
      success: true,
      addedItems: [{ productId: "p1", productName: "Product A", quantity: 1 }],
      failedItems: [{ productId: "p2", productName: "Product B", reason: "OUT_OF_STOCK" }],
      warnings: ["Item is out of stock"],
    });

    const response = await request(app)
      .post("/api/shopper/orders/507f1f77bcf86cd799439011/buy-again")
      .expect(200);

    expect(processBuyAgain).toHaveBeenCalledWith({
      orderId: "507f1f77bcf86cd799439011",
      shopperId: "507f1f77bcf86cd799439099",
    });
    expect(response.body).toEqual({
      success: true,
      addedItems: [{ productId: "p1", productName: "Product A", quantity: 1 }],
      failedItems: [{ productId: "p2", productName: "Product B", reason: "OUT_OF_STOCK" }],
      warnings: ["Item is out of stock"],
    });
  });

  it("returns 404 when order is not found", async () => {
    processBuyAgain.mockResolvedValue({ notFound: true });

    const response = await request(app)
      .post("/api/shopper/orders/507f1f77bcf86cd799439011/buy-again")
      .expect(404);

    expect(response.body).toEqual({ message: "Order not found" });
  });
});
