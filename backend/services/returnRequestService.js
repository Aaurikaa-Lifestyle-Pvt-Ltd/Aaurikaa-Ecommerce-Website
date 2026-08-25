/**
 * Return request service — create and read return requests for shoppers.
 * Admin review actions are handled by adminReturnService.js.
 */

const ReturnRequest = require("../models/ReturnRequest");
const {
  RETURN_REASON_CODES,
  ISSUE_CATEGORIES,
  MIN_RETURN_EVIDENCE_FILES,
  MAX_RETURN_EVIDENCE_FILES,
  RETURN_EVIDENCE_MEDIA_TYPES,
  EVIDENCE_REQUIRED_MESSAGE,
} = require("../constants/returnRequestConstants");
const {
  getReturnEligibility,
  REASON_MESSAGES,
  REASON,
} = require("./returnEligibilityService");
const {
  getEffectiveResolution,
  mapStatusToQueueBucket,
} = require("../utils/afterSalesCaseSpine");
const { toReverseLogisticsDTO } = require("./reverseLogisticsService");
const { buildAppealDTO } = require("./returnAppealService");

const CUSTOM_REASON_MAX_LENGTH = 500;

function sanitizeText(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/[\x00-\x1F\x7F]/g, "")
    .trim();
}

/**
 * Validate Need Help / return reason payload.
 * Accepts issueCategory (preferred) or legacy reasonCode; keeps both in sync.
 */
function validateReturnReason({ reasonCode, reasonText, issueCategory, description }) {
  const category = sanitizeText(issueCategory || reasonCode).toUpperCase();
  const details = sanitizeText(
    description !== undefined && description !== null ? description : reasonText
  );

  if (!category) {
    return { valid: false, message: "Please select an issue category." };
  }

  if (!ISSUE_CATEGORIES.includes(category) && !RETURN_REASON_CODES.includes(category)) {
    return { valid: false, message: "Invalid issue category." };
  }

  if (category === "OTHER") {
    if (!details) {
      return { valid: false, message: "Please describe the issue." };
    }
    if (details.length > CUSTOM_REASON_MAX_LENGTH) {
      return {
        valid: false,
        message: `Issue description must be ${CUSTOM_REASON_MAX_LENGTH} characters or fewer.`,
      };
    }
  } else if (details.length > CUSTOM_REASON_MAX_LENGTH) {
    return {
      valid: false,
      message: `Issue description must be ${CUSTOM_REASON_MAX_LENGTH} characters or fewer.`,
    };
  }

  return {
    valid: true,
    reasonCode: category,
    issueCategory: category,
    reasonText: details || null,
  };
}

function validateEvidence(evidence, scope = {}) {
  if (evidence === null || evidence === undefined || evidence === "") {
    return { valid: false, message: EVIDENCE_REQUIRED_MESSAGE };
  }

  let list = evidence;
  if (typeof evidence === "string") {
    try {
      list = JSON.parse(evidence);
    } catch {
      return { valid: false, message: "Invalid evidence payload." };
    }
  }

  if (!Array.isArray(list)) {
    return { valid: false, message: "Evidence must be an array." };
  }

  if (list.length < MIN_RETURN_EVIDENCE_FILES) {
    return { valid: false, message: EVIDENCE_REQUIRED_MESSAGE };
  }

  if (list.length > MAX_RETURN_EVIDENCE_FILES) {
    return {
      valid: false,
      message: `You can upload at most ${MAX_RETURN_EVIDENCE_FILES} evidence files.`,
    };
  }

  const { validatePlatformEvidenceUrl } = require("../utils/returnEvidenceUrl");
  const normalized = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") {
      return { valid: false, message: "Each evidence item must be an object." };
    }
    const url = sanitizeText(entry.url);
    const mediaType = sanitizeText(entry.mediaType).toLowerCase();
    const fileName = sanitizeText(entry.fileName) || null;

    if (!RETURN_EVIDENCE_MEDIA_TYPES.includes(mediaType)) {
      return {
        valid: false,
        message: "Evidence media type must be image or video.",
      };
    }

    const urlCheck = validatePlatformEvidenceUrl(url, scope);
    if (!urlCheck.valid) {
      return { valid: false, message: urlCheck.message };
    }

    normalized.push({
      url,
      mediaType,
      fileName: fileName ? fileName.slice(0, 255) : null,
      uploadedAt: entry.uploadedAt ? new Date(entry.uploadedAt) : new Date(),
    });
  }

  return { valid: true, evidence: normalized };
}

/**
 * Find the most recent return request for a given order (any status).
 */
async function findExistingReturnRequest(orderId) {
  return ReturnRequest.findOne({ order: orderId })
    .sort({ createdAt: -1 })
    .lean();
}

/**
 * Create a new return / Need Help request.
 * Enforces: delivered status gate, policy eligibility, no active request, valid intake.
 *
 * @returns {{ success, request, error, eligibility }}
 */
async function createReturnRequest({
  order,
  buyerId,
  reasonCode,
  reasonText,
  issueCategory,
  description,
  evidence,
  returnWindowDays,
  returnAllowed,
}) {
  const existing = await findExistingReturnRequest(order._id);
  const eligibility = getReturnEligibility(order, existing, {
    returnWindowDays,
    returnAllowed,
  });

  if (!eligibility.eligible) {
    return { success: false, error: eligibility.message, eligibility };
  }

  const reasonValidation = validateReturnReason({
    reasonCode,
    reasonText,
    issueCategory,
    description,
  });
  if (!reasonValidation.valid) {
    return { success: false, error: reasonValidation.message, eligibility };
  }

  const evidenceValidation = validateEvidence(evidence, {
    buyerId: String(buyerId),
    orderId: String(order._id),
  });
  if (!evidenceValidation.valid) {
    return { success: false, error: evidenceValidation.message, eligibility };
  }

  try {
    const submittedAt = new Date();
    const request = await ReturnRequest.create({
      order: order._id,
      buyer: buyerId,
      reasonCode: reasonValidation.reasonCode,
      reasonText: reasonValidation.reasonText,
      issueCategory: reasonValidation.issueCategory,
      evidence: evidenceValidation.evidence,
      status: "pending_review",
      // Phase 2 cutover: new cases are seller-owned after-sales flow.
      caseFlow: "after_sales",
      resolution: null,
      returnRequired: null,
      manualFollowUpRequired: false,
      statusHistory: [
        {
          fromStatus: null,
          toStatus: "pending_review",
          changedAt: submittedAt,
          changedBy: buyerId,
          changedByRole: "shopper",
          note: null,
        },
      ],
      resolutionHistory: [],
    });

    const created = request.toObject();
    const postCreateEligibility = getReturnEligibility(order, created, {
      returnWindowDays,
      returnAllowed,
    });

    return {
      success: true,
      request: created,
      eligibility: postCreateEligibility,
    };
  } catch (err) {
    if (err && err.code === 11000) {
      const conflicting = (await findExistingReturnRequest(order._id)) || existing;
      const duplicateEligibility = getReturnEligibility(order, conflicting, {
        returnWindowDays,
        returnAllowed,
      });
      return {
        success: false,
        error:
          duplicateEligibility.message ||
          REASON_MESSAGES[REASON.ACTIVE_REQUEST_EXISTS],
        eligibility: duplicateEligibility,
        duplicate: true,
      };
    }
    throw err;
  }
}

/**
 * Convert a ReturnRequest document to a shopper-visible DTO.
 */
function toShopperReturnRequestDTO(req) {
  if (!req) return null;
  return {
    _id: String(req._id),
    status: req.status,
    caseFlow: req.caseFlow || "legacy",
    resolution: req.resolution || null,
    effectiveResolution: getEffectiveResolution(req),
    resolutionReasonCode: req.resolutionReasonCode || null,
    resolutionReasonNote: req.resolutionReasonNote || null,
    returnRequired: typeof req.returnRequired === "boolean" ? req.returnRequired : null,
    queueBucket: mapStatusToQueueBucket(req.status),
    reasonCode: req.reasonCode,
    reasonText: req.reasonText || null,
    issueCategory: req.issueCategory || req.reasonCode || null,
    evidence: Array.isArray(req.evidence)
      ? req.evidence.map((item) => ({
          url: item.url,
          mediaType: item.mediaType,
          fileName: item.fileName || null,
          uploadedAt: item.uploadedAt
            ? new Date(item.uploadedAt).toISOString()
            : null,
        }))
      : [],
    createdAt: req.createdAt ? new Date(req.createdAt).toISOString() : null,
    updatedAt: req.updatedAt ? new Date(req.updatedAt).toISOString() : null,
    returnReviewedAt: req.returnReviewedAt ? new Date(req.returnReviewedAt).toISOString() : null,
    refundReviewedAt: req.refundReviewedAt ? new Date(req.refundReviewedAt).toISOString() : null,
    refundCompletedAt: req.refundCompletedAt ? new Date(req.refundCompletedAt).toISOString() : null,
    walletCreditProcessedAt: req.walletCreditProcessedAt
      ? new Date(req.walletCreditProcessedAt).toISOString()
      : null,
    walletCreditAmount:
      typeof req.walletCreditAmount === "number" ? req.walletCreditAmount : null,
    receiptConfirmedAt: req.receiptConfirmedAt
      ? new Date(req.receiptConfirmedAt).toISOString()
      : null,
    manualFollowUpRequired: !!req.manualFollowUpRequired,
    replacementOrderId: req.replacementOrder ? String(req.replacementOrder) : null,
    reverseLogistics: toReverseLogisticsDTO(req.reverseLogistics),
    appeal: buildAppealDTO(req),
  };
}

module.exports = {
  validateReturnReason,
  validateEvidence,
  findExistingReturnRequest,
  createReturnRequest,
  toShopperReturnRequestDTO,
  CUSTOM_REASON_MAX_LENGTH,
};
