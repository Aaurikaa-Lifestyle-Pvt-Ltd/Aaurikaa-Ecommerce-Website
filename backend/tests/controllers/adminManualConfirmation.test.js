const request = require("supertest");
const express = require("express");

jest.mock("../../services/manualConfirmationService");

const {
  listManualConfirmationQueue,
  updateManualConfirmationStatus,
} = require("../../services/manualConfirmationService");
const {
  listConfirmationQueue,
  patchConfirmationStatus,
} = require("../../controllers/admin/manualConfirmationController");

const app = express();
app.use(express.json());

const mockVerifyAdmin = (req, res, next) => {
  req.user = { id: "admin507f1f77bcf86cd799439001", role: "admin" };
  next();
};

app.get("/api/admin/orders/manual-confirmations", mockVerifyAdmin, listConfirmationQueue);
app.patch(
  "/api/admin/orders/:id/manual-confirmation",
  mockVerifyAdmin,
  patchConfirmationStatus
);

describe("Admin manual confirmation endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns paginated confirmation queue", async () => {
    listManualConfirmationQueue.mockResolvedValue({
      orders: [{ _id: "o1", manualConfirmation: { status: "CALL_PENDING", eligible: true } }],
      pagination: { page: 1, limit: 10, totalCount: 1, totalPages: 1 },
    });

    const response = await request(app)
      .get("/api/admin/orders/manual-confirmations?page=1&limit=10&status=CALL_PENDING")
      .expect(200);

    expect(listManualConfirmationQueue).toHaveBeenCalledWith({
      page: "1",
      limit: "10",
      status: "CALL_PENDING",
    });
    expect(response.body.success).toBe(true);
    expect(response.body.orders).toHaveLength(1);
  });

  it("updates confirmation status for admin", async () => {
    updateManualConfirmationStatus.mockResolvedValue({
      manualConfirmation: { status: "CONFIRMED", eligible: false },
    });

    const response = await request(app)
      .patch("/api/admin/orders/507f1f77bcf86cd799439011/manual-confirmation")
      .send({ status: "CONFIRMED", notes: "Called shopper" })
      .expect(200);

    expect(updateManualConfirmationStatus).toHaveBeenCalledWith({
      orderId: "507f1f77bcf86cd799439011",
      adminId: "admin507f1f77bcf86cd799439001",
      status: "CONFIRMED",
      notes: "Called shopper",
    });
    expect(response.body.manualConfirmation.status).toBe("CONFIRMED");
  });

  it("returns validation errors from service", async () => {
    updateManualConfirmationStatus.mockResolvedValue({
      invalid: true,
      message: "Invalid manual confirmation status.",
    });

    const response = await request(app)
      .patch("/api/admin/orders/507f1f77bcf86cd799439011/manual-confirmation")
      .send({ status: "INVALID" })
      .expect(400);

    expect(response.body.message).toBe("Invalid manual confirmation status.");
  });
});
