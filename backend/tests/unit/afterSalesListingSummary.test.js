const {
  toAfterSalesListingSummary,
} = require("../../utils/afterSalesListingSummary");

describe("afterSalesListingSummary", () => {
  it("includes returnRequestId and SLA timestamps", () => {
    const id = "507f1f77bcf86cd799439011";
    const summary = toAfterSalesListingSummary({
      _id: id,
      status: "pending_review",
      resolution: null,
      replacementOrder: null,
      slaReminderSentAt: new Date("2026-08-01T10:00:00.000Z"),
      slaEscalatedAt: null,
    });

    expect(summary).toEqual({
      returnRequestId: id,
      status: "pending_review",
      resolution: null,
      replacementOrderId: null,
      slaReminderSentAt: "2026-08-01T10:00:00.000Z",
      slaEscalatedAt: null,
    });
  });

  it("returns null when status is missing", () => {
    expect(toAfterSalesListingSummary({ _id: "x" })).toBeNull();
  });
});
