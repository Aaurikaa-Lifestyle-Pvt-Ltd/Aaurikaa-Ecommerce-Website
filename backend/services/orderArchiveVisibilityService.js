const ARCHIVE_RETENTION_MONTHS = 13;

const ARCHIVABLE_STATUSES = new Set(["delivered", "completed", "cancelled"]);

function normalizePlain(order) {
  return order && typeof order.toObject === "function" ? order.toObject() : order || {};
}

function normalizeStatus(status) {
  if (!status) return "";
  return String(status).trim().toLowerCase();
}

function resolveOrderCreatedAt(order) {
  const plain = normalizePlain(order);
  if (!plain.createdAt) return null;
  const createdAt = plain.createdAt instanceof Date ? plain.createdAt : new Date(plain.createdAt);
  return Number.isNaN(createdAt.getTime()) ? null : createdAt;
}

/**
 * Cutoff date: orders at or before this timestamp are archived when terminal status applies.
 */
function getArchiveCutoffDate(referenceDate = new Date()) {
  const cutoff = new Date(referenceDate);
  cutoff.setMonth(cutoff.getMonth() - ARCHIVE_RETENTION_MONTHS);
  return cutoff;
}

/**
 * Soft-archive visibility for shopper history (stored order state only).
 */
function isArchivedForShopper(order, referenceDate = new Date()) {
  const plain = normalizePlain(order);
  const status = normalizeStatus(plain.status);

  if (!ARCHIVABLE_STATUSES.has(status)) {
    return false;
  }

  const createdAt = resolveOrderCreatedAt(plain);
  if (!createdAt) {
    return false;
  }

  return createdAt <= getArchiveCutoffDate(referenceDate);
}

/**
 * MongoDB filter fragment — exclude archived orders from shopper-visible listings.
 */
function getShopperArchiveFilter(referenceDate = new Date()) {
  const cutoff = getArchiveCutoffDate(referenceDate);

  return {
    $or: [
      { status: { $nin: Array.from(ARCHIVABLE_STATUSES) } },
      { createdAt: { $gt: cutoff } },
    ],
  };
}

function buildShopperVisibleOrderFilter(buyerId, referenceDate = new Date()) {
  return {
    buyer: buyerId,
    ...getShopperArchiveFilter(referenceDate),
  };
}

module.exports = {
  ARCHIVE_RETENTION_MONTHS,
  ARCHIVABLE_STATUSES,
  getArchiveCutoffDate,
  isArchivedForShopper,
  getShopperArchiveFilter,
  buildShopperVisibleOrderFilter,
};
