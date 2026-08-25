const Brand = require("../models/brand");

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MIN_NAME_SEARCH_LENGTH = 1;

const VALID_SORT_FIELDS = new Set(["createdAt", "name", "sortOrder", "updatedAt"]);

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function resolveIncludeInactive(query = {}) {
  return (
    query.includeInactive === "1" ||
    query.includeInactive === "true" ||
    query.includeInactive === 1 ||
    query.includeInactive === true
  );
}

function buildBaseFilter(query = {}) {
  const includeInactive = resolveIncludeInactive(query);
  if (includeInactive) {
    return {};
  }
  return { isActive: true };
}

function applySearchFilter(filter, query = {}) {
  const term = (query.search || "").trim();
  if (term.length < MIN_NAME_SEARCH_LENGTH) {
    return;
  }
  filter.name = { $regex: `^${escapeRegex(term)}`, $options: "i" };
}

function applyActiveFilter(filter, query = {}) {
  const status = (query.status || query.active || "").trim().toLowerCase();
  if (status === "active" || status === "true" || status === "1") {
    filter.isActive = true;
  } else if (
    status === "inactive" ||
    status === "false" ||
    status === "0" ||
    status === "hidden"
  ) {
    filter.isActive = false;
  }
}

function buildSort(query = {}) {
  const sortBy = VALID_SORT_FIELDS.has(query.sortBy) ? query.sortBy : "createdAt";
  const sortDirection = query.sortOrder === "asc" ? 1 : -1;
  return { [sortBy]: sortDirection };
}

function buildListFilter(query = {}) {
  const filter = buildBaseFilter(query);
  applyActiveFilter(filter, query);
  applySearchFilter(filter, query);
  return filter;
}

async function listBrands(query = {}) {
  const filter = buildListFilter(query);
  const { page, limit, skip } = parsePaginationQuery(query);
  const sort = buildSort(query);

  const [brands, total] = await Promise.all([
    Brand.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Brand.countDocuments(filter),
  ]);

  return {
    brands,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

async function listAllBrandsLegacy(query = {}) {
  const filter = buildBaseFilter(query);
  applyActiveFilter(filter, query);
  applySearchFilter(filter, query);
  const sort = buildSort(query);
  return Brand.find(filter).sort(sort).lean();
}

module.exports = {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MIN_NAME_SEARCH_LENGTH,
  isPaginatedMode,
  parsePaginationQuery,
  buildListFilter,
  buildSort,
  resolveIncludeInactive,
  listBrands,
  listAllBrandsLegacy,
};
