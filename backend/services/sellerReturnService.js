/**
 * Seller after-sales decision service (Phase 2 / Module D + I; Phase 3 logistics hooks).
 * Queue filters, accept/reject, receipt confirmation, resolution selection.
 * Replacement creates an outbound Order on the existing fulfilment path.
 * Repair remains manual follow-up. Refund wallet automation is inherited ANBAZAR behaviour (AAURIKAA policy HOLD).
 * Accept with returnRequired=true triggers conditional reverse pickup scheduling (non-blocking).
 */

const mongoose = require("mongoose");
const ReturnRequest = require("../models/ReturnRequest");
const Order = require("../models/Order");
const Product = require("../models/Product");
const { toPaymentVisibilityDTO } = require("./paymentVisibilityService");
const {
  SELLER_QUEUE_FILTERS,
  MANUAL_FOLLOW_UP_RESOLUTIONS,
} = require("../constants/returnRequestConstants");
const {
  isAllowedAfterSalesTransition,
  canSellerReview,
  canConfirmReceipt,
  canSelectResolution,
  isTerminalReturnStatus,
  isValidReturnResolution,
  resolveSellerAcceptTarget,
  resolveSellerResolutionTargetStatus,
  normalizeResolutionReasonPayload,
} = require("../utils/returnStatusGuards");
const {
  getEffectiveResolution,
  mapStatusToQueueBucket,
  isAfterSalesCaseFlow,
  appendResolutionChange,
} = require("../utils/afterSalesCaseSpine");
const {
  scheduleReturnPickup,
  retryReturnPickup,
  toReverseLogisticsDTO,
} = require("./reverseLogisticsService");
const { tryAfterSalesRefundOnResolution } = require("./returnRefundOrchestrationService");
const { openAppealWindowOnResolution } = require("./returnAppealService");
const { buildAppealDTO } = require("./returnAppealService");
const { restoreStockForReturnedOrder } = require("./inventoryLifecycleService");
const { fulfillApprovedReplacement } = require("./replacementFulfillmentService");

const NOTES_MAX_LENGTH = 1000;

const SELLER_QUEUE_STATUS_FILTERS = {
  pending_review: ["pending_review"],
  awaiting_pickup: ["awaiting_pickup"],
  in_transit: ["in_transit"],
  awaiting_inspection: ["awaiting_inspection"],
  resolved: ["resolved"],
  closed: ["rejected", "closed"],
};

const ORDER_POPULATE = [
  { path: "buyer", select: "firstName lastName email phone" },
  {
    path: "items.product",
    select: "name title seller sku images",
    populate: { path: "seller", select: "shopName firstName lastName email" },
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

function toEvidenceDTO(evidence) {
  return (evidence || []).map((item) => ({
    url: item.url,
    mediaType: item.mediaType,
    fileName: item.fileName || null,
    uploadedAt: toISO(item.uploadedAt),
  }));
}

function parseReturnRequired(value) {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return null;
}

async function getSellerProductIds(sellerId) {
  const products = await Product.find({ seller: sellerId }).select("_id").lean();
  return products.map((p) => String(p._id));
}

function orderHasSellerProducts(order, productIdSet) {
  if (!order || !Array.isArray(order.items)) return false;
  return order.items.some((item) => {
    const productRef = item.product;
    const id =
      productRef && typeof productRef === "object"
        ? String(productRef._id || productRef.id || "")
        : String(productRef || "");
    return id && productIdSet.has(id);
  });
}

function filterOrderItemsForSeller(order, productIdSet) {
  if (!order || !Array.isArray(order.items)) return [];
  return order.items.filter((item) => {
    const productRef = item.product;
    const id =
      productRef && typeof productRef === "object"
        ? String(productRef._id || productRef.id || "")
        : String(productRef || "");
    return id && productIdSet.has(id);
  });
}

function toSellerReturnRequestDTO(request, order, productIdSet) {
  const plain = request && typeof request.toObject === "function" ? request.toObject() : request;
  const orderPlain = order && typeof order.toObject === "function" ? order.toObject() : order;
  const caseFlow = plain.caseFlow || "legacy";
  const sellerItems = filterOrderItemsForSeller(orderPlain, productIdSet);

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
    evidence: toEvidenceDTO(plain.evidence),
    sellerNote: plain.sellerNote || null,
    appeal: buildAppealDTO(plain),
    receiptConfirmedAt: toISO(plain.receiptConfirmedAt),
    refundCompletedAt: toISO(plain.refundCompletedAt),
    walletCreditProcessedAt: toISO(plain.walletCreditProcessedAt),
    walletCreditAmount:
      typeof plain.walletCreditAmount === "number" ? plain.walletCreditAmount : null,
    manualFollowUpRequired: !!plain.manualFollowUpRequired,
    replacementOrderId: plain.replacementOrder ? String(plain.replacementOrder) : null,
    reverseLogistics: toReverseLogisticsDTO(plain.reverseLogistics),
    createdAt: toISO(plain.createdAt),
    updatedAt: toISO(plain.updatedAt),
    returnReviewedAt: toISO(plain.returnReviewedAt),
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
          items: sellerItems,
          shippingDetails: orderPlain.shippingDetails || null,
          paymentVisibility: toPaymentVisibilityDTO(orderPlain),
        }
      : plain.order
        ? { _id: String(plain.order) }
        : null,
    buyer: plain.buyer ? String(plain.buyer) : null,
    actions: {
      canAccept: canSellerReview(plain.status, { caseFlow }),
      canReject: canSellerReview(plain.status, { caseFlow }),
      canConfirmReceipt: canConfirmReceipt(plain.status, { caseFlow }),
      canSelectResolution: canSelectResolution(plain.status, { caseFlow }),
      canRetryPickup: canRetryReversePickup(plain),
      isTerminal: isTerminalReturnStatus(plain.status),
      isSellerOwned: isAfterSalesCaseFlow(caseFlow),
    },
  };
}

function canRetryReversePickup(plain) {
  if (!isAfterSalesCaseFlow(plain.caseFlow || "legacy")) return false;
  if (plain.returnRequired !== true) return false;
  if (!["awaiting_pickup", "in_transit"].includes(plain.status)) return false;
  const rl = plain.reverseLogistics || {};
  if (rl.status === "scheduling") return false;
  if (
    ["scheduled", "in_transit", "delivered"].includes(rl.status) &&
    (rl.shiprocketOrderId || rl.awbCode || rl.shiprocketShipmentId)
  ) {
    return false;
  }
  if (rl.shiprocketOrderId || rl.awbCode) {
    return rl.status === "failed";
  }
  return rl.status === "failed" || !rl.status || rl.status === "pending";
}

function resolveStatusFilter(statusFilter) {
  if (!statusFilter) return null;
  const key = String(statusFilter).trim().toLowerCase();
  if (!SELLER_QUEUE_FILTERS.includes(key)) return null;
  return SELLER_QUEUE_STATUS_FILTERS[key] || null;
}

/**
 * Atomically transition status for a seller-owned after_sales case.
 */
async function executeSellerStatusTransition({
  requestId,
  sellerId,
  allowedFromStatuses,
  toStatus,
  note,
  additionalSets = {},
}) {
  if (!mongoose.isValidObjectId(requestId)) {
    return { notFound: true };
  }

  const fromList = (Array.isArray(allowedFromStatuses)
    ? allowedFromStatuses
    : [allowedFromStatuses]
  ).filter((status) => isAllowedAfterSalesTransition(status, toStatus));

  if (fromList.length === 0) {
    return {
      invalid: true,
      message: `Invalid status transition to ${toStatus}`,
    };
  }

  const sanitizedNote = sanitizeNote(note);
  const now = new Date();
  const sellerObjectId =
    sellerId && mongoose.isValidObjectId(sellerId)
      ? new mongoose.Types.ObjectId(sellerId)
      : null;

  const updated = await ReturnRequest.findOneAndUpdate(
    {
      _id: requestId,
      status: { $in: fromList },
      caseFlow: "after_sales",
    },
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
                  changedBy: sellerObjectId,
                  changedByRole: "seller",
                  changedBySeller: sellerObjectId,
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
    const current = await ReturnRequest.findById(requestId)
      .select("status caseFlow")
      .lean();
    if (!current) {
      return { notFound: true };
    }
    return {
      conflict: true,
      message: "Request status has changed. Refresh and try again.",
    };
  }

  return { request: updated };
}

/**
 * Seller may access a case if the linked order contains at least one of their products.
 *
 * Multi-seller orders: all participating sellers can view/act on the same order-level case.
 * This is an intentional limitation of freeze 1A (order-level cases)—not a bug.
 * Exclusive reviewer assignment is deferred; see AFTER_SALES_ARCHITECTURE_DECISIONS.md (ADD-001).
 * Concurrent writes use status-scoped optimistic updates (HTTP 409 on stale transition).
 */
async function assertSellerOwnsReturn(requestId, sellerId) {
  if (!mongoose.isValidObjectId(requestId) || !mongoose.isValidObjectId(sellerId)) {
    return { notFound: true };
  }

  const request = await ReturnRequest.findById(requestId).lean();
  if (!request) {
    return { notFound: true };
  }

  const productIds = await getSellerProductIds(sellerId);
  const productIdSet = new Set(productIds);
  if (productIdSet.size === 0) {
    return { forbidden: true, message: "This case does not contain your products" };
  }

  const order = await Order.findById(request.order).populate(ORDER_POPULATE).lean();
  if (!order) {
    return { notFound: true, message: "Linked order not found" };
  }

  if (!orderHasSellerProducts(order, productIdSet)) {
    return { forbidden: true, message: "This case does not contain your products" };
  }

  return { request, order, productIdSet };
}

/**
 * Paginated seller after-sales queue (recommended filters).
 */
async function listSellerReturnQueue({
  sellerId,
  page = 1,
  limit = 10,
  status: statusFilter,
} = {}) {
  if (!mongoose.isValidObjectId(sellerId)) {
    return {
      requests: [],
      pagination: { page: 1, limit: 10, totalCount: 0, totalPages: 0 },
    };
  }

  const productIds = await getSellerProductIds(sellerId);
  const productIdSet = new Set(productIds);
  if (productIdSet.size === 0) {
    return {
      requests: [],
      pagination: {
        page: Math.max(1, parseInt(page, 10) || 1),
        limit: Math.min(50, Math.max(1, parseInt(limit, 10) || 10)),
        totalCount: 0,
        totalPages: 0,
      },
    };
  }

  const productObjectIds = productIds.map((id) => new mongoose.Types.ObjectId(id));
  const ownedOrders = await Order.find({
    "items.product": { $in: productObjectIds },
  })
    .select("_id")
    .lean();
  const orderIds = ownedOrders.map((o) => o._id);

  if (orderIds.length === 0) {
    return {
      requests: [],
      pagination: {
        page: Math.max(1, parseInt(page, 10) || 1),
        limit: Math.min(50, Math.max(1, parseInt(limit, 10) || 10)),
        totalCount: 0,
        totalPages: 0,
      },
    };
  }

  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (safePage - 1) * safeLimit;

  const filter = {
    order: { $in: orderIds },
    caseFlow: "after_sales",
  };

  const mappedStatuses = resolveStatusFilter(statusFilter);
  if (mappedStatuses) {
    filter.status = { $in: mappedStatuses };
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

  const requestOrderIds = requests.map((r) => r.order).filter(Boolean);
  const orders = await Order.find({ _id: { $in: requestOrderIds } })
    .populate(ORDER_POPULATE)
    .lean();
  const orderMap = new Map(orders.map((o) => [String(o._id), o]));

  const items = requests.map((req) =>
    toSellerReturnRequestDTO(req, orderMap.get(String(req.order)) || null, productIdSet)
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

async function getSellerReturnDetail(requestId, sellerId) {
  const ownership = await assertSellerOwnsReturn(requestId, sellerId);
  if (ownership.notFound || ownership.forbidden) {
    return ownership;
  }

  return {
    request: toSellerReturnRequestDTO(
      ownership.request,
      ownership.order,
      ownership.productIdSet
    ),
  };
}

/**
 * Seller accept or reject at pending_review.
 * Accept requires returnRequired boolean; optional resolution for no-return path.
 */
async function reviewSellerDecision({
  requestId,
  sellerId,
  action,
  returnRequired,
  resolution,
  reasonCode,
  reasonNote,
  note,
}) {
  const normalizedAction = String(action || "")
    .trim()
    .toLowerCase();
  if (!["accept", "reject"].includes(normalizedAction)) {
    return { invalid: true, message: "Invalid action. Use accept or reject." };
  }

  const ownership = await assertSellerOwnsReturn(requestId, sellerId);
  if (ownership.notFound || ownership.forbidden) {
    return ownership;
  }

  const { request, order, productIdSet } = ownership;
  if (!canSellerReview(request.status, { caseFlow: request.caseFlow })) {
    return {
      notAllowed: true,
      message: "Seller review is only available for pending after-sales cases.",
    };
  }

  const sanitizedNote = sanitizeNote(note);
  const now = new Date();

  if (normalizedAction === "reject") {
    const reasonPayload = normalizeResolutionReasonPayload(
      "rejected",
      reasonCode,
      reasonNote
    );
    if (!reasonPayload.valid) {
      return { invalid: true, message: reasonPayload.message };
    }

    const transition = await executeSellerStatusTransition({
      requestId,
      sellerId,
      allowedFromStatuses: ["pending_review"],
      toStatus: "rejected",
      note,
      additionalSets: {
        returnReviewedAt: now,
        returnRequired:
          typeof request.returnRequired === "boolean" ? request.returnRequired : false,
        manualFollowUpRequired: false,
        ...(sanitizedNote ? { sellerNote: sanitizedNote } : {}),
      },
    });

    if (transition.notFound || transition.invalid || transition.conflict) {
      return transition;
    }

    await persistResolutionChange(
      requestId,
      sellerId,
      "rejected",
      sanitizedNote,
      reasonPayload.reasonCode,
      reasonPayload.reasonNote
    );
    await openAppealWindowOnResolution(requestId, now);

    const refreshed = await ReturnRequest.findById(requestId).lean();
    return {
      request: toSellerReturnRequestDTO(refreshed, order, productIdSet),
      decision: "reject",
    };
  }

  // accept
  const parsedReturnRequired = parseReturnRequired(returnRequired);
  if (parsedReturnRequired === null) {
    return {
      invalid: true,
      message: "returnRequired (true/false) is required when accepting a case.",
    };
  }

  let selectedResolution = null;
  let selectedReason = null;
  if (resolution != null && resolution !== "") {
    const reasonPayload = normalizeResolutionReasonPayload(
      resolution,
      reasonCode,
      reasonNote
    );
    if (!reasonPayload.valid) {
      return { invalid: true, message: reasonPayload.message };
    }
    selectedResolution = reasonPayload.resolution;
    selectedReason = reasonPayload;
    if (parsedReturnRequired === true) {
      return {
        invalid: true,
        message:
          "Final resolution cannot be set until the return is received when returnRequired is true.",
      };
    }
  }

  const withResolution = !!selectedResolution;
  const toStatus = resolveSellerAcceptTarget(parsedReturnRequired, { withResolution });
  if (!toStatus) {
    return { invalid: true, message: "Unable to determine accept target status." };
  }

  const additionalSets = {
    returnReviewedAt: now,
    returnRequired: parsedReturnRequired,
    manualFollowUpRequired: selectedResolution
      ? MANUAL_FOLLOW_UP_RESOLUTIONS.includes(selectedResolution)
      : false,
    ...(sanitizedNote ? { sellerNote: sanitizedNote } : {}),
  };

  const transition = await executeSellerStatusTransition({
    requestId,
    sellerId,
    allowedFromStatuses: ["pending_review"],
    toStatus,
    note,
    additionalSets,
  });

  if (transition.notFound || transition.invalid || transition.conflict) {
    return transition;
  }

  if (selectedResolution) {
    await persistResolutionChange(
      requestId,
      sellerId,
      selectedResolution,
      sanitizedNote,
      selectedReason.reasonCode,
      selectedReason.reasonNote
    );
    if (toStatus === "resolved" || toStatus === "rejected") {
      await openAppealWindowOnResolution(requestId, now);
    }
  }

  let refundOrchestration = null;
  if (selectedResolution === "refund") {
    refundOrchestration = await tryAfterSalesRefundOnResolution({
      requestId,
      resolution: selectedResolution,
    });
  }

  let logisticsResult = null;
  if (parsedReturnRequired === true && toStatus === "awaiting_pickup") {
    try {
      logisticsResult = await scheduleReturnPickup({
        requestId,
        sellerId,
        order,
        isRetry: false,
      });
    } catch (logisticsError) {
      console.error(
        "❌ Reverse pickup scheduling error after accept:",
        logisticsError.message
      );
      logisticsResult = {
        failed: true,
        message: logisticsError.message || "Pickup scheduling failed",
      };
    }
  }

  const refreshed = await ReturnRequest.findById(requestId).lean();
  return {
    request: toSellerReturnRequestDTO(refreshed, order, productIdSet),
    decision: "accept",
    refundOrchestration,
    logistics: logisticsResult
      ? {
          scheduled: !!logisticsResult.scheduled,
          failed: !!logisticsResult.failed,
          alreadyScheduled: !!logisticsResult.alreadyScheduled,
          message: logisticsResult.message || null,
          reverseLogistics:
            logisticsResult.reverseLogistics ||
            toReverseLogisticsDTO(refreshed?.reverseLogistics),
        }
      : null,
  };
}

/**
 * Confirm physical receipt → awaiting_inspection.
 */
async function confirmSellerReceipt({ requestId, sellerId, note }) {
  const ownership = await assertSellerOwnsReturn(requestId, sellerId);
  if (ownership.notFound || ownership.forbidden) {
    return ownership;
  }

  const { request, order, productIdSet } = ownership;
  if (!canConfirmReceipt(request.status, { caseFlow: request.caseFlow })) {
    return {
      notAllowed: true,
      message: "Receipt can only be confirmed while awaiting pickup or in transit.",
    };
  }

  const sanitizedNote = sanitizeNote(note);
  const now = new Date();
  const transition = await executeSellerStatusTransition({
    requestId,
    sellerId,
    allowedFromStatuses: ["awaiting_pickup", "in_transit"],
    toStatus: "awaiting_inspection",
    note,
    additionalSets: {
      receiptConfirmedAt: now,
      ...(sanitizedNote ? { sellerNote: sanitizedNote } : {}),
    },
  });

  if (transition.notFound || transition.invalid || transition.conflict) {
    return transition;
  }

  await restoreReturnedInventory(request.order);

  return {
    request: toSellerReturnRequestDTO(transition.request, order, productIdSet),
  };
}

async function restoreReturnedInventory(orderId) {
  if (!orderId) return;
  const orderDoc = await Order.findById(orderId);
  if (!orderDoc || typeof orderDoc.save !== "function") return;
  await restoreStockForReturnedOrder(orderDoc);
  await orderDoc.save();
}

/**
 * Select final Resolution (refund / replacement / repair / rejected).
 * Replacement creates an outbound order via the normal fulfilment engines.
 * Repair remains manual follow-up. Refund uses inherited wallet orchestration (policy HOLD for AAURIKAA).
 */
async function selectSellerResolution({
  requestId,
  sellerId,
  resolution,
  reasonCode,
  reasonNote,
  note,
}) {
  const ownership = await assertSellerOwnsReturn(requestId, sellerId);
  if (ownership.notFound || ownership.forbidden) {
    return ownership;
  }

  const { request, order, productIdSet } = ownership;
  if (!canSelectResolution(request.status, { caseFlow: request.caseFlow })) {
    return {
      notAllowed: true,
      message:
        "Resolution can be selected during pending review (no-return) or awaiting inspection.",
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
  const normalized = reasonPayload.resolution;

  // Physical-return path must not finalize from pending_review without accepting first
  if (request.status === "pending_review" && request.returnRequired === true) {
    return {
      notAllowed: true,
      message: "Accept the case and confirm receipt before selecting a final resolution.",
    };
  }

  const toStatus = resolveSellerResolutionTargetStatus(normalized);
  if (!toStatus) {
    return { invalid: true, message: "Unable to determine resolution target status." };
  }

  const sanitizedNote = sanitizeNote(note);
  const now = new Date();
  const additionalSets = {
    returnReviewedAt: request.returnReviewedAt || now,
    manualFollowUpRequired: MANUAL_FOLLOW_UP_RESOLUTIONS.includes(normalized),
    ...(sanitizedNote ? { sellerNote: sanitizedNote } : {}),
  };

  // If still pending_review with unset returnRequired, treat as no-return finalize
  if (request.status === "pending_review" && typeof request.returnRequired !== "boolean") {
    additionalSets.returnRequired = false;
  }

  const fromStatus = request.status;
  if (fromStatus === toStatus) {
    // Unusual; still allow resolution-only update
  } else if (!isAllowedAfterSalesTransition(fromStatus, toStatus)) {
    return {
      invalid: true,
      message: `Invalid status transition from ${fromStatus} to ${toStatus}`,
    };
  }

  const transition = await executeSellerStatusTransition({
    requestId,
    sellerId,
    allowedFromStatuses: [fromStatus],
    toStatus,
    note,
    additionalSets,
  });

  if (transition.notFound || transition.invalid || transition.conflict) {
    return transition;
  }

  await persistResolutionChange(
    requestId,
    sellerId,
    normalized,
    sanitizedNote,
    reasonPayload.reasonCode,
    reasonPayload.reasonNote
  );
  await openAppealWindowOnResolution(requestId, now);

  let refundOrchestration = null;
  if (normalized === "refund") {
    refundOrchestration = await tryAfterSalesRefundOnResolution({
      requestId,
      resolution: normalized,
    });
  }

  let replacementFulfillment = null;
  if (normalized === "replacement") {
    replacementFulfillment = await fulfillApprovedReplacement({ returnRequestId: requestId });
  }

  const refreshed = await ReturnRequest.findById(requestId).lean();
  return {
    request: toSellerReturnRequestDTO(refreshed, order, productIdSet),
    refundOrchestration,
    replacementFulfillment,
  };
}

async function persistResolutionChange(
  requestId,
  sellerId,
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
    changedBy: sellerId,
    changedByRole: "seller",
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
 * Retry failed reverse pickup scheduling for an owned after-sales case.
 */
async function retrySellerReturnPickup({ requestId, sellerId }) {
  const ownership = await assertSellerOwnsReturn(requestId, sellerId);
  if (ownership.notFound || ownership.forbidden) {
    return ownership;
  }

  const { request, order, productIdSet } = ownership;
  if (!canRetryReversePickup(request)) {
    return {
      notAllowed: true,
      message: "Pickup retry is not available for this case.",
    };
  }

  const logisticsResult = await retryReturnPickup({ requestId, sellerId });
  if (logisticsResult.notFound) return logisticsResult;
  if (logisticsResult.invalid) return logisticsResult;
  if (logisticsResult.notAllowed) return logisticsResult;
  if (logisticsResult.conflict) return logisticsResult;

  const refreshed = await ReturnRequest.findById(requestId).lean();
  return {
    request: toSellerReturnRequestDTO(refreshed, order, productIdSet),
    logistics: {
      scheduled: !!logisticsResult.scheduled,
      failed: !!logisticsResult.failed,
      alreadyScheduled: !!logisticsResult.alreadyScheduled,
      recovered: !!logisticsResult.recovered,
      message: logisticsResult.message || null,
      reverseLogistics:
        logisticsResult.reverseLogistics ||
        toReverseLogisticsDTO(refreshed?.reverseLogistics),
    },
  };
}

module.exports = {
  SELLER_QUEUE_STATUS_FILTERS,
  SELLER_QUEUE_FILTERS,
  listSellerReturnQueue,
  getSellerReturnDetail,
  reviewSellerDecision,
  confirmSellerReceipt,
  selectSellerResolution,
  retrySellerReturnPickup,
  toSellerReturnRequestDTO,
};
