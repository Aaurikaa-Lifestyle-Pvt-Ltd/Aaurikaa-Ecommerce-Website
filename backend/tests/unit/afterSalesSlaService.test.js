/**
 * Unit tests: after-sales SLA automation config + job selection.
 */

jest.mock("../../services/returnNotificationService", () => ({
  sendSellerSlaReminder: jest.fn().mockResolvedValue(undefined),
  sendAdminCaseEscalation: jest.fn().mockResolvedValue(undefined),
}));

const ReturnRequest = require("../../models/ReturnRequest");
const {
  getSlaConfig,
  processSellerSlaReminders,
  processAdminSlaEscalations,
  runAfterSalesSlaJobs,
} = require("../../services/afterSalesSlaService");
const {
  sendSellerSlaReminder,
  sendAdminCaseEscalation,
} = require("../../services/returnNotificationService");

describe("afterSalesSlaService", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  test("reads intervals from environment", () => {
    process.env.AFTER_SALES_SLA_REMINDER_HOURS = "12";
    process.env.AFTER_SALES_SLA_ESCALATION_HOURS = "36";
    expect(getSlaConfig()).toMatchObject({
      reminderHours: 12,
      escalationHours: 36,
      enabled: true,
    });
  });

  test("skips when cron disabled", async () => {
    process.env.DISABLE_AFTER_SALES_SLA_CRON = "true";
    const result = await runAfterSalesSlaJobs();
    expect(result).toEqual({
      skipped: true,
      reason: "DISABLE_AFTER_SALES_SLA_CRON=true",
    });
  });

  test("sends seller reminders for overdue pending_review cases", async () => {
    process.env.AFTER_SALES_SLA_REMINDER_HOURS = "24";
    const lean = jest.fn().mockResolvedValue([
      { _id: "rr1", order: "ord1", status: "pending_review", createdAt: new Date(0) },
    ]);
    const limit = jest.fn().mockReturnValue({ lean });
    const select = jest.fn().mockReturnValue({ limit });
    jest.spyOn(ReturnRequest, "find").mockReturnValue({ select });
    jest.spyOn(ReturnRequest, "updateOne").mockResolvedValue({ modifiedCount: 1 });

    const result = await processSellerSlaReminders({ now: new Date() });
    expect(sendSellerSlaReminder).toHaveBeenCalledTimes(1);
    expect(result.sent).toBe(1);
  });

  test("escalates overdue cases to admin", async () => {
    process.env.AFTER_SALES_SLA_ESCALATION_HOURS = "48";
    const lean = jest.fn().mockResolvedValue([
      { _id: "rr2", order: "ord2", status: "pending_review", createdAt: new Date(0) },
    ]);
    const limit = jest.fn().mockReturnValue({ lean });
    const select = jest.fn().mockReturnValue({ limit });
    jest.spyOn(ReturnRequest, "find").mockReturnValue({ select });
    jest.spyOn(ReturnRequest, "updateOne").mockResolvedValue({ modifiedCount: 1 });

    const result = await processAdminSlaEscalations({ now: new Date() });
    expect(sendAdminCaseEscalation).toHaveBeenCalledTimes(1);
    expect(result.sent).toBe(1);
  });
});
