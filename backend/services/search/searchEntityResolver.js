/**
 * Resolves storefront taxonomy, brand, seller, and tag entities that match a search term.
 * Returns entity documents and ID sets only — no URLs, routing, or product queries.
 */

const Category = require("../../models/Category");
const Subcategory = require("../../models/Subcategory");
const ChildCategory = require("../../models/ChildCategory");
const Brand = require("../../models/brand");
const Seller = require("../../models/Seller");
const Product = require("../../models/Product");
const { buildContainsRegex } = require("./searchUtils");

/** Default maximum number of matches returned per entity type. */
const ENTITY_RESOLUTION_LIMIT = 20;

const ENTITY_SELECT = {
  category: "_id name slug",
  subcategory: "_id name slug category",
  childCategory: "_id name slug subcategory",
  brand: "_id name",
  seller: "_id shopName firstName lastName shopUrl",
};

/**
 * @param {Array<{ _id: import('mongoose').Types.ObjectId }>} items
 * @returns {import('mongoose').Types.ObjectId[]}
 */
function mapIds(items) {
  return items.map((item) => item._id);
}

/**
 * Find published-product tag strings that contain the search term (case-insensitive).
 *
 * @param {string} escapedTerm - Pre-escaped search term.
 * @param {number} [limit=ENTITY_RESOLUTION_LIMIT] - Maximum tags to return.
 * @returns {Promise<string[]>} Matching tag strings.
 *
 * @todo Optimize for very large catalogs: replace full `distinct` + in-memory
 *   filter with a targeted aggregation or text index when tag volume grows.
 */
async function resolveMatchingTags(escapedTerm, limit = ENTITY_RESOLUTION_LIMIT) {
  // TODO: Product.distinct('tags') loads all distinct tags per request; consider
  // caching or a dedicated tags collection if catalog scale increases significantly.
  const distinctTags = await Product.distinct("tags", {
    status: "published",
    approvalStatus: "approved",
  });
  const pattern = new RegExp(escapedTerm, "i");
  return distinctTags
    .filter((tag) => tag && pattern.test(String(tag)))
    .slice(0, limit);
}

/**
 * Resolve all searchable entity types matching `escapedTerm` in parallel.
 *
 * @param {string} escapedTerm - Pre-escaped search term (call {@link escapeRegex} first).
 * @param {{ limit?: number }} [options={}] - Optional per-type result cap.
 * @returns {Promise<{
 *   categories: object[],
 *   subcategories: object[],
 *   childCategories: object[],
 *   brands: object[],
 *   sellers: object[],
 *   tags: string[],
 *   categoryIds: import('mongoose').Types.ObjectId[],
 *   subcategoryIds: import('mongoose').Types.ObjectId[],
 *   childCategoryIds: import('mongoose').Types.ObjectId[],
 *   brandIds: import('mongoose').Types.ObjectId[],
 *   sellerIds: import('mongoose').Types.ObjectId[],
 * }>} Entity documents and derived ID arrays for query building.
 *
 * @note Does not generate navigation paths or frontend URLs.
 * Indexes: Category/Brand `{ isActive, name }`, Seller `{ isApproved, shopName }`,
 * Subcategory/ChildCategory `{ name }`, Product `{ status, approvalStatus, tags }`.
 */
async function resolveMatchingEntities(escapedTerm, options = {}) {
  const limit = options.limit || ENTITY_RESOLUTION_LIMIT;
  const nameRegex = buildContainsRegex(escapedTerm);

  const [categories, subcategories, childCategories, brands, sellers, tags] =
    await Promise.all([
      Category.find({ isActive: true, name: nameRegex })
        .select(ENTITY_SELECT.category)
        .limit(limit)
        .lean(),
      Subcategory.find({ name: nameRegex })
        .select(ENTITY_SELECT.subcategory)
        .limit(limit)
        .lean(),
      ChildCategory.find({ name: nameRegex })
        .select(ENTITY_SELECT.childCategory)
        .limit(limit)
        .lean(),
      Brand.find({ isActive: true, name: nameRegex })
        .select(ENTITY_SELECT.brand)
        .limit(limit)
        .lean(),
      Seller.find({
        isApproved: true,
        $or: [
          { shopName: nameRegex },
          { firstName: nameRegex },
          { lastName: nameRegex },
        ],
      })
        .select(ENTITY_SELECT.seller)
        .limit(limit)
        .lean(),
      resolveMatchingTags(escapedTerm, limit),
    ]);

  return {
    categories,
    subcategories,
    childCategories,
    brands,
    sellers,
    tags,
    categoryIds: mapIds(categories),
    subcategoryIds: mapIds(subcategories),
    childCategoryIds: mapIds(childCategories),
    brandIds: mapIds(brands),
    sellerIds: mapIds(sellers),
  };
}

module.exports = {
  ENTITY_RESOLUTION_LIMIT,
  resolveMatchingEntities,
  resolveMatchingTags,
};
