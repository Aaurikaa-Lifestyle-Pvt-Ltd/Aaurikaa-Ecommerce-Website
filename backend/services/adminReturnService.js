/**
 * Admin return/refund review service (Modules 3, 5, 6).
 * Queue listing, return review, refund review, and refund completion tracking.
 * Financial reversal on refund completion — Phase D (returnRefundFinancialService).
 */

const mongoose = require("mongoose");
const ReturnRequest = require("../models/ReturnRequest");
const Order = require("../models/Order");
const { toPaymentVisibilityDTO } = require("./paymentVisibilityService");
const {
  isAllowedReturnStatusTransition,
  resolveReturnReviewTarget,
  canReviewReturn,
  canReviewRefund,
  canCompleteRefund,
  canSellerReview,
  canConfirmReceipt,
  canSelectResolution,
  isTerminalReturnStatus,
  canAdminReopenCase,
  canAdminOverrideResolution,
  canAdminDecideAppeal,
  resolveSellerResolutionTargetStatus,
  isAllowedAfterSalesTransition,
  normalizeResolutionReasonPayload,
  hasCompletedAfterSalesWalletRefund,
  canChangeResolutionAfterWalletRefund,
} = require("../utils/returnStatusGuards");
const {
  getEffectiveResolution,
  mapStatusToQueueBucket,
  appendResolutionChange,
  isAfterSalesCaseFlow,
} = require("../utils/afterSalesCaseSpine");
const { toReverseLogisticsDTO } = require("./reverseLogisticsService");
const { tryAfterSalesRefundOnResolution } = require("./returnRefundOrchestrationService");
const {
  MANUAL_FOLLOW_UP_RESOLUTIONS,
} = require("../constants/returnRequestConstants");
const {
  decideShopperAppeal,
  buildAppealDTO,
} = require("./returnAppealService");
const { REFUND_HOLD_MESSAGE } = require("./adminAfterSalesOpsService");

const NOTES_MAX_LENGTH = 1000;

const QUEUE_STATUS_FILTERS = {
  pending_review: ["pending_review"],
  return_approved: ["approved", "refund_pending"],
  refund_approved: ["refund_approved"],
  resolved: ["rejected", "refund_rejected", "refund_completed", "resolved", "closed"],
  awaiting_pickup: ["awaiting_pickup"],
  in_transit: ["in_transit"],
  awaiting_inspection: ["awaiting_inspection"],
  under_admin_review: ["under_admin_review"],
  after_sales_open: [
    "pending_review",
    "awaiting_pickup",
    "in_transit",
    "awaiting_inspection",
    "under_admin_review",
  ],
};

const QUEUE_CASE_FLOW_FILTERS = new Set(["after_sales", "legacy"]);

const ORDER_POPULATE = [
  { path: "buyer", select: "firstName lastName email phone" },
  {
    path: "items.product",
    select: "name title seller sku images",
    populate: { path: "seller", select: "shopName firstName lastName" },
  },
];

function sanitizeNote(value) {
  if (value === null || value === undefined) return null;
  const sanitized = String(value)
    .replace(/[\x00-\x1F\x7F]/g, "")
    .trim();
  if (!sanitized) return null;
  return sanitized.slice(0, NOTES_MAX_LENGTH);
}

function toISO(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toStatusHistoryDTO(history) {
  return (history || []).map((entry) => ({
    fromStatus: entry.fromStatus || null,
    toStatus: entry.toStatus,
    changedAt: toISO(entry.changedAt),
    changedBy: entry.changedBy ? String(entry.changedBy) : null,
    changedByRole: entry.changedByRole || null,
    changedBySeller: entry.changedBySeller ? String(entry.changedBySeller) : null,
    note: entry.note || null,
  }));
}

function toResolutionHistoryDTO(history) {
  return (history || []).map((entry) => ({
    fromResolution: entry.fromResolution || null,
    toResolution: entry.toResolution,
    changedAt: toISO(entry.changedAt),
    changedBy: entry.changedBy ? String(entry.changedBy) : null,
    changedByRole: entry.changedByRole || null,
    note: entry.note || null,
    reasonCode: entry.reasonCode || null,
    reasonNote: entry.reasonNote || null,
  }));
}

function toAdminReturnRequestDTO(request, order) {
  const plain = request && typeof request.toObject === "function" ? request.toObject() : request;
  const orderPlain = order && typeof order.toObject === "function" ? order.toObject() : order;
  const caseFlow = plain.caseFlow || "legacy";

  return {
    _id: String(plain._id),
    status: plain.status,
    caseFlow,
    resolution: plain.resolution || null,
    effectiveResolution: getEffectiveResolution(plain),
    resolutionReasonCode: plain.resolutionReasonCode || null,
    resolutionReasonNote: plain.resolutionReasonNote || null,
    returnRequired: typeof plain.returnRequired === "boolean" ? plain.returnRequired : null,
    queueBucket: mapStatusToQueueBucket(plain.status),
    reasonCode: plain.reasonCode,
    reasonText: plain.reasonText || null,
    issueCategory: plain.issueCategory || plain.reasonCode || null,
    evidence: Array.isArray(plain.evidence)
      ? plain.evidence.map((item) => ({
          url: item.url,
          mediaType: item.mediaType,
          fileName: item.fileName || null,
          uploadedAt: toISO(item.uploadedAt),
        }))
      : [],
    adminReturnNote: plain.adminReturnNote || null,
    adminRefundNote: plain.adminRefundNote || null,
    sellerNote: plain.sellerNote || null,
    appeal: buildAppealDTO(plain),
    receiptConfirmedAt: toISO(plain.receiptConfirmedAt),
    manualFollowUpRequired: !!plain.manualFollowUpRequired,
    reverseLogistics: toReverseLogisticsDTO(plain.reverseLogistics),
    replacementOrderId: plain.replacementOrder ? String(plain.replacementOrder) : null,
    createdAt: toISO(plain.createdAt),
    updatedAt: toISO(plain.updatedAt),
    returnReviewedAt: toISO(plain.returnReviewedAt),
    refundReviewedAt: toISO(plain.refundReviewedAt),
    refundCompletedAt: toISO(plain.refundCompletedAt),
    slaReminderSentAt: toISO(plain.slaReminderSentAt),
    slaEscalatedAt: toISO(plain.slaEscalatedAt),
    financialReversalProcessedAt: toISO(plain.financialReversalProcessedAt),
    financialReversalSummary: plain.financialReversalSummary || null,
    statusHistory: toStatusHistoryDTO(plain.statusHistory),
    resolutionHistory: toResolutionHistoryDTO(plain.resolutionHistory),
    order: orderPlain
      ? {
          _id: String(orderPlain._id),
          invoiceNumber: orderPlain.invoiceNumber || null,
          status: orderPlain.status,
          totalAmount: orderPlain.totalAmount ?? null,
          paymentMethod: orderPlain.paymentMethod || null,
          createdAt: toISO(orderPlain.createdAt),
          buyer: orderPlain.buyer || null,
          items: orderPlain.items || [],
          paymentVisibility: toPaymentVisibilityDTO(orderPlain),
        }
      : plain.order
        ? { _id: String(plain.order) }
        : null,
    buyer: plain.buyer ? String(plain.buyer) : null,
    actions: {
      canReviewReturn: canReviewReturn(plain.status, { caseFlow }),
      canReviewRefund: canReviewRefund(plain.status, { caseFlow }),
      canCompleteRefund: canCompleteRefund(plain.status, { caseFlow }),
      // After-sales Admin ops (internal Seller) — preferred over legacy canReviewReturn
      canAccept: canSellerReview(plain.status, { caseFlow }),
      canReject: canSellerReview(plain.status, { caseFlow }),
      canConfirmReceipt: canConfirmReceipt(plain.status, { caseFlow }),
      canSelectResolution: canSelectResolution(plain.status, { caseFlow }),
      isTerminal: isTerminalReturnStatus(plain.status),
      isSellerOwned: caseFlow === "after_sales",
      canAdminReopen: canAdminReopenCase(plain.status, { caseFlow }),
      canAdminOverrideResolution:
        canAdminOverrideResolution(plain.status, { caseFlow }) &&
        !hasCompletedAfterSalesWalletRefund(plain),
      canDecideAppeal: canAdminDecideAppeal(plain.status, { caseFlow }),
      walletRefundLocked: hasCompletedAfterSalesWalletRefund(plain),
    },
  };
}

function resolveStatusFilter(statusFilter) {
  if (!statusFilter) return null;
  const key = String(statusFilter).trim().toLowerCase();
  if (QUEUE_CASE_FLOW_FILTERS.has(key)) {
    return { caseFlow: key };
  }
  const statuses = QUEUE_STATUS_FILTERS[key] || null;
  if (statuses) {
    return { status: { $in: statuses } };
  }
  return null;
}

/**
 * Paginated admin return/refund review queue.
 */
async function listReturnReviewQueue({ page = 1, limit = 10, status: statusFilter } = {}) {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (safePage - 1) * safeLimit;

  const filter = {};
  const mappedFilter = resolveStatusFilter(statusFilter);
  if (mappedFilter) {
    Object.assign(filter, mappedFilter);
  } else if (statusFilter) {
    filter.status = String(statusFilter).trim().toLowerCase();
  }

  const [totalCount, requests] = await Promise.all([
    ReturnRequest.countDocuments(filter),
    ReturnRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
  ]);

  const orderIds = requests.map((r) => r.order).filter(Boolean);
  const orders = await Order.find({ _id: { $in: orderIds } })
    .populate(ORDER_POPULATE)
    .lean();
  const orderMap = new Map(orders.map((o) => [String(o._id), o]));

  const items = requests.map((req) =>
    toAdminReturnRequestDTO(req, orderMap.get(String(req.order)) || null)
  );

  const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / safeLimit);

  return {
    requests: items,
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount,
      totalPages,
    },
  };
}

/**
 * Single return request detail for admin review.
 */
async function getReturnRequestDetail(requestId) {
  if (!mongoose.isValidObjectId(requestId)) {
    return { notFound: true };
  }

  const request = await ReturnRequest.findById(requestId).lean();
  if (!request) {
    return { notFound: true };
  }

  const order = await Order.findById(request.order).populate(ORDER_POPULATE).lean();
  if (!order) {
    return { notFound: true, message: "Linked order not found" };
  }

  return { request: toAdminReturnRequestDTO(request, order) };
}

/**
 * Atomically transition status when the document is still in an expected state.
 * Prevents concurrent admin actions from producing inconsistent transitions.
 */
async function executeStatusTransition({
  requestId,
  allowedFromStatuses,
  toStatus,
  adminId,
  note,
  additionalSets = {},
}) {
  if (!mongoose.isValidObjectId(requestId)) {
    return { notFound: true };
  }

  const fromList = (Array.isArray(allowedFromStatuses)
    ? allowedFromStatuses
    : [allowedFromStatuses]
  ).filter((status) => isAllowedReturnStatusTransition(status, toStatus));

  if (fromList.length === 0) {
    return {
      invalid: true,
      message: `Invalid status transition to ${toStatus}`,
    };
  }

  const sanitizedNote = sanitizeNote(note);
  const now = new Date();
  const adminObjectId =
    adminId && mongoose.isValidObjectId(adminId)
      ? new mongoose.Types.ObjectId(adminId)
      : null;

  const updated = await ReturnRequest.findOneAndUpdate(
    { _id: requestId, status: { $in: fromList } },
    [
      {
        $set: {
          status: toStatus,
          ...additionalSets,
          statusHistory: {
            $concatArrays: [
              { $ifNull: ["$statusHistory", []] },
              [
                {
                  fromStatus: "$status",
                  toStatus,
                  changedAt: now,
                  changedBy: adminObjectId,
                  changedByRole: "admin",
                  note: sanitizedNote,
                },
              ],
            ],
          },
        },
      },
    ],
    { new: true }
  );

  if (!updated) {
    const current = await ReturnRequest.findById(requestId).select("status").lean();
    if (!current) {
      return { notFound: true };
    }
    return {
      conflict: true,
      message: "Request status has changed. Refresh and try again.",
    };
  }

  const order = await Order.findById(updated.order).populate(ORDER_POPULATE).lean();
  return { request: toAdminReturnRequestDTO(updated, order) };
}

/**
 * Approve or reject a return request (return review step).
 */
async function reviewReturnRequest({ requestId, adminId, action, note }) {
  const targetStatus = resolveReturnReviewTarget(action);
  if (!targetStatus) {
    return { invalid: true, message: "Invalid return review action. Use approve or reject." };
  }

  if (!mongoose.isValidObjectId(requestId)) {
    return { notFound: true };
  }

  const existing = await ReturnRequest.findById(requestId)
    .select("status caseFlow")
    .lean();
  if (!existing) {
    return { notFound: true };
  }
  if (!canReviewReturn(existing.status, { caseFlow: existing.caseFlow })) {
    return {
      notAllowed: true,
      message: isAfterSalesOwned(existing.caseFlow)
        ? "This case is seller-owned. Use admin override tools when available."
        : "Return review is not available for the current status.",
    };
  }

  const sanitizedNote = sanitizeNote(note);
  const now = new Date();
  const additionalSets = { returnReviewedAt: now };
  if (sanitizedNote) {
    additionalSets.adminReturnNote = sanitizedNote;
  }

  return executeStatusTransition({
    requestId,
    allowedFromStatuses: ["pending_review"],
    toStatus: targetStatus,
    adminId,
    note,
    additionalSets,
  });
}

function isAfterSalesOwned(caseFlow) {
  return String(caseFlow || "").toLowerCase() === "after_sales";
}

/**
 * Approve or reject refund after return approval (refund review step).
 * SEC-006 HOLD: AAURIKAA Admin must not process refunds until policy is approved.
 */
async function reviewRefundRequest(_params) {
  return { notAllowed: true, message: REFUND_HOLD_MESSAGE };
}

/**
 * Mark refund as manually processed/completed (no gateway integration).
 * SEC-006 HOLD: AAURIKAA Admin must not process refunds until policy is approved.
 */
async function completeRefundRequest(_params) {
  return { notAllowed: true, message: REFUND_HOLD_MESSAGE };
}

/**
 * Admin governance: reopen a seller-rejected after-sales case for re-review.
 */
async function reopenAfterSalesCase({ requestId, adminId, note }) {
  if (!mongoose.isValidObjectId(requestId)) {
    return { notFound: true };
  }

  const sanitizedNote = sanitizeNote(note);
  if (!sanitizedNote) {
    return { invalid: true, message: "An override note is required for audit purposes." };
  }

  const existing = await ReturnRequest.findById(requestId)
    .select("status caseFlow resolution")
    .lean();
  if (!existing) {
    return { notFound: true };
  }
  if (!isAfterSalesCaseFlow(existing.caseFlow)) {
    return {
      notAllowed: true,
      message: "Reopen is only available for seller-owned after-sales cases.",
    };
  }
  if (!canAdminReopenCase(existing.status, { caseFlow: existing.caseFlow })) {
    return {
      notAllowed: true,
      message: "This case cannot be reopened from its current status.",
    };
  }

  const transitionResult = await executeStatusTransition({
    requestId,
    allowedFromStatuses: ["rejected"],
    toStatus: "pending_review",
    adminId,
    note: sanitizedNote,
    additionalSets: {
      adminReturnNote: sanitizedNote,
      manualFollowUpRequired: false,
    },
  });

  if (transitionResult.notFound || transitionResult.invalid || transitionResult.conflict) {
    return transitionResult;
  }

  return { ...transitionResult, overrideAction: "reopen" };
}

/**
 * Admin governance: override Resolution on a seller-owned after-sales case (dispute).
 * Writes immutable Resolution history; may trigger wallet refund when Resolution = Refund.
 */
async function overrideAfterSalesResolution({
  requestId,
  adminId,
  resolution,
  reasonCode,
  reasonNote,
  note,
}) {
  if (!mongoose.isValidObjectId(requestId)) {
    return { notFound: true };
  }

  const sanitizedNote = sanitizeNote(note);
  if (!sanitizedNote) {
    return { invalid: true, message: "An override note is required for audit purposes." };
  }

  const reasonPayload = normalizeResolutionReasonPayload(
    resolution,
    reasonCode,
    reasonNote
  );
  if (!reasonPayload.valid) {
    return { invalid: true, message: reasonPayload.message };
  }
  const normalized = reasonPayload.resolution;

  // SEC-006 HOLD — block Admin refund override before wallet/transition work
  if (normalized === "refund") {
    return { notAllowed: true, message: REFUND_HOLD_MESSAGE };
  }

  const existing = await ReturnRequest.findById(requestId).lean();
  if (!existing) {
    return { notFound: true };
  }
  if (!isAfterSalesCaseFlow(existing.caseFlow)) {
    return {
      notAllowed: true,
      message: "Resolution override is only available for seller-owned after-sales cases.",
    };
  }
  if (!canAdminOverrideResolution(existing.status, { caseFlow: existing.caseFlow })) {
    return {
      notAllowed: true,
      message: "Resolution override is not available for the current status.",
    };
  }

  if (!canChangeResolutionAfterWalletRefund(existing, normalized)) {
    return {
      notAllowed: true,
      message:
        "A wallet refund has already been issued for this case. The resolution cannot be changed away from Refund.",
    };
  }

  const toStatus = resolveSellerResolutionTargetStatus(normalized);
  if (!toStatus) {
    return { invalid: true, message: "Unable to determine override target status." };
  }

  const fromStatus = existing.status;
  let transitionResult = { request: null };

  if (fromStatus !== toStatus) {
    if (!isAllowedAfterSalesTransition(fromStatus, toStatus)) {
      return {
        invalid: true,
        message: `Invalid status transition from ${fromStatus} to ${toStatus}`,
      };
    }

    transitionResult = await executeStatusTransition({
      requestId,
      allowedFromStatuses: [fromStatus],
      toStatus,
      adminId,
      note: sanitizedNote,
      additionalSets: {
        adminReturnNote: sanitizedNote,
        manualFollowUpRequired: MANUAL_FOLLOW_UP_RESOLUTIONS.includes(normalized),
      },
    });

    if (transitionResult.notFound || transitionResult.invalid || transitionResult.conflict) {
      return transitionResult;
    }
  } else {
    const order = await Order.findById(existing.order).populate(ORDER_POPULATE).lean();
    transitionResult = { request: toAdminReturnRequestDTO(existing, order) };
  }

  const resolutionPersist = await persistAdminResolutionChange(
    requestId,
    adminId,
    normalized,
    sanitizedNote,
    reasonPayload.reasonCode,
    reasonPayload.reasonNote
  );
  if (resolutionPersist.notFound) {
    return { notFound: true };
  }

  // Mark appeal as decided when overriding from under_admin_review
  if (fromStatus === "under_admin_review") {
    await ReturnRequest.updateOne(
      { _id: requestId },
      {
        $set: {
          "appeal.adminDecision": "override",
          "appeal.adminDecidedAt": new Date(),
        },
      }
    );
  }

  let refundOrchestration = null;
  if (normalized === "refund") {
    refundOrchestration = await tryAfterSalesRefundOnResolution({
      requestId,
      resolution: normalized,
    });
  }

  let replacementFulfillment = null;
  if (normalized === "replacement") {
    const { fulfillApprovedReplacement } = require("./replacementFulfillmentService");
    replacementFulfillment = await fulfillApprovedReplacement({ returnRequestId: requestId });
  }

  const refreshed = await ReturnRequest.findById(requestId).lean();
  const order = await Order.findById(refreshed.order).populate(ORDER_POPULATE).lean();

  return {
    request: toAdminReturnRequestDTO(refreshed, order),
    overrideAction: "set_resolution",
    refundOrchestration,
    replacementFulfillment,
  };
}

async function persistAdminResolutionChange(
  requestId,
  adminId,
  toResolution,
  note,
  reasonCode = null,
  reasonNote = null
) {
  const doc = await ReturnRequest.findById(requestId);
  if (!doc) {
    return { notFound: true };
  }

  appendResolutionChange(doc, {
    toResolution,
    changedBy: adminId,
    changedByRole: "admin",
    note: note || null,
    reasonCode,
    reasonNote,
    force: true,
  });
  doc.manualFollowUpRequired = MANUAL_FOLLOW_UP_RESOLUTIONS.includes(toResolution);
  await doc.save();
  return { request: doc };
}

/**
 * Admin governance entry point: reopen, override resolution, or decide appeal.
 */
async function overrideAfterSalesCase({
  requestId,
  adminId,
  action,
  resolution,
  reasonCode,
  reasonNote,
  note,
}) {
  const normalizedAction = String(action || "")
    .trim()
    .toLowerCase();

  if (normalizedAction === "reopen") {
    return reopenAfterSalesCase({ requestId, adminId, note });
  }
  if (normalizedAction === "set_resolution") {
    return overrideAfterSalesResolution({
      requestId,
      adminId,
      resolution,
      reasonCode,
      reasonNote,
      note,
    });
  }
  if (normalizedAction === "uphold" || normalizedAction === "override") {
    const appealResult = await decideShopperAppeal({
      requestId,
      adminId,
      action: normalizedAction,
      resolution,
      reasonCode,
      reasonNote,
      note,
    });
    if (
      appealResult.notFound ||
      appealResult.invalid ||
      appealResult.notAllowed ||
      appealResult.conflict
    ) {
      return appealResult;
    }
    const order = await Order.findById(appealResult.request.order)
      .populate(ORDER_POPULATE)
      .lean();
    return {
      request: toAdminReturnRequestDTO(appealResult.request, order),
      overrideAction: appealResult.overrideAction,
      appealDecision: appealResult.appealDecision,
      refundOrchestration: appealResult.refundOrchestration || null,
    };
  }

  return {
    invalid: true,
    message:
      'Invalid override action. Use "reopen", "set_resolution", "uphold", or "override".',
  };
}

module.exports = {
  QUEUE_STATUS_FILTERS,
  QUEUE_CASE_FLOW_FILTERS,
  listReturnReviewQueue,
  getReturnRequestDetail,
  reviewReturnRequest,
  reviewRefundRequest,
  completeRefundRequest,
  overrideAfterSalesCase,
  reopenAfterSalesCase,
  overrideAfterSalesResolution,
  toAdminReturnRequestDTO,
};
