const request = require("supertest");
const express = require("express");

jest.mock("../../services/adminReturnService");

const {
  listReturnReviewQueue,
  getReturnRequestDetail,
  reviewReturnRequest,
  reviewRefundRequest,
  completeRefundRequest,
} = require("../../services/adminReturnService");
const {
  listReturnQueue,
  getReturnRequest,
  patchReturnReview,
  patchRefundReview,
  patchRefundComplete,
} = require("../../controllers/admin/adminReturnController");

const app = express();
app.use(express.json());

const mockVerifyAdmin = (req, res, next) => {
  req.user = { id: "admin507f1f77bcf86cd799439001", role: "admin" };
  next();
};

app.get("/api/admin/returns", mockVerifyAdmin, listReturnQueue);
app.get("/api/admin/returns/:id", mockVerifyAdmin, getReturnRequest);
app.patch("/api/admin/returns/:id/return-review", mockVerifyAdmin, patchReturnReview);
app.patch("/api/admin/returns/:id/refund-review", mockVerifyAdmin, patchRefundReview);
app.patch("/api/admin/returns/:id/refund-complete", mockVerifyAdmin, patchRefundComplete);

describe("Admin return endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns paginated return queue", async () => {
    listReturnReviewQueue.mockResolvedValue({
      requests: [{ _id: "r1", status: "pending_review" }],
      pagination: { page: 1, limit: 10, totalCount: 1, totalPages: 1 },
    });

    const response = await request(app)
      .get("/api/admin/returns?page=1&limit=10&status=pending_review")
      .expect(200);

    expect(listReturnReviewQueue).toHaveBeenCalledWith({
      page: "1",
      limit: "10",
      status: "pending_review",
    });
    expect(response.body.success).toBe(true);
    expect(response.body.requests).toHaveLength(1);
  });

  it("returns return request detail", async () => {
    getReturnRequestDetail.mockResolvedValue({
      request: { _id: "r1", status: "approved" },
    });

    const response = await request(app).get("/api/admin/returns/r1").expect(200);

    expect(getReturnRequestDetail).toHaveBeenCalledWith("r1");
    expect(response.body.request.status).toBe("approved");
  });

  it("updates return review", async () => {
    reviewReturnRequest.mockResolvedValue({
      request: { _id: "r1", status: "approved" },
    });

    const response = await request(app)
      .patch("/api/admin/returns/r1/return-review")
      .send({ action: "approve", note: "Eligible" })
      .expect(200);

    expect(reviewReturnRequest).toHaveBeenCalledWith({
      requestId: "r1",
      adminId: "admin507f1f77bcf86cd799439001",
      action: "approve",
      note: "Eligible",
    });
    expect(response.body.request.status).toBe("approved");
  });

  it("blocks refund review under SEC-006 HOLD", async () => {
    const { REFUND_HOLD_MESSAGE } = require("../../services/adminAfterSalesOpsService");
    reviewRefundRequest.mockResolvedValue({
      notAllowed: true,
      message: REFUND_HOLD_MESSAGE,
    });

    const response = await request(app)
      .patch("/api/admin/returns/r1/refund-review")
      .send({ action: "approve" })
      .expect(400);

    expect(reviewRefundRequest).toHaveBeenCalled();
    expect(response.body.message).toBe(REFUND_HOLD_MESSAGE);
  });

  it("blocks refund complete under SEC-006 HOLD", async () => {
    const { REFUND_HOLD_MESSAGE } = require("../../services/adminAfterSalesOpsService");
    completeRefundRequest.mockResolvedValue({
      notAllowed: true,
      message: REFUND_HOLD_MESSAGE,
    });

    const response = await request(app)
      .patch("/api/admin/returns/r1/refund-complete")
      .send({ note: "Processed via bank transfer" })
      .expect(400);

    expect(completeRefundRequest).toHaveBeenCalledWith({
      requestId: "r1",
      adminId: "admin507f1f77bcf86cd799439001",
      note: "Processed via bank transfer",
    });
    expect(response.body.message).toBe(REFUND_HOLD_MESSAGE);
  });

  it("returns validation errors from service", async () => {
    reviewReturnRequest.mockResolvedValue({
      invalid: true,
      message: "Invalid return review action. Use approve or reject.",
    });

    const response = await request(app)
      .patch("/api/admin/returns/r1/return-review")
      .send({ action: "invalid" })
      .expect(400);

    expect(response.body.message).toContain("Invalid return review action");
  });

  it("returns conflict when request status changed concurrently", async () => {
    reviewReturnRequest.mockResolvedValue({
      conflict: true,
      message: "Request status has changed. Refresh and try again.",
    });

    const response = await request(app)
      .patch("/api/admin/returns/r1/return-review")
      .send({ action: "approve" })
      .expect(409);

    expect(response.body.message).toContain("status has changed");
  });
});
