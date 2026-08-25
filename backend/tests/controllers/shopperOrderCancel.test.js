const request = require("supertest");
const express = require("express");

jest.mock("../../models/Order");
jest.mock("../../services/orderCommerceIntegrityService", () => ({
  onOrderCancelled: jest.fn().mockResolvedValue({ success: true }),
}));

const Order = require("../../models/Order");
const { cancelShopperOrder } = require("../../controllers/shopperOrderController");

const app = express();
app.use(express.json());

const mockVerifyShopper = (req, res, next) => {
  req.user = { id: "507f1f77bcf86cd799439099" };
  next();
};

app.put("/api/orders/:id/cancel", mockVerifyShopper, cancelShopperOrder);

describe("Shopper order cancellation endpoint", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("cancels an eligible order with a valid reason", async () => {
    const order = {
      _id: "507f1f77bcf86cd799439011",
      status: "pending",
      buyer: "507f1f77bcf86cd799439099",
      save: jest.fn().mockResolvedValue(undefined),
    };

    Order.findOne.mockResolvedValue(order);

    const response = await request(app)
      .put("/api/orders/507f1f77bcf86cd799439011/cancel")
      .send({ reasonCode: "CHANGE_OF_MIND" })
      .expect(200);

    expect(Order.findOne).toHaveBeenCalledWith({
      _id: "507f1f77bcf86cd799439011",
      buyer: "507f1f77bcf86cd799439099",
    });
    expect(order.status).toBe("cancelled");
    expect(order.cancelledBy).toBe("507f1f77bcf86cd799439099");
    expect(order.cancellationReasonCode).toBe("CHANGE_OF_MIND");
    expect(order.cancelledAt).toBeInstanceOf(Date);
    expect(order.save).toHaveBeenCalled();
    expect(response.body.message).toBe("Order cancelled successfully");
    expect(response.body.cancelEligibility.eligible).toBe(false);
    expect(response.body.cancelEligibility.reason).toBe("ORDER_ALREADY_CANCELLED");
  });

  it("returns 404 when order is not owned by shopper", async () => {
    Order.findOne.mockResolvedValue(null);

    const response = await request(app)
      .put("/api/orders/507f1f77bcf86cd799439011/cancel")
      .send({ reasonCode: "CHANGE_OF_MIND" })
      .expect(404);

    expect(response.body).toEqual({ message: "Order not found" });
  });

  it("blocks shipped orders authoritatively", async () => {
    Order.findOne.mockResolvedValue({
      _id: "507f1f77bcf86cd799439011",
      status: "shipped",
      buyer: "507f1f77bcf86cd799439099",
    });

    const response = await request(app)
      .put("/api/orders/507f1f77bcf86cd799439011/cancel")
      .send({ reasonCode: "CHANGE_OF_MIND" })
      .expect(400);

    expect(response.body.cancelEligibility).toEqual({
      eligible: false,
      reason: "ORDER_ALREADY_SHIPPED",
      message: "This order has already been shipped.",
    });
  });

  it("blocks orders with AWB assigned", async () => {
    Order.findOne.mockResolvedValue({
      _id: "507f1f77bcf86cd799439011",
      status: "paid",
      trackingNumber: "AWB999",
      buyer: "507f1f77bcf86cd799439099",
    });

    const response = await request(app)
      .put("/api/orders/507f1f77bcf86cd799439011/cancel")
      .send({ reasonCode: "CHANGE_OF_MIND" })
      .expect(400);

    expect(response.body.cancelEligibility.reason).toBe("AWB_ASSIGNED");
  });

  it("blocks orders with existing shipments", async () => {
    Order.findOne.mockResolvedValue({
      _id: "507f1f77bcf86cd799439011",
      status: "paid",
      shiprocketShipments: [{ status: "created" }],
      buyer: "507f1f77bcf86cd799439099",
    });

    const response = await request(app)
      .put("/api/orders/507f1f77bcf86cd799439011/cancel")
      .send({ reasonCode: "CHANGE_OF_MIND" })
      .expect(400);

    expect(response.body.cancelEligibility.reason).toBe("SHIPMENT_CREATED");
  });

  it("validates mandatory cancellation reason", async () => {
    const response = await request(app)
      .put("/api/orders/507f1f77bcf86cd799439011/cancel")
      .send({})
      .expect(400);

    expect(response.body).toEqual({ message: "Cancellation reason is required." });
    expect(Order.findOne).not.toHaveBeenCalled();
  });

  it("requires custom reason for OTHER", async () => {
    Order.findOne.mockResolvedValue({
      _id: "507f1f77bcf86cd799439011",
      status: "pending",
      buyer: "507f1f77bcf86cd799439099",
      save: jest.fn(),
    });

    const response = await request(app)
      .put("/api/orders/507f1f77bcf86cd799439011/cancel")
      .send({ reasonCode: "OTHER" })
      .expect(400);

    expect(response.body).toEqual({
      message: "Please provide a reason for cancellation.",
    });
  });
});
