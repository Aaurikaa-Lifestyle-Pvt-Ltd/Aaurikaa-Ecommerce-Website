const Order = require("../models/Order");

const SUCCESSFUL_STATUSES = ["delivered", "completed"];

const CONFIRMATION_STATUSES = new Set([
  "CALL_PENDING",
  "CONFIRMED",
  "REJECTED",
  "UNABLE_TO_REACH",
]);

const NOTES_MAX_LENGTH = 1000;

function normalizePlain(order) {
  return order && typeof order.toObject === "function" ? order.toObject() : order || {};
}

function normalizeStatus(status) {
  if (!status) return "";
  return String(status).trim().toLowerCase();
}

function resolveBuyerId(order) {
  const plain = normalizePlain(order);
  const buyer = plain.buyer;
  if (!buyer) return null;
  if (typeof buyer === "object" && buyer._id) return String(buyer._id);
  return String(buyer);
}

function resolveOrderCreatedAt(order) {
  const plain = normalizePlain(order);
  if (!plain.createdAt) return null;
  const createdAt = plain.createdAt instanceof Date ? plain.createdAt : new Date(plain.createdAt);
  return Number.isNaN(createdAt.getTime()) ? null : createdAt;
}

function isOrderCancelled(order) {
  return normalizeStatus(normalizePlain(order).status) === "cancelled";
}

function isOrderRejected(order) {
  return normalizePlain(order).manualConfirmationStatus === "REJECTED";
}

function countSuccessfulBefore(createdAt, successfulTimestamps) {
  if (!createdAt) return 0;
  const threshold = createdAt.getTime();
  return successfulTimestamps.filter((timestamp) => timestamp < threshold).length;
}

async function loadSuccessfulTimestampsByBuyer(buyerIds) {
  const uniqueIds = [...new Set(buyerIds.filter(Boolean))];
  const map = new Map(uniqueIds.map((id) => [id, []]));

  if (uniqueIds.length === 0) {
    return map;
  }

  const successes = await Order.find({
    buyer: { $in: uniqueIds },
    status: { $in: SUCCESSFUL_STATUSES },
  })
    .select("buyer createdAt")
    .lean();

  for (const row of successes) {
    const buyerId = String(row.buyer);
    if (!map.has(buyerId)) {
      map.set(buyerId, []);
    }
    map.get(buyerId).push(new Date(row.createdAt).getTime());
  }

  for (const timestamps of map.values()) {
    timestamps.sort((a, b) => a - b);
  }

  return map;
}

/**
 * Count delivered/completed orders for a shopper (cancelled/rejected excluded from success set).
 */
async function getSuccessfulOrderCount(shopperId, { beforeDate, excludeOrderId } = {}) {
  if (!shopperId) return 0;

  const filter = {
    buyer: shopperId,
    status: { $in: SUCCESSFUL_STATUSES },
  };

  if (beforeDate) {
    filter.createdAt = { $lt: beforeDate };
  }

  if (excludeOrderId) {
    filter._id = { $ne: excludeOrderId };
  }

  return Order.countDocuments(filter);
}

function evaluateEligibility(order, shopperId, successfulTimestamps, referenceDate = new Date()) {
  const plain = normalizePlain(order);
  const buyerId = resolveBuyerId(plain);

  if (!shopperId || !buyerId || buyerId !== String(shopperId)) {
    return false;
  }

  if (isOrderCancelled(plain)) {
    return false;
  }

  if (isOrderRejected(plain)) {
    return false;
  }

  const createdAt = resolveOrderCreatedAt(plain);
  const priorSuccessful = countSuccessfulBefore(createdAt, successfulTimestamps);
  return priorSuccessful < 3;
}

/**
 * Authoritative manual-confirmation eligibility (stored order state only).
 */
async function isManualConfirmationEligible(order, shopperId, referenceDate = new Date()) {
  const buyerId = resolveBuyerId(order);
  if (!buyerId) return false;

  const timestamps = await loadSuccessfulTimestampsByBuyer([buyerId]);
  return evaluateEligibility(order, shopperId, timestamps.get(buyerId) || [], referenceDate);
}

function getManualConfirmationStatus(order, { eligible } = {}) {
  const plain = normalizePlain(order);
  const storedStatus = plain.manualConfirmationStatus;

  if (storedStatus) {
    return {
      status: storedStatus,
      eligible: !!eligible,
    };
  }

  if (eligible) {
    return {
      status: "CALL_PENDING",
      eligible: true,
    };
  }

  return {
    status: null,
    eligible: false,
  };
}

function toShopperManualConfirmationDTO(order, { eligible }) {
  const visibility = getManualConfirmationStatus(order, { eligible });

  if (!visibility.status && !visibility.eligible) {
    return { eligible: false, status: null };
  }

  return {
    eligible: visibility.eligible,
    status: visibility.status,
  };
}

async function buildManualConfirmationMap(orders, shopperId, referenceDate = new Date()) {
  const buyerId = shopperId ? String(shopperId) : null;
  const timestampsByBuyer = await loadSuccessfulTimestampsByBuyer([buyerId]);
  const successfulTimestamps = timestampsByBuyer.get(buyerId) || [];

  const map = new Map();
  for (const order of orders || []) {
    const id = normalizePlain(order)._id ? String(normalizePlain(order)._id) : null;
    if (!id) continue;

    const eligible = evaluateEligibility(order, buyerId, successfulTimestamps, referenceDate);
    map.set(id, toShopperManualConfirmationDTO(order, { eligible }));
  }

  return map;
}

async function buildManualConfirmationMapForOrders(orders, referenceDate = new Date()) {
  const buyerIds = (orders || []).map((order) => resolveBuyerId(order)).filter(Boolean);
  const timestampsByBuyer = await loadSuccessfulTimestampsByBuyer(buyerIds);
  const map = new Map();

  for (const order of orders || []) {
    const plain = normalizePlain(order);
    const id = plain._id ? String(plain._id) : null;
    if (!id) continue;

    const buyerId = resolveBuyerId(plain);
    const timestamps = timestampsByBuyer.get(buyerId) || [];
    const eligible = evaluateEligibility(plain, buyerId, timestamps, referenceDate);
    map.set(id, getManualConfirmationStatus(plain, { eligible }));
  }

  return map;
}

function sanitizeNotes(notes) {
  if (notes === null || notes === undefined) return null;
  const sanitized = String(notes)
    .replace(/[\x00-\x1F\x7F]/g, "")
    .trim();
  if (!sanitized) return null;
  return sanitized.slice(0, NOTES_MAX_LENGTH);
}

function validateConfirmationStatus(status) {
  const normalized = String(status || "")
    .trim()
    .toUpperCase();
  if (!CONFIRMATION_STATUSES.has(normalized)) {
    return { valid: false, message: "Invalid manual confirmation status." };
  }
  return { valid: true, status: normalized };
}

function isCohortMember(order, successfulTimestamps, referenceDate = new Date()) {
  if (isOrderCancelled(order) || isOrderRejected(order)) {
    return false;
  }

  const createdAt = resolveOrderCreatedAt(order);
  return countSuccessfulBefore(createdAt, successfulTimestamps) < 3;
}

function matchesStatusFilter(order, statusFilter) {
  if (!statusFilter) return true;

  const stored = order.manualConfirmationStatus;
  if (statusFilter === "CALL_PENDING") {
    return !stored || stored === "CALL_PENDING";
  }

  return stored === statusFilter;
}

async function listManualConfirmationQueue({
  page = 1,
  limit = 10,
  status: statusFilter,
  referenceDate = new Date(),
}) {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (safePage - 1) * safeLimit;

  const candidates = await Order.find({
    status: { $ne: "cancelled" },
    manualConfirmationStatus: { $ne: "REJECTED" },
  })
    .populate("buyer", "firstName lastName email phone")
    .populate({
      path: "items.product",
      select: "seller",
      populate: { path: "seller", select: "shopName firstName lastName" },
    })
    .sort({ createdAt: -1 })
    .lean();

  const buyerIds = candidates.map((order) => resolveBuyerId(order)).filter(Boolean);
  const timestampsByBuyer = await loadSuccessfulTimestampsByBuyer(buyerIds);

  const cohort = [];

  for (const order of candidates) {
    const buyerId = resolveBuyerId(order);
    const timestamps = timestampsByBuyer.get(buyerId) || [];

    if (!isCohortMember(order, timestamps, referenceDate)) {
      continue;
    }

    if (!matchesStatusFilter(order, statusFilter)) {
      continue;
    }

    const eligible = evaluateEligibility(order, buyerId, timestamps, referenceDate);
    cohort.push({
      ...order,
      manualConfirmationEligible: eligible,
      manualConfirmation: getManualConfirmationStatus(order, { eligible }),
    });
  }

  const totalCount = cohort.length;
  const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / safeLimit);
  const orders = cohort.slice(skip, skip + safeLimit);

  return {
    orders,
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount,
      totalPages,
    },
  };
}

async function updateManualConfirmationStatus({
  orderId,
  adminId,
  status,
  notes,
  referenceDate = new Date(),
}) {
  const validation = validateConfirmationStatus(status);
  if (!validation.valid) {
    return { invalid: true, message: validation.message };
  }

  const order = await Order.findById(orderId);
  if (!order) {
    return { notFound: true };
  }

  const buyerId = resolveBuyerId(order);
  const timestampsByBuyer = await loadSuccessfulTimestampsByBuyer([buyerId]);
  const timestamps = timestampsByBuyer.get(buyerId) || [];

  const inCohort = isCohortMember(order, timestamps, referenceDate);
  if (!inCohort && !order.manualConfirmationStatus) {
    return {
      notAllowed: true,
      message: "Order is not in manual confirmation scope.",
    };
  }

  const eligible = evaluateEligibility(order, buyerId, timestamps, referenceDate);
  const sanitizedNotes = sanitizeNotes(notes);

  order.manualConfirmationStatus = validation.status;
  order.manualConfirmationEligible = eligible;
  order.manualConfirmationAt = new Date();
  order.manualConfirmationBy = adminId;
  order.manualConfirmationNotes = sanitizedNotes;
  order.updatedAt = new Date();

  await order.save();

  return {
    order,
    manualConfirmation: getManualConfirmationStatus(order, { eligible }),
  };
}

module.exports = {
  CONFIRMATION_STATUSES,
  SUCCESSFUL_STATUSES,
  getSuccessfulOrderCount,
  isManualConfirmationEligible,
  getManualConfirmationStatus,
  toShopperManualConfirmationDTO,
  buildManualConfirmationMap,
  buildManualConfirmationMapForOrders,
  listManualConfirmationQueue,
  updateManualConfirmationStatus,
  validateConfirmationStatus,
  evaluateEligibility,
  isCohortMember,
};
