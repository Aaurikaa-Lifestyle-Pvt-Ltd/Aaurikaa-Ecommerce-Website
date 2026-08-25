jest.mock("../../utils/sendMail", () => jest.fn());
jest.mock("../../models/SiteSettings", () => ({
  findOne: jest.fn(),
}));
jest.mock("../../models/Admin", () => ({
  find: jest.fn(),
}));
jest.mock("../../models/Order", () => ({
  findById: jest.fn(),
}));

const sendMail = require("../../utils/sendMail");
const SiteSettings = require("../../models/SiteSettings");
const Admin = require("../../models/Admin");
const Order = require("../../models/Order");
const {
  sendAdminReturnRequestSubmitted,
  sendShopperReturnReviewUpdate,
  sendShopperRefundReviewUpdate,
  sendShopperRefundCompleted,
} = require("../../services/returnNotificationService");

const mockReturnRequest = {
  _id: "req1",
  order: "order1",
  status: "pending_review",
  reasonCode: "DEFECTIVE_DAMAGED",
  reasonText: null,
};

const mockOrder = {
  _id: "order1",
  invoiceNumber: "INV-20260717-123456",
  buyer: {
    firstName: "Rina",
    lastName: "Das",
    email: "rina@example.com",
  },
};

describe("returnNotificationService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    SiteSettings.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ enquiryNotificationEmail: "ops@anbazar.com" }),
    });
    Admin.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ email: "admin@example.com" }]),
      }),
    });
    Order.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockOrder),
        }),
      }),
    });
    sendMail.mockResolvedValue();
  });

  it("sends admin alert when a return request is submitted", async () => {
    await sendAdminReturnRequestSubmitted(mockReturnRequest, mockOrder);

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledWith(
      "ops@anbazar.com",
      "New Return Request — INV-20260717-123456",
      expect.stringContaining("New Return Request")
    );
  });

  it("sends shopper email on return approval", async () => {
    await sendShopperReturnReviewUpdate(
      { ...mockReturnRequest, status: "approved" },
      mockOrder,
      { action: "approve" }
    );

    expect(sendMail).toHaveBeenCalledWith(
      "rina@example.com",
      "Return Approved — INV-20260717-123456",
      expect.stringContaining("Return Request Approved")
    );
  });

  it("sends shopper email on refund rejection", async () => {
    await sendShopperRefundReviewUpdate(
      { ...mockReturnRequest, status: "refund_rejected", adminRefundNote: "Outside policy" },
      mockOrder,
      { action: "reject" }
    );

    expect(sendMail).toHaveBeenCalledWith(
      "rina@example.com",
      "Refund Rejected — INV-20260717-123456",
      expect.stringContaining("Refund Request Rejected")
    );
  });

  it("sends shopper email when refund is marked complete", async () => {
    await sendShopperRefundCompleted(
      { ...mockReturnRequest, status: "refund_completed" },
      mockOrder
    );

    expect(sendMail).toHaveBeenCalledWith(
      "rina@example.com",
      "Refund Completed — INV-20260717-123456",
      expect.stringContaining("Refund Completed")
    );
  });

  it("falls back to all admins when no enquiry notification email is configured", async () => {
    SiteSettings.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({}),
    });

    await sendAdminReturnRequestSubmitted(mockReturnRequest, mockOrder);

    expect(sendMail).toHaveBeenCalledWith(
      "admin@example.com",
      expect.any(String),
      expect.any(String)
    );
  });
});
