const mongoose = require("mongoose");
const Product = require("../models/Product");

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MIN_NAME_SEARCH_LENGTH = 2;

const VALID_SORT_FIELDS = new Set([
  "createdAt",
  "name",
  "sku",
  "regularPrice",
  "stock",
  "status",
  "updatedAt",
]);

const VALID_TABS = new Set(["all", "published", "draft", "trash"]);

const ADMIN_POPULATE = [
  { path: "category subcategory childCategory brand", select: "name" },
  { path: "seller", select: "firstName lastName shopName" },
  { path: "sellerShop", select: "firstName lastName shopName" },
  { path: "weightClass", select: "name minWeightG maxWeightG" },
];

const SELLER_POPULATE = [
  { path: "category subcategory childCategory brand", select: "name" },
  { path: "weightClass", select: "name minWeightG maxWeightG" },
];

/**
 * Seller-portal autosaved drafts excluded from admin listing.
 * Discriminator: seller autosaves set ownerUserId === seller.
 * AAURIKAA admin drafts pin internal Seller but ownerUserId is the admin user —
 * those must remain visible and counted in tabCounts.draft.
 */
const ADMIN_EXCLUDE_SELLER_AUTOSAVE = {
  $nor: [
    {
      status: "draft",
      seller: { $exists: true, $ne: null },
      $or: [
        { approvalStatus: { $exists: false } },
        { approvalStatus: null },
      ],
      $expr: { $eq: ["$ownerUserId", "$seller"] },
    },
  ],
};

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Token-prefix name match: term must prefix the first token (^) or a token after whitespace.
 * Avoids unrestricted contains (.*term.*) and MongoDB text search.
 */
function buildNameTokenPrefixPattern(term) {
  return `(^|\\s+)${escapeRegex(term)}`;
}

function isPaginatedMode(query = {}) {
  return query.page !== undefined || query.limit !== undefined;
}

function parsePaginationQuery(query = {}) {
  const page = Math.max(DEFAULT_PAGE, parseInt(query.page, 10) || DEFAULT_PAGE);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(query.limit, 10) || DEFAULT_LIMIT)
  );
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

/**
 * Commercial ownership for seller-facing product operations.
 * Single source of truth: Product.seller (not ownerUserId).
 * ownerUserId remains for draft/ACL creator tracking and must be synced on seller reassignment.
 */
function buildSellerOwnershipFilter(sellerId) {
  return { seller: sellerId };
}

function buildAdminBaseFilter() {
  return { ...ADMIN_EXCLUDE_SELLER_AUTOSAVE };
}

function buildSellerBaseFilter(sellerId) {
  return buildSellerOwnershipFilter(sellerId);
}

function applyTabFilter(filter, tab) {
  if (!tab || tab === "all") {
    filter.status = { $ne: "trash" };
    return;
  }
  if (VALID_TABS.has(tab)) {
    filter.status = tab;
  }
}

function applyStatusFilter(filter, status) {
  if (!status || status === "all") return;
  filter.status = status;
}

function applyApprovalStatusFilter(filter, approvalStatus) {
  if (!approvalStatus || approvalStatus === "all") return;
  filter.approvalStatus = approvalStatus;
}

function applyObjectIdFilter(filter, field, value) {
  if (!value) return;
  if (!mongoose.isValidObjectId(value)) return;
  filter[field] = value;
}

/**
 * Approved search: name token-prefix (min 2 chars), SKU exact + prefix fallback,
 * ObjectId filters for brand/category/subcategory/childCategory/seller.
 */
function applySearchAndFilters(filter, query, { isAdmin } = {}) {
  const and = [];

  const nameTerm = (query.search || query.name || "").trim();
  if (nameTerm.length >= MIN_NAME_SEARCH_LENGTH) {
    and.push({
      name: {
        $regex: buildNameTokenPrefixPattern(nameTerm),
        $options: "i",
      },
    });
  }

  const skuTerm = (query.sku || "").trim();
  if (skuTerm) {
    and.push({
      $or: [
        { sku: skuTerm },
        { sku: { $regex: `^${escapeRegex(skuTerm)}`, $options: "i" } },
      ],
    });
  }

  applyObjectIdFilter(filter, "brand", query.brand);
  applyObjectIdFilter(filter, "category", query.category);
  applyObjectIdFilter(filter, "subcategory", query.subcategory);
  applyObjectIdFilter(filter, "childCategory", query.childCategory);

  if (isAdmin) {
    applyObjectIdFilter(filter, "seller", query.seller);
  }

  applyStatusFilter(filter, query.status);
  applyApprovalStatusFilter(filter, query.approvalStatus);

  const tab = query.tab;
  if (tab && VALID_TABS.has(tab)) {
    applyTabFilter(filter, tab);
  }

  if (and.length > 0) {
    filter.$and = [...(filter.$and || []), ...and];
  }

  return filter;
}

function buildSort(query = {}) {
  const sortBy = VALID_SORT_FIELDS.has(query.sortBy) ? query.sortBy : "createdAt";
  const sortDirection = query.sortOrder === "asc" ? 1 : -1;
  return { [sortBy]: sortDirection };
}

async function computeTabCounts(baseFilter) {
  const [all, published, draft, trash] = await Promise.all([
    Product.countDocuments({ ...baseFilter, status: { $ne: "trash" } }),
    Product.countDocuments({ ...baseFilter, status: "published" }),
    Product.countDocuments({ ...baseFilter, status: "draft" }),
    Product.countDocuments({ ...baseFilter, status: "trash" }),
  ]);

  return { all, published, draft, trash };
}

async function listProducts({
  baseFilter,
  query,
  populate,
  isAdmin = false,
}) {
  const listFilter = applySearchAndFilters(
    { ...baseFilter },
    query,
    { isAdmin }
  );
  const { page, limit, skip } = parsePaginationQuery(query);
  const sort = buildSort(query);

  const [products, total, tabCounts] = await Promise.all([
    Product.find(listFilter)
      .populate(populate)
      .sort(sort)
      .skip(skip)
      .limit(limit),
    Product.countDocuments(listFilter),
    computeTabCounts(baseFilter),
  ]);

  return {
    products,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
    tabCounts,
  };
}

async function listAllProductsLegacy({ baseFilter, populate, sort = { createdAt: -1 } }) {
  return Product.find(baseFilter).populate(populate).sort(sort);
}

module.exports = {
  ADMIN_POPULATE,
  SELLER_POPULATE,
  MIN_NAME_SEARCH_LENGTH,
  MAX_LIMIT,
  buildNameTokenPrefixPattern,
  buildAdminBaseFilter,
  buildSellerBaseFilter,
  isPaginatedMode,
  parsePaginationQuery,
  applySearchAndFilters,
  buildSort,
  computeTabCounts,
  listProducts,
  listAllProductsLegacy,
};
