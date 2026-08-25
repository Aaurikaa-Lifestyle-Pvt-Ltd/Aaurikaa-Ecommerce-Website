const mongoose = require("mongoose");
const { resolvePublicUrl } = require("../utils/mediaUrlUtils");
const Category = require("../models/Category");
const Subcategory = require("../models/Subcategory");
const ChildCategory = require("../models/ChildCategory");

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

const VALID_SORT_FIELDS = new Set(["name", "sortOrder", "createdAt", "megaMenuOrder"]);

function parsePaginationQuery(query = {}) {
  const page = Math.max(DEFAULT_PAGE, parseInt(query.page, 10) || DEFAULT_PAGE);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(query.limit, 10) || DEFAULT_LIMIT)
  );
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function isValidObjectId(value) {
  return typeof value === "string" && mongoose.Types.ObjectId.isValid(value);
}

function normalizeId(ref) {
  if (ref == null) return null;
  if (typeof ref === "object" && ref._id != null) return String(ref._id);
  return String(ref);
}

function buildSort(query = {}) {
  const sortBy = VALID_SORT_FIELDS.has(query.sortBy) ? query.sortBy : "sortOrder";
  const sortDirection = query.sortOrder === "desc" ? -1 : 1;
  const sort = { [sortBy]: sortDirection };
  if (sortBy !== "name") {
    sort.name = 1;
  }
  return sort;
}

/**
 * Resolve root Category filter from hierarchy query (ObjectId filters).
 */
async function resolveCategoryFilter(query = {}) {
  const { categoryId, subcategoryId, childCategoryId, search } = query;
  const base = {};

  if (typeof search === "string" && search.trim()) {
    base.name = { $regex: search.trim(), $options: "i" };
  }

  if (isValidObjectId(childCategoryId)) {
    const child = await ChildCategory.findById(childCategoryId).select("subcategory").lean();
    if (!child) return { _id: { $in: [] }, ...base };
    const sub = await Subcategory.findById(child.subcategory).select("category").lean();
    if (!sub) return { _id: { $in: [] }, ...base };
    return { _id: sub.category, ...base };
  }

  if (isValidObjectId(subcategoryId)) {
    const sub = await Subcategory.findById(subcategoryId).select("category").lean();
    if (!sub) return { _id: { $in: [] }, ...base };
    return { _id: sub.category, ...base };
  }

  if (isValidObjectId(categoryId)) {
    return { _id: categoryId, ...base };
  }

  return { ...base };
}

function rowFromCategorySubChild(cat, sub, child) {
  // AAURIKAA Admin hierarchy DTO — taxonomy path + tax/media only (no marketplace fields).
  const row = {
    category: cat.name,
    categorySlug: cat.slug,
    categoryTax: cat.taxRate,
    categoryTaxType: cat.taxType || "GST",
    subcategory: sub ? sub.name : "—",
    subcategorySlug: sub ? sub.slug : undefined,
    subcategoryTax: sub ? sub.taxRate : undefined,
    subcategoryTaxType: sub ? sub.taxType || "GST" : undefined,
    child: child ? child.name : "—",
    childSlug: child ? child.slug : undefined,
    childTax: child ? child.taxRate : undefined,
    childTaxType: child ? child.taxType || "GST" : undefined,
    catId: cat._id,
    subId: sub ? sub._id : undefined,
    childId: child ? child._id : undefined,
    image: cat.image ? resolvePublicUrl(cat.image) || cat.image : cat.image,
    subImage: sub?.image ? resolvePublicUrl(sub.image) || sub.image : sub?.image,
    childImage: child?.image ? resolvePublicUrl(child.image) || child.image : child?.image,
    isActive: cat.isActive !== false,
  };
  return row;
}

/**
 * Server-side hierarchy row assembly (mirrors admin categories.js getGroupedData).
 */
function buildHierarchyRows(categories, subcategories, childCategories, filters = {}) {
  const { subcategoryId, childCategoryId } = filters;
  const result = [];

  for (const cat of categories) {
    let subForCat = subcategories.filter(
      (sub) => normalizeId(sub.category) === normalizeId(cat._id)
    );

    if (isValidObjectId(subcategoryId)) {
      subForCat = subForCat.filter(
        (sub) => normalizeId(sub._id) === normalizeId(subcategoryId)
      );
    }

    for (const sub of subForCat) {
      let childs = childCategories.filter(
        (child) => normalizeId(child.subcategory) === normalizeId(sub._id)
      );

      if (isValidObjectId(childCategoryId)) {
        childs = childs.filter(
          (child) => normalizeId(child._id) === normalizeId(childCategoryId)
        );
      }

      if (childs.length > 0) {
        for (const child of childs) {
          result.push(rowFromCategorySubChild(cat, sub, child));
        }
      } else if (!isValidObjectId(childCategoryId)) {
        result.push(rowFromCategorySubChild(cat, sub, null));
      }
    }

    if (
      subForCat.length === 0 &&
      !isValidObjectId(subcategoryId) &&
      !isValidObjectId(childCategoryId)
    ) {
      result.push(rowFromCategorySubChild(cat, null, null));
    }
  }

  return result;
}

async function listCategoryHierarchy(query = {}) {
  const categoryFilter = await resolveCategoryFilter(query);
  const { page, limit, skip } = parsePaginationQuery(query);
  const sort = buildSort(query);

  const filterIds = {
    subcategoryId: isValidObjectId(query.subcategoryId) ? query.subcategoryId : null,
    childCategoryId: isValidObjectId(query.childCategoryId) ? query.childCategoryId : null,
  };

  const [total, categories] = await Promise.all([
    Category.countDocuments(categoryFilter),
    Category.find(categoryFilter).sort(sort).skip(skip).limit(limit).lean(),
  ]);

  if (categories.length === 0) {
    return {
      rows: [],
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  const categoryIds = categories.map((c) => c._id);

  const subcategories = await Subcategory.find({ category: { $in: categoryIds } })
    .sort({ name: 1 })
    .lean();

  const subcategoryIds = subcategories.map((s) => s._id);
  const childCategories =
    subcategoryIds.length > 0
      ? await ChildCategory.find({ subcategory: { $in: subcategoryIds } })
          .sort({ name: 1 })
          .lean()
      : [];

  const rows = buildHierarchyRows(categories, subcategories, childCategories, filterIds);

  return {
    rows,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

module.exports = {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  parsePaginationQuery,
  buildSort,
  resolveCategoryFilter,
  normalizeId,
  buildHierarchyRows,
  listCategoryHierarchy,
  isValidObjectId,
};
