/**
 * Return eligibility service — read-only evaluation of whether a shopper
 * may submit a return request for a given order.
 *
 * Mirrors the pattern of cancellationEligibilityService.js and
 * reviewEligibilityService.js: pure functions over stored order state only.
 */

const {
  ACTIVE_RETURN_STATUSES: ACTIVE_RETURN_STATUS_LIST,
} = require("../models/ReturnRequest");

const TERMINAL_RETURN_STATUSES = new Set([
  "rejected",
  "refund_rejected",
  "refund_completed",
  "resolved",
  "closed",
]);

const ACTIVE_RETURN_STATUSES = new Set(ACTIVE_RETURN_STATUS_LIST);
const DEFAULT_RETURN_WINDOW_DAYS = 7;
const MIN_RETURN_WINDOW_DAYS = 1;
const MAX_RETURN_WINDOW_DAYS = 365;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const REASON = {
  ELIGIBLE: "ELIGIBLE",
  ORDER_NOT_DELIVERED: "ORDER_NOT_DELIVERED",
  ORDER_NOT_ELIGIBLE_STATUS: "ORDER_NOT_ELIGIBLE_STATUS",
  ACTIVE_REQUEST_EXISTS: "ACTIVE_REQUEST_EXISTS",
  ALREADY_RESOLVED: "ALREADY_RESOLVED",
  RETURN_WINDOW_EXPIRED: "RETURN_WINDOW_EXPIRED",
  DELIVERY_TIMESTAMP_UNAVAILABLE: "DELIVERY_TIMESTAMP_UNAVAILABLE",
  RETURN_NOT_ALLOWED: "RETURN_NOT_ALLOWED",
};

const REASON_MESSAGES = {
  [REASON.ELIGIBLE]: "You can request help for this order.",
  [REASON.ORDER_NOT_DELIVERED]:
    "Help requests are only available after the order has been delivered.",
  [REASON.ORDER_NOT_ELIGIBLE_STATUS]:
    "Help requests are not available for this order.",
  [REASON.ACTIVE_REQUEST_EXISTS]:
    "A help request has already been submitted for this order.",
  [REASON.ALREADY_RESOLVED]:
    "The help request for this order has already been resolved.",
  [REASON.RETURN_WINDOW_EXPIRED]:
    "The after-sales window for this order has expired.",
  [REASON.DELIVERY_TIMESTAMP_UNAVAILABLE]:
    "Help requests are not available for this order.",
  [REASON.RETURN_NOT_ALLOWED]:
    "Returns are not available for the products in this order.",
};

function normalizePlain(order) {
  return order && typeof order.toObject === "function" ? order.toObject() : order || {};
}

/**
 * Pure eligibility evaluation given stored order state and optional existing request.
 *
 * @param {object} order           - Plain Order document or DTO
 * @param {object|null} existingRequest - Most recent ReturnRequest for this order (or null)
 * @returns {{ eligible: boolean, reason: string, message: string }}
 */
function normalizeReturnWindowDays(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) &&
    parsed >= MIN_RETURN_WINDOW_DAYS &&
    parsed <= MAX_RETURN_WINDOW_DAYS
    ? parsed
    : DEFAULT_RETURN_WINDOW_DAYS;
}

function getReturnWindowExpiresAt(deliveredAt, returnWindowDays) {
  if (deliveredAt === null || deliveredAt === undefined || deliveredAt === "") {
    return null;
  }
  const delivered = new Date(deliveredAt);
  if (Number.isNaN(delivered.getTime())) return null;

  const istDate = new Date(delivered.getTime() + IST_OFFSET_MS);
  const endOfExpiryDayAsUtc = Date.UTC(
    istDate.getUTCFullYear(),
    istDate.getUTCMonth(),
    istDate.getUTCDate() + normalizeReturnWindowDays(returnWindowDays),
    23,
    59,
    59,
    999
  );

  return new Date(endOfExpiryDayAsUtc - IST_OFFSET_MS);
}

function getReturnEligibility(order, existingRequest = null, options = {}) {
  const plain = normalizePlain(order);
  const status = plain.status ? String(plain.status).trim().toLowerCase() : "";

  if (status !== "delivered") {
    const reason =
      ["cancelled", "failed"].includes(status)
        ? REASON.ORDER_NOT_ELIGIBLE_STATUS
        : REASON.ORDER_NOT_DELIVERED;
    return buildEligibility(false, reason);
  }

  if (existingRequest) {
    const reqStatus = existingRequest.status || "";
    if (ACTIVE_RETURN_STATUSES.has(reqStatus)) {
      return buildEligibility(false, REASON.ACTIVE_REQUEST_EXISTS);
    }
    if (TERMINAL_RETURN_STATUSES.has(reqStatus)) {
      return buildEligibility(false, REASON.ALREADY_RESOLVED);
    }
  }

  if (options.returnAllowed === false) {
    return buildEligibility(false, REASON.RETURN_NOT_ALLOWED);
  }

  const expiresAt = getReturnWindowExpiresAt(
    plain.deliveredAt,
    options.returnWindowDays
  );
  if (!expiresAt) {
    return buildEligibility(false, REASON.DELIVERY_TIMESTAMP_UNAVAILABLE);
  }

  const now = options.now ? new Date(options.now) : new Date();
  if (Number.isNaN(now.getTime())) {
    return buildEligibility(false, REASON.DELIVERY_TIMESTAMP_UNAVAILABLE);
  }
  if (new Date(plain.deliveredAt).getTime() > now.getTime()) {
    return buildEligibility(false, REASON.DELIVERY_TIMESTAMP_UNAVAILABLE);
  }
  if (now.getTime() > expiresAt.getTime()) {
    return buildEligibility(false, REASON.RETURN_WINDOW_EXPIRED);
  }

  return buildEligibility(true, REASON.ELIGIBLE);
}

function toShopperReturnEligibility(eligibility) {
  if (!eligibility) return eligibility;
  if (eligibility.reason !== REASON.DELIVERY_TIMESTAMP_UNAVAILABLE) {
    return eligibility;
  }
  return buildEligibility(false, REASON.ORDER_NOT_ELIGIBLE_STATUS);
}

function buildEligibility(eligible, reason) {
  return {
    eligible,
    reason: eligible ? REASON.ELIGIBLE : reason,
    message:
      REASON_MESSAGES[eligible ? REASON.ELIGIBLE : reason] ||
      REASON_MESSAGES[REASON.ORDER_NOT_ELIGIBLE_STATUS],
  };
}

module.exports = {
  REASON,
  REASON_MESSAGES,
  ACTIVE_RETURN_STATUSES,
  TERMINAL_RETURN_STATUSES,
  DEFAULT_RETURN_WINDOW_DAYS,
  MIN_RETURN_WINDOW_DAYS,
  MAX_RETURN_WINDOW_DAYS,
  normalizeReturnWindowDays,
  getReturnWindowExpiresAt,
  getReturnEligibility,
  toShopperReturnEligibility,
};
