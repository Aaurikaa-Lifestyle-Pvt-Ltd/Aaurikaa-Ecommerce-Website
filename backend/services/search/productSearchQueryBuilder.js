/**
 * Constructs MongoDB product filter fragments for global search `q` matching.
 * Does not execute queries, paginate, sort, populate, or translate.
 */

const { buildContainsRegex } = require("./searchUtils");

/**
 * @param {Array<*>} values
 * @returns {boolean}
 */
function hasValues(values) {
  return Array.isArray(values) && values.length > 0;
}

/**
 * Build `$or` clauses for direct product text-field matches.
 *
 * @param {string} escapedTerm - Pre-escaped search term.
 * @returns {object[]} MongoDB filter clauses for name, descriptions, and SKU.
 */
function buildDirectFieldMatches(escapedTerm) {
  const regex = buildContainsRegex(escapedTerm);
  return [
    { name: regex },
    { shortDesc: regex },
    { longDesc: regex },
    { sku: regex },
  ];
}

/**
 * Build `$or` clauses from resolved entity ID sets.
 *
 * @param {object} [resolvedEntities={}] - Output from {@link resolveMatchingEntities}.
 * @param {import('mongoose').Types.ObjectId[]} [resolvedEntities.categoryIds]
 * @param {import('mongoose').Types.ObjectId[]} [resolvedEntities.subcategoryIds]
 * @param {import('mongoose').Types.ObjectId[]} [resolvedEntities.childCategoryIds]
 * @param {import('mongoose').Types.ObjectId[]} [resolvedEntities.brandIds]
 * @param {import('mongoose').Types.ObjectId[]} [resolvedEntities.sellerIds]
 * @returns {object[]} MongoDB filter clauses keyed by product relation fields.
 */
function buildEntityIdMatches(resolvedEntities = {}) {
  const clauses = [];
  const {
    categoryIds,
    subcategoryIds,
    childCategoryIds,
    brandIds,
    sellerIds,
  } = resolvedEntities;

  if (hasValues(categoryIds)) {
    clauses.push({ category: { $in: categoryIds } });
  }
  if (hasValues(subcategoryIds)) {
    clauses.push({ subcategory: { $in: subcategoryIds } });
  }
  if (hasValues(childCategoryIds)) {
    clauses.push({ childCategory: { $in: childCategoryIds } });
  }
  if (hasValues(brandIds)) {
    clauses.push({ brand: { $in: brandIds } });
  }
  if (hasValues(sellerIds)) {
    clauses.push({
      $or: [{ seller: { $in: sellerIds } }, { sellerShop: { $in: sellerIds } }],
    });
  }

  return clauses;
}

/**
 * Build the full `$or` array combining direct field, entity ID, and tag matches.
 *
 * @param {string} escapedTerm - Pre-escaped search term.
 * @param {object} [resolvedEntities={}] - Output from {@link resolveMatchingEntities}.
 * @returns {object[]} Combined `$or` clauses (any match returns the product).
 */
function buildSearchOrClause(escapedTerm, resolvedEntities = {}) {
  const orClauses = [
    ...buildDirectFieldMatches(escapedTerm),
    ...buildEntityIdMatches(resolvedEntities),
  ];

  const tagRegex = buildContainsRegex(escapedTerm);
  orClauses.push({ tags: tagRegex });

  return orClauses;
}

/**
 * Build a standalone search filter clause (`{ $or: [...] }`) without mutating input.
 *
 * @param {string} escapedTerm - Pre-escaped search term.
 * @param {object} [resolvedEntities={}] - Output from {@link resolveMatchingEntities}.
 * @returns {{ $or: object[] }|null} Search clause to AND-merge, or `null` when empty.
 */
function buildSearchFilterClause(escapedTerm, resolvedEntities = {}) {
  const orClauses = buildSearchOrClause(escapedTerm, resolvedEntities);
  if (orClauses.length === 0) return null;
  return { $or: orClauses };
}

/**
 * Append the search `$or` clause onto an existing product filter via `$and`.
 *
 * @param {object} filter - Mutable MongoDB filter (typically published-product base).
 * @param {string} escapedTerm - Pre-escaped search term.
 * @param {object} [resolvedEntities={}] - Output from {@link resolveMatchingEntities}.
 * @returns {object} The same `filter` reference with search constraints applied.
 */
function appendSearchFilter(filter, escapedTerm, resolvedEntities = {}) {
  const clause = buildSearchFilterClause(escapedTerm, resolvedEntities);
  if (!clause) return filter;

  filter.$and = filter.$and || [];
  filter.$and.push(clause);
  return filter;
}

module.exports = {
  buildDirectFieldMatches,
  buildEntityIdMatches,
  buildSearchOrClause,
  buildSearchFilterClause,
  appendSearchFilter,
};
