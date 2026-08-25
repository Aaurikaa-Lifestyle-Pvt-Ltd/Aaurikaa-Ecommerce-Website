/**
 * Shared ReturnRequest / After-Sales Case constants.
 * Kept separate to avoid circular requires between model and utils.
 */

const RETURN_REASON_CODES = [
  "DEFECTIVE_DAMAGED",
  "WRONG_ITEM",
  "NOT_AS_DESCRIBED",
  "CHANGE_OF_MIND",
  "QUALITY_NOT_SATISFACTORY",
  "OTHER",
];

/**
 * Need Help issue categories (analytics / intake).
 * Same vocabulary as legacy reason codes so admin dual-read stays compatible.
 */
const ISSUE_CATEGORIES = [...RETURN_REASON_CODES];

const MIN_RETURN_EVIDENCE_FILES = 1;
const MAX_RETURN_EVIDENCE_FILES = 5;
const RETURN_EVIDENCE_MEDIA_TYPES = ["image", "video"];
const EVIDENCE_REQUIRED_MESSAGE =
  "Please upload at least one photo or video before submitting your request.";

/** Legacy admin refund-path statuses (must remain valid for in-flight cases). */
const LEGACY_RETURN_STATUSES = [
  "pending_review",
  "approved",
  "rejected",
  "refund_pending",
  "refund_approved",
  "refund_rejected",
  "refund_completed",
  "closed",
];

/**
 * After-sales lifecycle statuses (Status ≠ Resolution).
 * Shared with legacy where names overlap: pending_review, rejected, closed.
 */
const AFTER_SALES_LIFECYCLE_STATUSES = [
  "pending_review",
  "awaiting_pickup",
  "in_transit",
  "awaiting_inspection",
  "resolved",
  "rejected",
  "under_admin_review",
  "closed",
];

const RETURN_STATUSES = [
  ...new Set([...LEGACY_RETURN_STATUSES, ...AFTER_SALES_LIFECYCLE_STATUSES]),
];

/** Business outcomes — independent of Status. */
const RETURN_RESOLUTIONS = ["refund", "replacement", "repair", "rejected"];

/**
 * Structured resolution reasons (enum/code) required when recording Refund / Replacement / Repair.
 */
const APPROVE_RESOLUTION_REASON_CODES = [
  "MANUFACTURING_DEFECT",
  "WRONG_ITEM",
  "TRANSIT_DAMAGE",
  "SELLER_GOODWILL",
  "OTHER",
];

/**
 * Structured resolution reasons required when recording Reject.
 */
const REJECT_RESOLUTION_REASON_CODES = [
  "USED_PRODUCT",
  "CUSTOMER_DAMAGE",
  "MISSING_ACCESSORIES",
  "OUTSIDE_RETURN_POLICY",
  "RETURN_WINDOW_EXPIRED",
  "OTHER",
];

const ALL_RESOLUTION_REASON_CODES = [
  ...new Set([...APPROVE_RESOLUTION_REASON_CODES, ...REJECT_RESOLUTION_REASON_CODES]),
];

/** Distinguishes admin refund path vs seller-owned after-sales path. */
const CASE_FLOW_VERSIONS = ["legacy", "after_sales"];

/** Statuses that block a new return request for the same order. */
const ACTIVE_RETURN_STATUSES = [
  "pending_review",
  "approved",
  "refund_pending",
  "refund_approved",
  "awaiting_pickup",
  "in_transit",
  "awaiting_inspection",
  "under_admin_review",
];

const ACTOR_ROLES = ["admin", "seller", "shopper", "system"];

/**
 * Recommended seller after-sales queue filters (Phase 2).
 * Values map to status sets in sellerReturnService.
 */
const SELLER_QUEUE_FILTERS = [
  "pending_review",
  "awaiting_pickup",
  "in_transit",
  "awaiting_inspection",
  "resolved",
  "closed",
];

/** Resolutions that require manual seller/ops follow-up (record-only; no auto fulfillment). */
const MANUAL_FOLLOW_UP_RESOLUTIONS = ["replacement", "repair"];

/** Reverse logistics provider ids (architecture is provider-agnostic; Shiprocket is MVP). */
const REVERSE_LOGISTICS_PROVIDERS = ["shiprocket"];

/**
 * Lifecycle of a reverse pickup attempt on the case.
 * Orthogonal to case Status (awaiting_pickup / in_transit).
 */
const REVERSE_LOGISTICS_STATUSES = [
  "pending",
  "scheduling",
  "scheduled",
  "in_transit",
  "delivered",
  "failed",
  "cancelled",
];

/** Default shopper appeal window after seller resolution (days). Overridable via env. */
const DEFAULT_APPEAL_WINDOW_DAYS = 7;

function getResolutionReasonCodesFor(resolution) {
  const normalized = String(resolution || "")
    .trim()
    .toLowerCase();
  if (normalized === "rejected") {
    return REJECT_RESOLUTION_REASON_CODES;
  }
  if (["refund", "replacement", "repair"].includes(normalized)) {
    return APPROVE_RESOLUTION_REASON_CODES;
  }
  return [];
}

function isValidResolutionReasonCode(resolution, reasonCode) {
  const allowed = getResolutionReasonCodesFor(resolution);
  return allowed.includes(String(reasonCode || "").trim().toUpperCase());
}

module.exports = {
  RETURN_REASON_CODES,
  ISSUE_CATEGORIES,
  MIN_RETURN_EVIDENCE_FILES,
  MAX_RETURN_EVIDENCE_FILES,
  RETURN_EVIDENCE_MEDIA_TYPES,
  EVIDENCE_REQUIRED_MESSAGE,
  LEGACY_RETURN_STATUSES,
  AFTER_SALES_LIFECYCLE_STATUSES,
  RETURN_STATUSES,
  RETURN_RESOLUTIONS,
  APPROVE_RESOLUTION_REASON_CODES,
  REJECT_RESOLUTION_REASON_CODES,
  ALL_RESOLUTION_REASON_CODES,
  CASE_FLOW_VERSIONS,
  ACTIVE_RETURN_STATUSES,
  ACTOR_ROLES,
  SELLER_QUEUE_FILTERS,
  MANUAL_FOLLOW_UP_RESOLUTIONS,
  REVERSE_LOGISTICS_PROVIDERS,
  REVERSE_LOGISTICS_STATUSES,
  DEFAULT_APPEAL_WINDOW_DAYS,
  getResolutionReasonCodesFor,
  isValidResolutionReasonCode,
};
