/**
 * Storefront global search orchestrator.
 * Framework-independent: accepts plain objects, returns plain objects.
 * HTTP status mapping belongs in controllers/routes.
 */

const mongoose = require("mongoose");

const Product = require("../../models/Product");
const Category = require("../../models/Category");
const Subcategory = require("../../models/Subcategory");
const { applyTranslations } = require("../../utils/applyTranslations");
const {
  normalizeSearchTerm,
  isSuggestionTermValid,
} = require("./searchUtils");
const { resolveMatchingEntities } = require("./searchEntityResolver");
const { appendSearchFilter } = require("./productSearchQueryBuilder");
const { applyMerchandisingCollectionFilter } = require("../../utils/productLabels");
const { isMarketplaceSurfaceEnabled } = require("../../config/aaurikaaFoundation");

/** Default limit for legacy flat product suggestions (`GET /api/products/search`). */
const DEFAULT_SUGGESTION_LIMIT = 10;

/** Default per-section limit for grouped suggestions (`GET /api/search/suggestions`). */
const GROUPED_SUGGESTION_SECTION_LIMIT = 5;

const PRODUCT_LIST_SELECT = "-vendorCost -internalNotes";
const PRODUCT_LIST_POPULATE = [
  { path: "category", select: "name slug" },
  { path: "subcategory", select: "name slug" },
  { path: "childCategory", select: "name slug" },
  { path: "brand", select: "name" },
  { path: "seller", select: "shopName firstName lastName" },
  { path: "sellerShop", select: "shopName firstName lastName" },
];

/**
 * Build the base filter for publicly visible, approved products.
 *
 * @returns {{ status: string, approvalStatus: string }}
 */
function buildPublishedProductFilter() {
  return { status: "published", approvalStatus: "approved" };
}

/**
 * Map a storefront `sortBy` query value to a MongoDB sort object.
 *
 * @param {string} [sortBy] - One of `newest`, `price-low`, `price-high`, `rating`, `name`, `sales`.
 * @returns {object} MongoDB sort specification.
 */
function buildProductSort(sortBy) {
  switch (sortBy) {
    case "price-low":
      return { salePrice: 1, regularPrice: 1 };
    case "price-high":
      return { salePrice: -1, regularPrice: -1 };
    case "rating":
      return { avgRating: -1 };
    case "name":
      return { name: 1 };
    case "sales":
      return { salesCount: -1, createdAt: -1 };
    case "newest":
    default:
      return { createdAt: -1 };
  }
}

/**
 * Resolve pagination values from query params, preserving existing storefront limits.
 *
 * @param {object} [query={}] - Request query params (`page`, `limit`, `featured`, `sortBy`).
 * @param {{ paginationMode?: string }} [options={}] - `paginationMode: 'taxonomy'` uses taxonomy defaults.
 * @returns {{ page: number, limit: number, skip: number }}
 */
function resolvePagination(query = {}, options = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const isFeaturedQuery = query.featured === "true" || query.featured === true;
  const isSalesQuery = query.sortBy === "sales";

  let limit;
  if (options.paginationMode === "taxonomy") {
    limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 24));
  } else if (isFeaturedQuery) {
    limit = Math.min(20, Math.max(1, parseInt(query.limit, 10) || 10));
  } else if (isSalesQuery) {
    limit = Math.min(20, Math.max(1, parseInt(query.limit, 10) || 12));
  } else {
    limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 24));
  }

  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

/**
 * Listing availability: parent stock or any variantStock quantity.
 * Order/cart already use variant-level stock; listing previously used parent stock only.
 *
 * @returns {object} Mongo clause
 */
function buildInStockListingClause() {
  return {
    $or: [
      { stock: { $gt: 0 } },
      {
        $expr: {
          $gt: [
            {
              $size: {
                $filter: {
                  input: { $objectToArray: { $ifNull: ["$variantStock", {}] } },
                  as: "entry",
                  cond: { $gt: ["$$entry.v", 0] },
                },
              },
            },
            0,
          ],
        },
      },
    ],
  };
}

/**
 * Merge non-`q` storefront filters onto a product filter (AND semantics).
 *
 * @param {object} filter - Mutable MongoDB filter.
 * @param {object} [query={}] - Filter query params (`tag`, `brand`, `category`, `subcategory`, `childCategory`, price, rating, stock, featured, label).
 * @returns {object} The same `filter` reference with constraints applied.
 */
function mergeStorefrontProductFilters(filter, query = {}) {
  const {
    tag,
    brand,
    category,
    subcategory,
    childCategory,
    minPrice,
    maxPrice,
    rating,
    inStock,
    featured,
  } = query;

  applyMerchandisingCollectionFilter(filter, query);

  if (featured === "true" || featured === true) {
    filter.isFeatured = true;
  }
  if (tag) {
    filter.tags = { $regex: tag, $options: "i" };
  }
  if (brand && mongoose.isValidObjectId(brand)) {
    filter.brand = brand;
  }
  if (category && mongoose.isValidObjectId(category)) {
    filter.category = category;
  }
  if (subcategory && mongoose.isValidObjectId(subcategory)) {
    filter.subcategory = subcategory;
  }
  if (childCategory && mongoose.isValidObjectId(childCategory)) {
    filter.childCategory = childCategory;
  }
  if (minPrice != null && minPrice !== "" && !isNaN(Number(minPrice))) {
    filter.$and = filter.$and || [];
    filter.$and.push({
      $expr: { $gte: [{ $ifNull: ["$salePrice", "$regularPrice"] }, Number(minPrice)] },
    });
  }
  if (maxPrice != null && maxPrice !== "" && !isNaN(Number(maxPrice))) {
    filter.$and = filter.$and || [];
    filter.$and.push({
      $expr: { $lte: [{ $ifNull: ["$salePrice", "$regularPrice"] }, Number(maxPrice)] },
    });
  }
  if (rating != null && rating !== "" && Number(rating) > 0) {
    filter.avgRating = { $gte: Number(rating) };
  }
  if (inStock === "true" || inStock === true) {
    filter.$and = filter.$and || [];
    filter.$and.push(buildInStockListingClause());
  }

  return filter;
}

/**
 * Apply taxonomy browse scope (category / subcategory / child category) to a filter.
 *
 * @param {object} filter - Mutable MongoDB filter.
 * @param {{ category?: *, subcategory?: *, childCategory?: * }} [taxonomyScope={}]
 * @returns {object} The same `filter` reference with taxonomy scope applied.
 */
function applyTaxonomyScope(filter, taxonomyScope = {}) {
  if (!taxonomyScope) return filter;
  const { category, subcategory, childCategory } = taxonomyScope;
  if (childCategory) {
    delete filter.category;
    delete filter.subcategory;
    filter.childCategory = childCategory;
  } else if (subcategory) {
    delete filter.category;
    delete filter.childCategory;
    filter.subcategory = subcategory;
  } else if (category) {
    delete filter.subcategory;
    delete filter.childCategory;
    filter.category = category;
  }
  return filter;
}

/**
 * Resolve matching entities and append the search `q` clause to a product filter.
 *
 * @param {object} filter - Mutable MongoDB filter.
 * @param {string|null|undefined} rawQuery - Raw `q` search term.
 * @returns {Promise<{ filter: object, resolvedEntities: object|null }>}
 */
async function applySearchQueryToFilter(filter, rawQuery) {
  const normalized = normalizeSearchTerm(rawQuery);
  if (!normalized) return { filter, resolvedEntities: null };

  const resolvedEntities = await resolveMatchingEntities(normalized.escaped);
  appendSearchFilter(filter, normalized.escaped, resolvedEntities);
  return { filter, resolvedEntities };
}

/**
 * Apply locale translations to product list fields when needed.
 *
 * @param {object|object[]} products - Product document(s).
 * @param {string} [locale] - Locale code; skipped when absent or `en`.
 * @returns {Promise<object|object[]>}
 */
async function translateProducts(products, locale) {
  if (!locale || locale === "en") return products;
  return applyTranslations(products, "Product", locale, ["name", "shortDesc", "longDesc"]);
}

/**
 * Apply locale translations to product name fields only (suggestions).
 *
 * @param {object|object[]} products - Product document(s).
 * @param {string} [locale] - Locale code; skipped when absent or `en`.
 * @returns {Promise<object|object[]>}
 */
async function translateProductNames(products, locale) {
  if (!locale || locale === "en") return products;
  return applyTranslations(products, "Product", locale, ["name"]);
}

/**
 * Execute a paginated product list query with populate and count.
 *
 * @param {object} filter - Final MongoDB product filter.
 * @param {{ sort: object, skip: number, limit: number }} paging
 * @returns {Promise<[object[], number]>} Tuple of `[products, totalCount]`.
 */
function castFilter(obj) {
  if (!obj || typeof obj !== "object") return obj;

  if (obj instanceof RegExp) {
    return obj;
  }

  if (obj instanceof Date) {
    return obj;
  }

  if (obj._bsontype === "ObjectID" || (obj.constructor && obj.constructor.name === "ObjectId")) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => castFilter(item));
  }

  const cloned = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === "string" && mongoose.isValidObjectId(val) && val.length === 24) {
      cloned[key] = new mongoose.Types.ObjectId(val);
    } else {
      cloned[key] = castFilter(val);
    }
  }
  return cloned;
}

async function runProductListQuery(filter, { sort, skip, limit }) {
  const isPriceSort = sort && (sort.salePrice !== undefined);

  if (isPriceSort) {
    const sortDir = sort.salePrice; // 1 or -1
    const matchedFilter = castFilter(filter);
    const docs = await Product.aggregate([
      { $match: matchedFilter },
      {
        $addFields: {
          effectivePrice: {
            $cond: {
              if: {
                $and: [
                  { $gt: ["$salePrice", 0] },
                  { $gt: ["$regularPrice", "$salePrice"] }
                ]
              },
              then: "$salePrice",
              else: { $ifNull: ["$regularPrice", 0] }
            }
          }
        }
      },
      { $sort: { effectivePrice: sortDir, _id: 1 } },
      { $skip: skip },
      { $limit: limit },
      { $project: { vendorCost: 0, internalNotes: 0 } }
    ]);

    await Product.populate(docs, PRODUCT_LIST_POPULATE);

    return [docs, await Product.countDocuments(filter)];
  }

  let query = Product.find(filter)
    .select(PRODUCT_LIST_SELECT)
    .sort(sort)
    .skip(skip)
    .limit(limit);

  PRODUCT_LIST_POPULATE.forEach((populateSpec) => {
    query = query.populate(populateSpec.path, populateSpec.select);
  });

  return Promise.all([query.lean(), Product.countDocuments(filter)]);
}

/**
 * Search published products with optional `q`, filters, sort, and pagination.
 *
 * @param {object} [query={}] - Plain query params (`q`, `tag`, `brand`, `category`, price, rating, stock, featured, sortBy, page, limit, locale).
 * @param {{ taxonomyScope?: object, paginationMode?: string }} [options={}]
 * @returns {Promise<{ products: object[], totalCount: number, totalPages: number, currentPage: number }>}
 */
async function searchProducts(query = {}, options = {}) {
  const filter = buildPublishedProductFilter();
  // Query filters first; taxonomyScope re-applied last so PLP browse scope stays authoritative.
  mergeStorefrontProductFilters(filter, query);
  applyTaxonomyScope(filter, options.taxonomyScope);
  await applySearchQueryToFilter(filter, query.q);

  const { page, limit, skip } = resolvePagination(query, options);
  const sort = buildProductSort(query.sortBy);
  const [productsRaw, totalCount] = await runProductListQuery(filter, { sort, skip, limit });
  const products = await translateProducts(productsRaw, query.locale);

  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const currentPage = Math.min(page, totalPages);

  return {
    products,
    totalCount,
    totalPages,
    currentPage,
  };
}

/**
 * Aggregate effective price bounds for catalogue / PLP range UI.
 * Uses the same published + taxonomy + storefront filters as {@link searchProducts},
 * excluding minPrice/maxPrice themselves so the slider can show the full range.
 *
 * @param {object} [query={}] - Same filter params as searchProducts (`q`, brand, category, etc.).
 * @param {{ taxonomyScope?: object }} [options={}]
 * @returns {Promise<{ minPrice: number|null, maxPrice: number|null }>}
 */
async function getCataloguePriceBounds(query = {}, options = {}) {
  const filter = buildPublishedProductFilter();
  const queryWithoutPrice = { ...query };
  delete queryWithoutPrice.minPrice;
  delete queryWithoutPrice.maxPrice;

  mergeStorefrontProductFilters(filter, queryWithoutPrice);
  applyTaxonomyScope(filter, options.taxonomyScope);
  await applySearchQueryToFilter(filter, query.q);

  const matchedFilter = castFilter(filter);
  const rows = await Product.aggregate([
    { $match: matchedFilter },
    {
      $group: {
        _id: null,
        minPrice: { $min: { $ifNull: ["$salePrice", "$regularPrice"] } },
        maxPrice: { $max: { $ifNull: ["$salePrice", "$regularPrice"] } },
      },
    },
  ]);

  if (!rows.length) {
    return { minPrice: null, maxPrice: null };
  }

  const minPrice = rows[0].minPrice;
  const maxPrice = rows[0].maxPrice;
  return {
    minPrice: minPrice == null || Number.isNaN(Number(minPrice)) ? null : Number(minPrice),
    maxPrice: maxPrice == null || Number.isNaN(Number(maxPrice)) ? null : Number(maxPrice),
  };
}

/**
 * Return a flat list of product suggestions for legacy autocomplete consumers.
 *
 * @param {string|null|undefined} rawQuery - Raw search term.
 * @param {{ limit?: number, locale?: string }} [options={}]
 * @returns {Promise<object[]>} Products with `_id`, `name`, `slug` (empty array when term is empty).
 */
async function getProductSuggestions(rawQuery, options = {}) {
  const normalized = normalizeSearchTerm(rawQuery);
  if (!normalized) return [];

  const limit = Math.min(20, Math.max(1, parseInt(options.limit, 10) || DEFAULT_SUGGESTION_LIMIT));
  const filter = buildPublishedProductFilter();
  await applySearchQueryToFilter(filter, normalized.trimmed);

  let products = await Product.find(filter)
    .select("_id name slug")
    .limit(limit)
    .lean();

  products = await translateProductNames(products, options.locale);
  return products;
}

/**
 * Attach parent category / subcategory references to taxonomy suggestion entities.
 * Returns entity data only — navigation URLs are built by the frontend.
 *
 * @param {object} resolvedEntities - Output from {@link resolveMatchingEntities}.
 * @returns {Promise<{ categories: object[], subcategories: object[], childCategories: object[] }>}
 */
async function enrichTaxonomyParentRefs(resolvedEntities) {
  const categoryById = new Map(
    (resolvedEntities.categories || []).map((item) => [String(item._id), item])
  );

  const missingCategoryIds = new Set();
  (resolvedEntities.subcategories || []).forEach((sub) => {
    const parentId = String(sub.category);
    if (!categoryById.has(parentId)) missingCategoryIds.add(parentId);
  });

  if (missingCategoryIds.size > 0) {
    const parents = await Category.find({ _id: { $in: Array.from(missingCategoryIds) } })
      .select("_id name slug")
      .lean();
    parents.forEach((parent) => categoryById.set(String(parent._id), parent));
  }

  const subcategoryById = new Map(
    (resolvedEntities.subcategories || []).map((item) => [String(item._id), item])
  );
  const missingSubcategoryIds = new Set();
  (resolvedEntities.childCategories || []).forEach((child) => {
    const parentId = String(child.subcategory);
    if (!subcategoryById.has(parentId)) missingSubcategoryIds.add(parentId);
  });

  if (missingSubcategoryIds.size > 0) {
    const parents = await Subcategory.find({ _id: { $in: Array.from(missingSubcategoryIds) } })
      .select("_id name slug category")
      .lean();
    parents.forEach((parent) => subcategoryById.set(String(parent._id), parent));
    parents.forEach((parent) => {
      const parentCategoryId = String(parent.category);
      if (!categoryById.has(parentCategoryId)) missingCategoryIds.add(parentCategoryId);
    });
  }

  if (missingCategoryIds.size > 0) {
    const parents = await Category.find({ _id: { $in: Array.from(missingCategoryIds) } })
      .select("_id name slug")
      .lean();
    parents.forEach((parent) => categoryById.set(String(parent._id), parent));
  }

  const categories = (resolvedEntities.categories || []).map((item) => ({
    _id: item._id,
    name: item.name,
    slug: item.slug,
  }));

  const subcategories = (resolvedEntities.subcategories || []).map((item) => {
    const parent = categoryById.get(String(item.category));
    return {
      _id: item._id,
      name: item.name,
      slug: item.slug,
      category: parent ? { _id: parent._id, name: parent.name, slug: parent.slug } : null,
    };
  });

  const childCategories = (resolvedEntities.childCategories || []).map((item) => {
    const parentSub = subcategoryById.get(String(item.subcategory));
    const parentCat = parentSub ? categoryById.get(String(parentSub.category)) : null;
    return {
      _id: item._id,
      name: item.name,
      slug: item.slug,
      subcategory: parentSub
        ? { _id: parentSub._id, name: parentSub.name, slug: parentSub.slug }
        : null,
      category: parentCat ? { _id: parentCat._id, name: parentCat.name, slug: parentCat.slug } : null,
    };
  });

  return { categories, subcategories, childCategories };
}

/**
 * Return grouped suggestion sections for the storefront autocomplete API.
 *
 * @param {string|null|undefined} rawQuery - Raw search term (min 2 chars; validate in controller via {@link isSuggestionTermValid}).
 * @param {{ limit?: number, locale?: string }} [options={}]
 * @returns {Promise<{
 *   products: object[],
 *   categories: object[],
 *   subcategories: object[],
 *   childCategories: object[],
 *   brands: object[],
 *   sellers: object[],
 *   tags: object[],
 * }|null>} Grouped entity data with slug fields for frontend routing, or `null` when term is too short.
 *
 * @note Controllers map a `null` return to HTTP 400. This service does not set HTTP status codes.
 */
async function getGroupedSuggestions(rawQuery, options = {}) {
  if (!isSuggestionTermValid(rawQuery)) {
    return null;
  }

  const normalized = normalizeSearchTerm(rawQuery);
  const sectionLimit = Math.min(
    20,
    Math.max(1, parseInt(options.limit, 10) || GROUPED_SUGGESTION_SECTION_LIMIT)
  );

  const resolvedEntities = await resolveMatchingEntities(normalized.escaped, {
    limit: sectionLimit,
  });

  const filter = buildPublishedProductFilter();
  appendSearchFilter(filter, normalized.escaped, resolvedEntities);

  let products = await Product.find(filter)
    .select("_id name slug")
    .limit(sectionLimit)
    .lean();
  products = await translateProductNames(products, options.locale);

  const taxonomySuggestions = await enrichTaxonomyParentRefs(resolvedEntities);

  const brands = (resolvedEntities.brands || []).slice(0, sectionLimit).map((item) => ({
    _id: item._id,
    name: item.name,
  }));

  // AAURIKAA single-store: hide marketplace seller suggestions unless surfaces are opted in.
  const sellers = isMarketplaceSurfaceEnabled()
    ? (resolvedEntities.sellers || []).slice(0, sectionLimit).map((item) => ({
        _id: item._id,
        shopName: item.shopName,
        firstName: item.firstName,
        lastName: item.lastName,
        shopUrl: item.shopUrl,
      }))
    : [];

  const tags = (resolvedEntities.tags || []).slice(0, sectionLimit).map((tag) => ({
    name: tag,
  }));

  return {
    products: products.map((item) => ({
      _id: item._id,
      name: item.name,
      slug: item.slug,
    })),
    categories: taxonomySuggestions.categories.slice(0, sectionLimit),
    subcategories: taxonomySuggestions.subcategories.slice(0, sectionLimit),
    childCategories: taxonomySuggestions.childCategories.slice(0, sectionLimit),
    brands,
    sellers,
    tags,
  };
}

module.exports = {
  DEFAULT_SUGGESTION_LIMIT,
  GROUPED_SUGGESTION_SECTION_LIMIT,
  buildPublishedProductFilter,
  buildProductSort,
  resolvePagination,
  mergeStorefrontProductFilters,
  buildInStockListingClause,
  applyTaxonomyScope,
  applySearchQueryToFilter,
  searchProducts,
  getCataloguePriceBounds,
  getProductSuggestions,
  getGroupedSuggestions,
};
