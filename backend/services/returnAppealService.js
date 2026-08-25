/**
 * Shopper one-time appeal after seller resolution (Module B).
 * Need Help → Seller Resolution → Appeal? → Admin Review → Final Decision.
 * No second appeal, no discussion thread, no chat.
 */

const mongoose = require("mongoose");
const ReturnRequest = require("../models/ReturnRequest");
const Order = require("../models/Order");
const {
  DEFAULT_APPEAL_WINDOW_DAYS,
  MAX_RETURN_EVIDENCE_FILES,
  RETURN_EVIDENCE_MEDIA_TYPES,
} = require("../constants/returnRequestConstants");
const {
  canShopperAppeal,
  canAdminDecideAppeal,
  normalizeResolutionReasonPayload,
  resolveSellerResolutionTargetStatus,
  isAllowedAfterSalesTransition,
  hasCompletedAfterSalesWalletRefund,
  canChangeResolutionAfterWalletRefund,
} = require("../utils/returnStatusGuards");
const {
  appendResolutionChange,
  isAfterSalesCaseFlow,
  getEffectiveResolution,
} = require("../utils/afterSalesCaseSpine");
const { tryAfterSalesRefundOnResolution } = require("./returnRefundOrchestrationService");
const { MANUAL_FOLLOW_UP_RESOLUTIONS } = require("../constants/returnRequestConstants");
// Note: do not import returnRequestService here (circular). Callers map DTOs.

const NOTES_MAX_LENGTH = 1000;
const APPEAL_REASON_MAX = 2000;

function getAppealWindowDays() {
  const raw = Number(process.env.AFTER_SALES_APPEAL_WINDOW_DAYS);
  if (Number.isInteger(raw) && raw >= 1 && raw <= 90) {
    return raw;
  }
  return DEFAULT_APPEAL_WINDOW_DAYS;
}

function computeAppealWindowEndsAt(fromDate = new Date()) {
  const base = fromDate instanceof Date ? fromDate : new Date(fromDate);
  const ends = new Date(base.getTime());
  ends.setUTCDate(ends.getUTCDate() + getAppealWindowDays());
  return ends;
}

function sanitizeText(value, max = NOTES_MAX_LENGTH) {
  if (value === null || value === undefined) return null;
  const sanitized = String(value)
    .replace(/[\x00-\x1F\x7F]/g, "")
    .trim();
  if (!sanitized) return null;
  return sanitized.slice(0, max);
}

function normalizeEvidence(evidence, scope = {}) {
  if (!Array.isArray(evidence)) return [];
  const { validatePlatformEvidenceUrl } = require("../utils/returnEvidenceUrl");
  return evidence
    .slice(0, MAX_RETURN_EVIDENCE_FILES)
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const url = String(item.url || "").trim();
      const mediaType = String(item.mediaType || "").trim().toLowerCase();
      if (!url || !RETURN_EVIDENCE_MEDIA_TYPES.includes(mediaType)) return null;
      const urlCheck = validatePlatformEvidenceUrl(url, scope);
      if (!urlCheck.valid) return null;
      return {
        url: url.slice(0, 2000),
        mediaType,
        fileName: item.fileName ? String(item.fileName).slice(0, 255) : null,
        uploadedAt: item.uploadedAt ? new Date(item.uploadedAt) : new Date(),
      };
    })
    .filter(Boolean);
}

function buildAppealDTO(plain) {
  const appeal = plain?.appeal || {};
  const appealCount = Number(appeal.appealCount || 0);
  const windowEndsAt = resolveAppealWindowEndsAt(plain);
  const now = new Date();
  const withinWindow =
    !!windowEndsAt && now.getTime() <= windowEndsAt.getTime();
  const canAppeal =
    isAfterSalesCaseFlow(plain?.caseFlow) &&
    canShopperAppeal(plain?.status, {
      caseFlow: plain?.caseFlow,
      request: plain,
    }) &&
    appealCount < 1 &&
    withinWindow &&
    !appeal.adminDecision;

  return {
    canAppeal,
    appealCount,
    windowEndsAt: windowEndsAt ? windowEndsAt.toISOString() : null,
    appealedAt: appeal.appealedAt ? new Date(appeal.appealedAt).toISOString() : null,
    reason: appeal.reason || null,
    evidence: Array.isArray(appeal.evidence)
      ? appeal.evidence.map((item) => ({
          url: item.url,
          mediaType: item.mediaType,
          fileName: item.fileName || null,
          uploadedAt: item.uploadedAt
            ? new Date(item.uploadedAt).toISOString()
            : null,
        }))
      : [],
    adminDecision: appeal.adminDecision || null,
    adminDecidedAt: appeal.adminDecidedAt
      ? new Date(appeal.adminDecidedAt).toISOString()
      : null,
  };
}

/**
 * Align DTO + submit: use stored windowEndsAt, else compute from resolution time.
 * Missing/uncomputable window ⇒ not eligible (never treat as open forever).
 */
function resolveAppealWindowEndsAt(plain) {
  const stored = plain?.appeal?.windowEndsAt;
  if (stored) {
    return new Date(stored);
  }
  if (!["resolved", "rejected"].includes(plain?.status)) {
    return null;
  }
  const from = plain.updatedAt || plain.createdAt;
  if (!from) return null;
  return computeAppealWindowEndsAt(from);
}

/**
 * Open appeal window when seller records a final resolution (resolved/rejected).
 */
async function openAppealWindowOnResolution(requestId, resolvedAt = new Date()) {
  if (!mongoose.isValidObjectId(requestId)) return;
  const windowEndsAt = computeAppealWindowEndsAt(resolvedAt);
  await ReturnRequest.updateOne(
    {
      _id: requestId,
      caseFlow: "after_sales",
      "appeal.appealCount": { $lt: 1 },
      "appeal.adminDecision": null,
    },
    {
      $set: {
        "appeal.windowEndsAt": windowEndsAt,
      },
    }
  );
}

/**
 * Shopper submits a one-time appeal after seller resolution.
 */
async function submitShopperAppeal({
  requestId,
  buyerId,
  reason,
  evidence,
}) {
  if (!mongoose.isValidObjectId(requestId)) {
    return { notFound: true };
  }

  const sanitizedReason = sanitizeText(reason, APPEAL_REASON_MAX);
  if (!sanitizedReason) {
    return { invalid: true, message: "An appeal reason is required." };
  }

  const now = new Date();

  const existing = await ReturnRequest.findOne({
    _id: requestId,
    buyer: buyerId,
  }).lean();

  if (!existing) {
    return { notFound: true, message: "After-sales case not found" };
  }

  if (!isAfterSalesCaseFlow(existing.caseFlow)) {
    return {
      notAllowed: true,
      message: "Appeals are only available for seller-owned after-sales cases.",
    };
  }

  if (
    !canShopperAppeal(existing.status, {
      caseFlow: existing.caseFlow,
      request: existing,
    })
  ) {
    if (hasCompletedAfterSalesWalletRefund(existing)) {
      return {
        notAllowed: true,
        message:
          "This case has already been refunded to your wallet and cannot be appealed.",
      };
    }
    return {
      notAllowed: true,
      message: "Appeals are only allowed after the seller has recorded a resolution.",
    };
  }

  const normalizedEvidence = normalizeEvidence(evidence, {
    buyerId: String(buyerId),
    orderId: String(existing.order),
  });
  if (Array.isArray(evidence) && evidence.length > 0 && normalizedEvidence.length === 0) {
    return {
      invalid: true,
      message: "Appeal evidence must be uploaded through the platform.",
    };
  }

  const appealCount = Number(existing.appeal?.appealCount || 0);
  if (appealCount >= 1 || existing.appeal?.adminDecision) {
    return {
      notAllowed: true,
      message: "This case has already been appealed. Admin decision is final.",
    };
  }

  const windowEndsAt = existing.appeal?.windowEndsAt
    ? new Date(existing.appeal.windowEndsAt)
    : computeAppealWindowEndsAt(existing.updatedAt || existing.createdAt);
  if (now.getTime() > windowEndsAt.getTime()) {
    return {
      notAllowed: true,
      message: "The appeal window for this case has expired.",
    };
  }

  if (!isAllowedAfterSalesTransition(existing.status, "under_admin_review")) {
    return {
      invalid: true,
      message: `Cannot appeal from status ${existing.status}`,
    };
  }

  const updated = await ReturnRequest.findOneAndUpdate(
    {
      _id: requestId,
      buyer: buyerId,
      status: { $in: ["resolved", "rejected"] },
      caseFlow: "after_sales",
      walletCreditProcessedAt: null,
      refundCompletedAt: null,
      $or: [
        { "appeal.appealCount": { $exists: false } },
        { "appeal.appealCount": { $lt: 1 } },
      ],
      "appeal.adminDecision": null,
    },
    {
      $set: {
        status: "under_admin_review",
        "appeal.reason": sanitizedReason,
        "appeal.evidence": normalizedEvidence,
        "appeal.appealedAt": now,
        "appeal.appealCount": 1,
        "appeal.windowEndsAt": windowEndsAt,
      },
      $push: {
        statusHistory: {
          fromStatus: existing.status,
          toStatus: "under_admin_review",
          changedAt: now,
          changedBy: buyerId,
          changedByRole: "shopper",
          note: sanitizedReason.slice(0, NOTES_MAX_LENGTH),
        },
      },
    },
    { new: true }
  ).lean();

  if (!updated) {
    return {
      conflict: true,
      message: "Appeal could not be submitted. The case may have changed.",
    };
  }

  return {
    request: updated,
  };
}

/**
 * Admin upholds seller decision (closes case) or overrides resolution.
 */
async function decideShopperAppeal({
  requestId,
  adminId,
  action,
  resolution,
  reasonCode,
  reasonNote,
  note,
}) {
  if (!mongoose.isValidObjectId(requestId)) {
    return { notFound: true };
  }

  const sanitizedNote = sanitizeText(note);
  const normalizedAction = String(action || "")
    .trim()
    .toLowerCase();

  if (!["uphold", "override"].includes(normalizedAction)) {
    return {
      invalid: true,
      message: 'Invalid appeal action. Use "uphold" or "override".',
    };
  }

  if (!sanitizedNote) {
    return {
      invalid: true,
      message: "An admin note is required for the final appeal decision.",
    };
  }

  const existing = await ReturnRequest.findById(requestId);
  if (!existing) {
    return { notFound: true };
  }

  if (!isAfterSalesCaseFlow(existing.caseFlow)) {
    return {
      notAllowed: true,
      message: "Appeal decisions apply only to seller-owned after-sales cases.",
    };
  }

  if (!canAdminDecideAppeal(existing.status, { caseFlow: existing.caseFlow })) {
    return {
      notAllowed: true,
      message: "This case is not awaiting admin appeal review.",
    };
  }

  const now = new Date();
  const fromStatus = existing.status;

  if (normalizedAction === "uphold") {
    if (!isAllowedAfterSalesTransition(fromStatus, "closed")) {
      return { invalid: true, message: "Cannot close this appeal from its current status." };
    }

    existing.status = "closed";
    existing.adminReturnNote = sanitizedNote;
    if (!existing.appeal) existing.appeal = {};
    existing.appeal.adminDecision = "uphold";
    existing.appeal.adminDecidedAt = now;
    existing.statusHistory = existing.statusHistory || [];
    existing.statusHistory.push({
      fromStatus,
      toStatus: "closed",
      changedAt: now,
      changedBy: adminId,
      changedByRole: "admin",
      note: sanitizedNote,
    });
    await existing.save();

    return {
      request: existing.toObject(),
      overrideAction: "uphold",
      appealDecision: "uphold",
    };
  }

  const reasonPayload = normalizeResolutionReasonPayload(
    resolution,
    reasonCode,
    reasonNote
  );
  if (!reasonPayload.valid) {
    return { invalid: true, message: reasonPayload.message };
  }

  if (!canChangeResolutionAfterWalletRefund(existing, reasonPayload.resolution)) {
    return {
      notAllowed: true,
      message:
        "A wallet refund has already been issued for this case. The resolution cannot be changed away from Refund.",
    };
  }

  const toStatus = resolveSellerResolutionTargetStatus(reasonPayload.resolution);
  if (!toStatus || !isAllowedAfterSalesTransition(fromStatus, toStatus)) {
    return {
      invalid: true,
      message: `Invalid override transition from ${fromStatus} to ${toStatus}`,
    };
  }

  existing.status = toStatus;
  existing.adminReturnNote = sanitizedNote;
  existing.manualFollowUpRequired = MANUAL_FOLLOW_UP_RESOLUTIONS.includes(
    reasonPayload.resolution
  );
  if (!existing.appeal) existing.appeal = {};
  existing.appeal.adminDecision = "override";
  existing.appeal.adminDecidedAt = now;
  existing.statusHistory = existing.statusHistory || [];
  existing.statusHistory.push({
    fromStatus,
    toStatus,
    changedAt: now,
    changedBy: adminId,
    changedByRole: "admin",
    note: sanitizedNote,
  });

  appendResolutionChange(existing, {
    toResolution: reasonPayload.resolution,
    changedBy: adminId,
    changedByRole: "admin",
    note: sanitizedNote,
    reasonCode: reasonPayload.reasonCode,
    reasonNote: reasonPayload.reasonNote,
    force: true,
  });

  await existing.save();

  let refundOrchestration = null;
  if (reasonPayload.resolution === "refund") {
    refundOrchestration = await tryAfterSalesRefundOnResolution({
      requestId,
      resolution: reasonPayload.resolution,
    });
  }

  const refreshed = await ReturnRequest.findById(requestId).lean();
  return {
    request: refreshed,
    overrideAction: "override",
    appealDecision: "override",
    refundOrchestration,
  };
}

function getAppealEligibilitySummary(request) {
  return buildAppealDTO(request);
}

module.exports = {
  getAppealWindowDays,
  computeAppealWindowEndsAt,
  openAppealWindowOnResolution,
  submitShopperAppeal,
  decideShopperAppeal,
  getAppealEligibilitySummary,
  buildAppealDTO,
  resolveAppealWindowEndsAt,
};
