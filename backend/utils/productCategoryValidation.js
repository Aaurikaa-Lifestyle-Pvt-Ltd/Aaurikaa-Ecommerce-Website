const mongoose = require("mongoose");
const Category = require("../models/Category");
const Subcategory = require("../models/Subcategory");
const ChildCategory = require("../models/ChildCategory");

const PRIMARY_IMMUTABLE_MESSAGE =
  "Primary category path cannot be changed by sellers.";
const SECONDARY_DUPLICATE_MESSAGE =
  "Secondary category paths must be unique.";
const SECONDARY_SAME_AS_PRIMARY_MESSAGE =
  "Secondary category paths must differ from the primary category path.";
const INVALID_CATEGORY_MESSAGE =
  "Invalid category. The selected category does not exist.";
const INVALID_SUBCATEGORY_MESSAGE =
  "Invalid subcategory for the selected category.";
const INVALID_CHILD_CATEGORY_MESSAGE =
  "Invalid child category for the selected subcategory.";
const CHILD_WITHOUT_SUBCATEGORY_MESSAGE =
  "Child category requires a subcategory.";

/**
 * Normalize an id-like value (ObjectId, populated doc, string) to a hex string or null.
 */
function toIdString(value) {
  if (value == null || value === "" || value === "null" || value === "undefined") {
    return null;
  }

  if (value instanceof mongoose.Types.ObjectId) {
    return String(value);
  }

  if (typeof value === "object") {
    // Populated docs only — never recurse into ObjectId-like self references
    if (value._id != null && value._id !== value) {
      return toIdString(value._id);
    }
    if (typeof value.toString === "function") {
      const asString = value.toString();
      if (
        mongoose.Types.ObjectId.isValid(asString) &&
        String(new mongoose.Types.ObjectId(asString)) === asString
      ) {
        return asString;
      }
    }
    return null;
  }

  const str = String(value).trim();
  if (!str || str === "null" || str === "undefined") return null;
  if (!mongoose.Types.ObjectId.isValid(str)) return null;
  if (String(new mongoose.Types.ObjectId(str)) !== str) return null;
  return str;
}

function normalizeCategoryPath(path = {}) {
  return {
    category: toIdString(path.category),
    subcategory: toIdString(path.subcategory),
    childCategory: toIdString(path.childCategory),
  };
}

function categoryPathKey(path) {
  const normalized = normalizeCategoryPath(path);
  return [
    normalized.category || "",
    normalized.subcategory || "",
    normalized.childCategory || "",
  ].join("|");
}

function pathsEqual(a, b) {
  return categoryPathKey(a) === categoryPathKey(b);
}

/**
 * Parse secondaryCategories from multipart JSON string, array, or multer-normalized value.
 * @returns {Array<object>}
 */
function parseSecondaryCategoriesInput(raw) {
  if (raw === undefined || raw === null || raw === "") return [];

  let value = raw;
  if (Array.isArray(raw)) {
    if (raw.length === 0) return [];
    // Multer may wrap a JSON string as a single-element array
    const nonEmpty = raw.filter((v) => v !== "" && v != null);
    if (nonEmpty.length === 0) return [];
    const last = nonEmpty[nonEmpty.length - 1];
    if (typeof last === "string") {
      value = last;
    } else if (Array.isArray(last)) {
      return last;
    } else if (typeof last === "object") {
      // Array of path objects already
      const looksLikePaths = nonEmpty.every(
        (item) => item && typeof item === "object" && !Array.isArray(item) && ("category" in item || "subcategory" in item)
      );
      if (looksLikePaths) return nonEmpty;
      value = last;
    } else {
      return [];
    }
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "[]") return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  if (Array.isArray(value)) return value;
  return [];
}

/**
 * Throws if seller attempts to change an already-established primary path field.
 * Omitted fields are allowed (preserve). Unset existing fields may still be established.
 * Clearing or replacing a non-empty persisted value is rejected.
 */
function assertSellerPrimaryImmutable(existingProduct, incomingBody = {}) {
  if (!existingProduct) return;

  const fields = ["category", "subcategory", "childCategory"];
  for (const field of fields) {
    if (!(field in incomingBody)) continue;
    const existingId = toIdString(existingProduct[field]);
    // Not yet established — seller may set this field (e.g. first category on a draft)
    if (!existingId) continue;

    const incomingRaw = incomingBody[field];
    const incomingId =
      incomingRaw === "" || incomingRaw === null || incomingRaw === undefined
        ? null
        : toIdString(incomingRaw);

    if (incomingId !== existingId) {
      throw new Error(PRIMARY_IMMUTABLE_MESSAGE);
    }
  }
}

/**
 * Validate a single taxonomy path against Category / Subcategory / ChildCategory relations.
 * Paths with no category are treated as empty (skipped by callers).
 * @returns {Promise<{ category: string|null, subcategory: string|null, childCategory: string|null }>}
 */
async function assertValidTaxonomyPath(path, label = "Category path") {
  const normalized = normalizeCategoryPath(path);

  if (!normalized.category) {
    if (normalized.subcategory || normalized.childCategory) {
      throw new Error(`${label}: category is required when subcategory or child category is set.`);
    }
    return { category: null, subcategory: null, childCategory: null };
  }

  const category = await Category.findById(normalized.category).select("_id").lean();
  if (!category) {
    throw new Error(`${label}: ${INVALID_CATEGORY_MESSAGE}`);
  }

  if (normalized.childCategory && !normalized.subcategory) {
    throw new Error(`${label}: ${CHILD_WITHOUT_SUBCATEGORY_MESSAGE}`);
  }

  if (normalized.subcategory) {
    const subcategory = await Subcategory.findById(normalized.subcategory)
      .select("_id category")
      .lean();
    if (!subcategory || toIdString(subcategory.category) !== normalized.category) {
      throw new Error(`${label}: ${INVALID_SUBCATEGORY_MESSAGE}`);
    }
  }

  if (normalized.childCategory) {
    const child = await ChildCategory.findById(normalized.childCategory)
      .select("_id subcategory")
      .lean();
    if (!child || toIdString(child.subcategory) !== normalized.subcategory) {
      throw new Error(`${label}: ${INVALID_CHILD_CATEGORY_MESSAGE}`);
    }
  }

  return normalized;
}

/**
 * Validate primary path when a category id is present (create / admin update).
 */
async function assertValidPrimaryPath(productLike = {}) {
  const hasAny =
    productLike.category ||
    productLike.subcategory ||
    productLike.childCategory;
  if (!hasAny) return normalizeCategoryPath({});
  return assertValidTaxonomyPath(
    {
      category: productLike.category,
      subcategory: productLike.subcategory,
      childCategory: productLike.childCategory,
    },
    "Primary category path"
  );
}

/**
 * Parse, validate taxonomy integrity, reject duplicates and paths matching primary.
 * @returns {Promise<Array<{ category: string, subcategory: string|null, childCategory: string|null }>>}
 */
async function normalizeAndValidateSecondaryCategories(raw, primaryPath = {}) {
  const parsed = parseSecondaryCategoriesInput(raw);
  const primary = normalizeCategoryPath(primaryPath);
  const primaryKey = categoryPathKey(primary);

  const normalizedList = [];
  const seen = new Set();

  for (let i = 0; i < parsed.length; i += 1) {
    const label = `Secondary category path #${i + 1}`;
    const normalized = await assertValidTaxonomyPath(parsed[i], label);
    if (!normalized.category) continue;

    const key = categoryPathKey(normalized);
    if (primary.category && key === primaryKey) {
      throw new Error(SECONDARY_SAME_AS_PRIMARY_MESSAGE);
    }
    if (seen.has(key)) {
      throw new Error(SECONDARY_DUPLICATE_MESSAGE);
    }
    seen.add(key);
    normalizedList.push(normalized);
  }

  return normalizedList;
}

/**
 * Resolve effective primary path from incoming body with optional existing product fallback.
 */
function resolveEffectivePrimaryPath(body = {}, existingProduct = null) {
  const pick = (field) => {
    if (body && Object.prototype.hasOwnProperty.call(body, field)) {
      return body[field];
    }
    return existingProduct ? existingProduct[field] : undefined;
  };
  return normalizeCategoryPath({
    category: pick("category"),
    subcategory: pick("subcategory"),
    childCategory: pick("childCategory"),
  });
}

module.exports = {
  PRIMARY_IMMUTABLE_MESSAGE,
  SECONDARY_DUPLICATE_MESSAGE,
  SECONDARY_SAME_AS_PRIMARY_MESSAGE,
  INVALID_CATEGORY_MESSAGE,
  INVALID_SUBCATEGORY_MESSAGE,
  INVALID_CHILD_CATEGORY_MESSAGE,
  CHILD_WITHOUT_SUBCATEGORY_MESSAGE,
  toIdString,
  normalizeCategoryPath,
  categoryPathKey,
  pathsEqual,
  parseSecondaryCategoriesInput,
  assertSellerPrimaryImmutable,
  assertValidTaxonomyPath,
  assertValidPrimaryPath,
  normalizeAndValidateSecondaryCategories,
  resolveEffectivePrimaryPath,
};
