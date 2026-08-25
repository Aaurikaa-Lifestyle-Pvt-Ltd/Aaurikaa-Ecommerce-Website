/**
 * Lightweight after-sales summary for order listings (shopper/seller/admin).
 * No schema changes — built from existing ReturnRequest documents.
 */

function toAfterSalesListingSummary(returnRequest) {
  if (!returnRequest) return null;

  const plain =
    returnRequest && typeof returnRequest.toObject === "function"
      ? returnRequest.toObject()
      : returnRequest;

  const status = plain.status || null;
  if (!status) return null;

  return {
    returnRequestId: plain._id ? String(plain._id) : null,
    status,
    resolution: plain.resolution || null,
    replacementOrderId: plain.replacementOrder ? String(plain.replacementOrder) : null,
    slaReminderSentAt: plain.slaReminderSentAt
      ? plain.slaReminderSentAt instanceof Date
        ? plain.slaReminderSentAt.toISOString()
        : new Date(plain.slaReminderSentAt).toISOString()
      : null,
    slaEscalatedAt: plain.slaEscalatedAt
      ? plain.slaEscalatedAt instanceof Date
        ? plain.slaEscalatedAt.toISOString()
        : new Date(plain.slaEscalatedAt).toISOString()
      : null,
  };
}

/**
 * Batch-load the newest ReturnRequest per order (createdAt desc).
 * @param {Array<import('mongoose').Types.ObjectId|string>} orderIds
 * @param {typeof import('../models/ReturnRequest')} ReturnRequest
 * @returns {Promise<Map<string, object>>}
 */
async function loadAfterSalesSummaryMapByOrderIds(orderIds, ReturnRequest) {
  const map = new Map();
  const ids = (orderIds || []).filter(Boolean);
  if (ids.length === 0) return map;

  const rows = await ReturnRequest.find({ order: { $in: ids } })
    .select("order status resolution replacementOrder createdAt _id slaReminderSentAt slaEscalatedAt")
    .sort({ createdAt: -1 })
    .lean();

  for (const row of rows) {
    const key = String(row.order);
    if (!map.has(key)) {
      map.set(key, toAfterSalesListingSummary(row));
    }
  }

  return map;
}

module.exports = {
  toAfterSalesListingSummary,
  loadAfterSalesSummaryMapByOrderIds,
};
