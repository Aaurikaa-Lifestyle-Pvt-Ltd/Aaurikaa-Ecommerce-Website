/**
 * After-Sales Case spine helpers (Phase 0).
 * Status = lifecycle position; Resolution = business outcome.
 * Legacy admin refund statuses remain valid; mapping is dual-read only.
 */

const {
  RETURN_RESOLUTIONS,
  CASE_FLOW_VERSIONS,
  LEGACY_RETURN_STATUSES,
  AFTER_SALES_LIFECYCLE_STATUSES,
  ACTIVE_RETURN_STATUSES,
  ACTOR_ROLES,
} = require("../constants/returnRequestConstants");

/**
 * Seller-queue bucket labels (planning filters) keyed by status.
 * Legacy refund_* statuses map into the closest after-sales bucket for dual-read UIs.
 */
const STATUS_TO_QUEUE_BUCKET = {
  pending_review: "pending_review",
  approved: "pending_review",
  awaiting_pickup: "awaiting_pickup",
  in_transit: "in_transit",
  awaiting_inspection: "awaiting_inspection",
  refund_pending: "awaiting_inspection",
  refund_approved: "awaiting_inspection",
  resolved: "resolved",
  refund_completed: "resolved",
  under_admin_review: "pending_review",
  rejected: "closed",
  refund_rejected: "resolved",
  closed: "closed",
};

const LEGACY_STATUS_SET = new Set(LEGACY_RETURN_STATUSES);
const AFTER_SALES_STATUS_SET = new Set(AFTER_SALES_LIFECYCLE_STATUSES);
const ACTIVE_STATUS_SET = new Set(ACTIVE_RETURN_STATUSES);

function normalizeCaseFlow(caseFlow) {
  const value = String(caseFlow || "legacy").trim().toLowerCase();
  return CASE_FLOW_VERSIONS.includes(value) ? value : "legacy";
}

function isLegacyCaseFlow(caseFlow) {
  return normalizeCaseFlow(caseFlow) === "legacy";
}

function isAfterSalesCaseFlow(caseFlow) {
  return normalizeCaseFlow(caseFlow) === "after_sales";
}

function isLegacyReturnStatus(status) {
  return LEGACY_STATUS_SET.has(status);
}

function isAfterSalesLifecycleStatus(status) {
  return AFTER_SALES_STATUS_SET.has(status);
}

function isActiveReturnStatus(status) {
  return ACTIVE_STATUS_SET.has(status);
}

/**
 * Infer a Resolution value from a legacy admin-era status for dual-read
 * (no destructive backfill of historical documents).
 */
function inferResolutionFromLegacyStatus(status) {
  switch (status) {
    case "refund_pending":
    case "refund_approved":
    case "refund_completed":
      return "refund";
    case "rejected":
    case "refund_rejected":
      return "rejected";
    default:
      return null;
  }
}

/**
 * Effective resolution for display: stored field wins; else infer from legacy status.
 */
function getEffectiveResolution(request) {
  if (!request) return null;
  if (request.resolution) return request.resolution;
  if (isLegacyCaseFlow(request.caseFlow)) {
    return inferResolutionFromLegacyStatus(request.status);
  }
  return null;
}

function mapStatusToQueueBucket(status) {
  return STATUS_TO_QUEUE_BUCKET[status] || null;
}

function isValidResolution(resolution) {
  if (resolution === null || resolution === undefined || resolution === "") {
    return true;
  }
  return RETURN_RESOLUTIONS.includes(resolution);
}

function isValidActorRole(role) {
  return ACTOR_ROLES.includes(role);
}

/**
 * Append a Resolution history entry and set `resolution`.
 * Callers must persist the document; history is append-only by convention + model guard.
 *
 * @returns {boolean} true when a change was recorded
 */
function appendResolutionChange(
  doc,
  {
    toResolution,
    changedBy = null,
    changedByRole = "system",
    note = null,
    reasonCode = null,
    reasonNote = null,
    force = false,
  } = {}
) {
  if (!doc) {
    throw new Error("ReturnRequest document is required");
  }
  if (!isValidResolution(toResolution) || toResolution == null || toResolution === "") {
    throw new Error(`Invalid resolution: ${toResolution}`);
  }
  if (!isValidActorRole(changedByRole)) {
    throw new Error(`Invalid changedByRole: ${changedByRole}`);
  }

  const fromResolution = doc.resolution || null;
  const nextReasonCode = reasonCode || null;
  const nextReasonNote = reasonNote || null;
  const sameResolution = fromResolution === toResolution;
  const sameReason =
    (doc.resolutionReasonCode || null) === nextReasonCode &&
    (doc.resolutionReasonNote || null) === nextReasonNote;

  if (sameResolution && sameReason && !force) {
    return false;
  }

  if (!Array.isArray(doc.resolutionHistory)) {
    doc.resolutionHistory = [];
  }

  doc.resolution = toResolution;
  doc.resolutionReasonCode = nextReasonCode;
  doc.resolutionReasonNote = nextReasonNote;
  doc.resolutionHistory.push({
    fromResolution,
    toResolution,
    changedAt: new Date(),
    changedBy: changedBy || null,
    changedByRole,
    note: note || null,
    reasonCode: nextReasonCode,
    reasonNote: nextReasonNote,
  });

  return true;
}

/**
 * Snapshot resolutionHistory for append-only validation (model post-init).
 */
function snapshotResolutionHistory(history) {
  return (history || []).map((entry) => ({
    fromResolution: entry.fromResolution ?? null,
    toResolution: entry.toResolution,
    changedAt: entry.changedAt ? new Date(entry.changedAt).toISOString() : null,
    changedBy: entry.changedBy ? String(entry.changedBy) : null,
    changedByRole: entry.changedByRole || null,
    note: entry.note || null,
    reasonCode: entry.reasonCode || null,
    reasonNote: entry.reasonNote || null,
  }));
}

function assertResolutionHistoryAppendOnly(originalSnapshot, currentHistory) {
  const original = originalSnapshot || [];
  const current = snapshotResolutionHistory(currentHistory);

  if (current.length < original.length) {
    throw new Error("resolutionHistory is append-only and cannot shrink");
  }

  for (let i = 0; i < original.length; i += 1) {
    const prev = original[i];
    const next = current[i];
    if (
      prev.fromResolution !== next.fromResolution ||
      prev.toResolution !== next.toResolution ||
      prev.changedAt !== next.changedAt ||
      prev.changedBy !== next.changedBy ||
      prev.changedByRole !== next.changedByRole ||
      prev.note !== next.note ||
      prev.reasonCode !== next.reasonCode ||
      prev.reasonNote !== next.reasonNote
    ) {
      throw new Error("resolutionHistory entries are immutable");
    }
  }
}

module.exports = {
  ACTOR_ROLES,
  STATUS_TO_QUEUE_BUCKET,
  normalizeCaseFlow,
  isLegacyCaseFlow,
  isAfterSalesCaseFlow,
  isLegacyReturnStatus,
  isAfterSalesLifecycleStatus,
  isActiveReturnStatus,
  inferResolutionFromLegacyStatus,
  getEffectiveResolution,
  mapStatusToQueueBucket,
  isValidResolution,
  isValidActorRole,
  appendResolutionChange,
  snapshotResolutionHistory,
  assertResolutionHistoryAppendOnly,
};
