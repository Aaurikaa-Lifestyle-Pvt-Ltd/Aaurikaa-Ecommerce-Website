/**
 * Return request status transition guards (Module 6 + Phase 0 dual-path).
 * Legacy admin refund path and after-sales lifecycle share one guard surface.
 */

const {
  RETURN_STATUSES,
  RETURN_RESOLUTIONS,
  CASE_FLOW_VERSIONS,
  isValidResolutionReasonCode,
} = require("../constants/returnRequestConstants");
const { isAfterSalesCaseFlow } = require("./afterSalesCaseSpine");

const TERMINAL_STATUSES = new Set([
  "refund_rejected",
  "refund_completed",
  "closed",
]);

/**
 * Certified Phase C / admin refund workflow (legacy) — must stay intact.
 */
const LEGACY_ALLOWED_TRANSITIONS = {
  pending_review: ["approved", "rejected"],
  approved: ["refund_approved", "refund_rejected"],
  refund_pending: ["refund_approved", "refund_rejected"],
  refund_approved: ["refund_completed"],
  rejected: [],
  refund_rejected: [],
  refund_completed: [],
  closed: [],
};

/**
 * Seller-owned after-sales lifecycle (Status vocabulary for new flow).
 * Physical return path: pending_review → awaiting_pickup → in_transit → awaiting_inspection → resolved|rejected
 * No-return path: pending_review → awaiting_inspection → resolved|rejected
 * Early reject: pending_review → rejected
 * Appeal: resolved|rejected → under_admin_review → resolved|rejected|closed
 */
const AFTER_SALES_ALLOWED_TRANSITIONS = {
  pending_review: ["awaiting_pickup", "awaiting_inspection", "rejected", "resolved"],
  awaiting_pickup: ["in_transit", "awaiting_inspection", "rejected"],
  in_transit: ["awaiting_inspection", "awaiting_pickup", "rejected"],
  awaiting_inspection: ["resolved", "rejected"],
  resolved: ["closed", "rejected", "awaiting_inspection", "under_admin_review"],
  rejected: ["pending_review", "resolved", "awaiting_inspection", "under_admin_review", "closed"],
  under_admin_review: ["resolved", "rejected", "closed"],
  closed: [],
};

/** Statuses where admin may reopen a seller-rejected after-sales case for re-review. */
const ADMIN_REOPEN_FROM_STATUSES = new Set(["rejected"]);

/** Statuses where admin may override Resolution (governance / dispute / appeal). */
const ADMIN_OVERRIDE_RESOLUTION_FROM_STATUSES = new Set([
  "rejected",
  "pending_review",
  "awaiting_pickup",
  "in_transit",
  "awaiting_inspection",
  "resolved",
  "under_admin_review",
]);

/** Statuses where shopper may submit a one-time appeal after seller resolution. */
const SHOPPER_APPEAL_FROM_STATUSES = new Set(["resolved", "rejected"]);

/**
 * True when after-sales wallet refund has already been issued (financial lock).
 */
function hasCompletedAfterSalesWalletRefund(requestOrPlain) {
  if (!requestOrPlain) return false;
  return !!(
    requestOrPlain.walletCreditProcessedAt ||
    requestOrPlain.refundCompletedAt ||
    (typeof requestOrPlain.walletCreditAmount === "number" &&
      requestOrPlain.walletCreditAmount > 0)
  );
}

/** Union used by model pre-save and services (dual-path safety). */
const ALLOWED_TRANSITIONS = (() => {
  const merged = {};
  const keys = new Set([
    ...Object.keys(LEGACY_ALLOWED_TRANSITIONS),
    ...Object.keys(AFTER_SALES_ALLOWED_TRANSITIONS),
  ]);
  for (const status of keys) {
    merged[status] = [
      ...new Set([
        ...(LEGACY_ALLOWED_TRANSITIONS[status] || []),
        ...(AFTER_SALES_ALLOWED_TRANSITIONS[status] || []),
      ]),
    ];
  }
  return merged;
})();

const RETURN_REVIEW_ACTIONS = {
  approve: "approved",
  reject: "rejected",
};

const REFUND_REVIEW_ACTIONS = {
  approve: "refund_approved",
  reject: "refund_rejected",
};

/** Statuses where a final Resolution may be selected on the after-sales path. */
const RESOLUTION_SELECTABLE_STATUSES = new Set([
  "awaiting_inspection",
  "pending_review",
]);

/** Statuses where seller may confirm physical receipt. */
const RECEIPT_CONFIRMABLE_STATUSES = new Set([
  "awaiting_pickup",
  "in_transit",
]);

function isTerminalReturnStatus(status) {
  return TERMINAL_STATUSES.has(status);
}

function isAllowedReturnStatusTransition(fromStatus, toStatus) {
  if (!fromStatus || !toStatus || fromStatus === toStatus) {
    return false;
  }
  const allowed = ALLOWED_TRANSITIONS[fromStatus] || [];
  return allowed.includes(toStatus);
}

function isAllowedLegacyTransition(fromStatus, toStatus) {
  if (!fromStatus || !toStatus || fromStatus === toStatus) {
    return false;
  }
  if (isTerminalReturnStatus(fromStatus)) {
    return false;
  }
  const allowed = LEGACY_ALLOWED_TRANSITIONS[fromStatus] || [];
  return allowed.includes(toStatus);
}

function isAllowedAfterSalesTransition(fromStatus, toStatus) {
  if (!fromStatus || !toStatus || fromStatus === toStatus) {
    return false;
  }
  if (isTerminalReturnStatus(fromStatus)) {
    return false;
  }
  const allowed = AFTER_SALES_ALLOWED_TRANSITIONS[fromStatus] || [];
  return allowed.includes(toStatus);
}

function resolveReturnReviewTarget(action) {
  const normalized = String(action || "").trim().toLowerCase();
  return RETURN_REVIEW_ACTIONS[normalized] || null;
}

function resolveRefundReviewTarget(action) {
  const normalized = String(action || "").trim().toLowerCase();
  return REFUND_REVIEW_ACTIONS[normalized] || null;
}

/**
 * Legacy admin return approve/reject — blocked for after_sales (seller-owned).
 */
function canReviewReturn(status, options = {}) {
  if (isAfterSalesCaseFlow(options.caseFlow)) {
    return false;
  }
  return status === "pending_review";
}

function canReviewRefund(status, options = {}) {
  if (isAfterSalesCaseFlow(options.caseFlow)) {
    return false;
  }
  return status === "approved";
}

/**
 * Legacy admin "mark refund complete" — blocked for after_sales cases.
 */
function canCompleteRefund(status, options = {}) {
  if (isAfterSalesCaseFlow(options.caseFlow)) {
    return false;
  }
  return status === "refund_approved";
}

function canSelectResolution(status, options = {}) {
  if (!isAfterSalesCaseFlow(options.caseFlow)) {
    return false;
  }
  return RESOLUTION_SELECTABLE_STATUSES.has(status);
}

/**
 * Seller accept/reject at pending_review on after-sales cases.
 */
function canSellerReview(status, options = {}) {
  if (!isAfterSalesCaseFlow(options.caseFlow)) {
    return false;
  }
  return status === "pending_review";
}

function canConfirmReceipt(status, options = {}) {
  if (!isAfterSalesCaseFlow(options.caseFlow)) {
    return false;
  }
  return RECEIPT_CONFIRMABLE_STATUSES.has(status);
}

/**
 * Target status after seller accepts a case.
 * Physical return → awaiting_pickup; otherwise awaiting_inspection (or resolved if resolution chosen).
 */
function resolveSellerAcceptTarget(returnRequired, { withResolution = false } = {}) {
  if (returnRequired === true) {
    return "awaiting_pickup";
  }
  if (returnRequired === false) {
    return withResolution ? "resolved" : "awaiting_inspection";
  }
  return null;
}

function resolveSellerResolutionTargetStatus(resolution) {
  if (resolution === "rejected") {
    return "rejected";
  }
  if (RETURN_RESOLUTIONS.includes(resolution)) {
    return "resolved";
  }
  return null;
}

function isValidReturnResolution(resolution) {
  return RETURN_RESOLUTIONS.includes(resolution);
}

function canAdminReopenCase(status, options = {}) {
  if (!isAfterSalesCaseFlow(options.caseFlow)) {
    return false;
  }
  return ADMIN_REOPEN_FROM_STATUSES.has(status);
}

function canAdminOverrideResolution(status, options = {}) {
  if (!isAfterSalesCaseFlow(options.caseFlow)) {
    return false;
  }
  return ADMIN_OVERRIDE_RESOLUTION_FROM_STATUSES.has(status);
}

function canShopperAppeal(status, options = {}) {
  if (!isAfterSalesCaseFlow(options.caseFlow)) {
    return false;
  }
  if (hasCompletedAfterSalesWalletRefund(options.request)) {
    return false;
  }
  return SHOPPER_APPEAL_FROM_STATUSES.has(status);
}

/**
 * After wallet credit, resolution must remain refund — block financial undoing via override.
 */
function canChangeResolutionAfterWalletRefund(requestOrPlain, nextResolution) {
  if (!hasCompletedAfterSalesWalletRefund(requestOrPlain)) {
    return true;
  }
  const next = String(nextResolution || "")
    .trim()
    .toLowerCase();
  return next === "refund";
}

function canAdminDecideAppeal(status, options = {}) {
  if (!isAfterSalesCaseFlow(options.caseFlow)) {
    return false;
  }
  return status === "under_admin_review";
}

function normalizeResolutionReasonPayload(resolution, reasonCode, reasonNote) {
  const normalizedResolution = String(resolution || "")
    .trim()
    .toLowerCase();
  const normalizedCode = String(reasonCode || "")
    .trim()
    .toUpperCase();
  const note =
    reasonNote == null || reasonNote === ""
      ? null
      : String(reasonNote).trim().slice(0, 1000);

  if (!isValidReturnResolution(normalizedResolution)) {
    return {
      valid: false,
      message: "Invalid resolution. Use refund, replacement, repair, or rejected.",
    };
  }

  if (!normalizedCode) {
    return {
      valid: false,
      message: "A resolution reason code is required.",
    };
  }

  if (!isValidResolutionReasonCode(normalizedResolution, normalizedCode)) {
    return {
      valid: false,
      message: `Invalid resolution reason for ${normalizedResolution}.`,
    };
  }

  if (normalizedCode === "OTHER" && !note) {
    return {
      valid: false,
      message: 'A free-text note is required when resolution reason is "Other".',
    };
  }

  return {
    valid: true,
    resolution: normalizedResolution,
    reasonCode: normalizedCode,
    reasonNote: note,
  };
}

module.exports = {
  RETURN_STATUSES,
  RETURN_RESOLUTIONS,
  CASE_FLOW_VERSIONS,
  TERMINAL_STATUSES,
  LEGACY_ALLOWED_TRANSITIONS,
  AFTER_SALES_ALLOWED_TRANSITIONS,
  ALLOWED_TRANSITIONS,
  RETURN_REVIEW_ACTIONS,
  REFUND_REVIEW_ACTIONS,
  RESOLUTION_SELECTABLE_STATUSES,
  RECEIPT_CONFIRMABLE_STATUSES,
  ADMIN_REOPEN_FROM_STATUSES,
  ADMIN_OVERRIDE_RESOLUTION_FROM_STATUSES,
  SHOPPER_APPEAL_FROM_STATUSES,
  isTerminalReturnStatus,
  isAllowedReturnStatusTransition,
  isAllowedLegacyTransition,
  isAllowedAfterSalesTransition,
  resolveReturnReviewTarget,
  resolveRefundReviewTarget,
  canReviewReturn,
  canReviewRefund,
  canCompleteRefund,
  canSelectResolution,
  canSellerReview,
  canConfirmReceipt,
  resolveSellerAcceptTarget,
  resolveSellerResolutionTargetStatus,
  isValidReturnResolution,
  canAdminReopenCase,
  canAdminOverrideResolution,
  canShopperAppeal,
  canAdminDecideAppeal,
  hasCompletedAfterSalesWalletRefund,
  canChangeResolutionAfterWalletRefund,
  normalizeResolutionReasonPayload,
};
