/**
 * After-Sales SLA automation (Module D).
 * Environment-driven seller reminder + admin escalation for pending_review cases.
 * Intervals are never hardcoded — configure via env.
 */

const ReturnRequest = require("../models/ReturnRequest");
const {
  sendSellerSlaReminder,
  sendAdminCaseEscalation,
} = require("./returnNotificationService");

function parsePositiveNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function getSlaConfig() {
  return {
    reminderHours: parsePositiveNumber(
      process.env.AFTER_SALES_SLA_REMINDER_HOURS,
      24
    ),
    escalationHours: parsePositiveNumber(
      process.env.AFTER_SALES_SLA_ESCALATION_HOURS,
      48
    ),
    enabled: process.env.DISABLE_AFTER_SALES_SLA_CRON !== "true",
  };
}

function hoursAgoDate(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

/**
 * Send seller reminders for cases awaiting review beyond configured hours.
 */
async function processSellerSlaReminders({ now = new Date() } = {}) {
  const config = getSlaConfig();
  const cutoff = new Date(now.getTime() - config.reminderHours * 60 * 60 * 1000);

  const candidates = await ReturnRequest.find({
    caseFlow: "after_sales",
    status: "pending_review",
    slaReminderSentAt: null,
    createdAt: { $lte: cutoff },
  })
    .select("_id order status createdAt caseFlow")
    .limit(100)
    .lean();

  let sent = 0;
  let failed = 0;

  for (const request of candidates) {
    try {
      await sendSellerSlaReminder(request, request.order);
      await ReturnRequest.updateOne(
        { _id: request._id, slaReminderSentAt: null, status: "pending_review" },
        { $set: { slaReminderSentAt: now } }
      );
      sent += 1;
    } catch (err) {
      failed += 1;
      console.error(
        `❌ SLA reminder failed for case ${request._id}:`,
        err.message
      );
    }
  }

  return { scanned: candidates.length, sent, failed, reminderHours: config.reminderHours };
}

/**
 * Escalate to admin when seller inactivity exceeds configured escalation hours.
 */
async function processAdminSlaEscalations({ now = new Date() } = {}) {
  const config = getSlaConfig();
  const cutoff = new Date(now.getTime() - config.escalationHours * 60 * 60 * 1000);

  const candidates = await ReturnRequest.find({
    caseFlow: "after_sales",
    status: "pending_review",
    slaEscalatedAt: null,
    createdAt: { $lte: cutoff },
  })
    .select("_id order status createdAt caseFlow slaReminderSentAt")
    .limit(100)
    .lean();

  let sent = 0;
  let failed = 0;

  for (const request of candidates) {
    try {
      await sendAdminCaseEscalation(request, request.order, {
        reason: `Seller has not reviewed this case within ${config.escalationHours} hours.`,
      });
      await ReturnRequest.updateOne(
        { _id: request._id, slaEscalatedAt: null, status: "pending_review" },
        { $set: { slaEscalatedAt: now } }
      );
      sent += 1;
    } catch (err) {
      failed += 1;
      console.error(
        `❌ SLA escalation failed for case ${request._id}:`,
        err.message
      );
    }
  }

  return {
    scanned: candidates.length,
    sent,
    failed,
    escalationHours: config.escalationHours,
  };
}

/**
 * Run both SLA jobs (reminder then escalation). Safe to call from cron.
 */
async function runAfterSalesSlaJobs(options = {}) {
  const config = getSlaConfig();
  if (!config.enabled) {
    return { skipped: true, reason: "DISABLE_AFTER_SALES_SLA_CRON=true" };
  }

  const reminders = await processSellerSlaReminders(options);
  const escalations = await processAdminSlaEscalations(options);
  return { skipped: false, reminders, escalations };
}

module.exports = {
  getSlaConfig,
  hoursAgoDate,
  processSellerSlaReminders,
  processAdminSlaEscalations,
  runAfterSalesSlaJobs,
};
