// backend/utils/bulkUploadTypeConverter.js
const mongoose = require("mongoose");
const Category = require("../models/Category");
const Subcategory = require("../models/Subcategory");
const ChildCategory = require("../models/ChildCategory");
const Brand = require("../models/brand");
const { normalizeProductTagsForWrite } = require("./productTags");
const { normalizeFeaturesForWrite } = require("./keyFeatureNormalization");
const { parseSecondaryCategoriesInput } = require("./productCategoryValidation");
const { assignAssuranceFields } = require("./productAssuranceFields");
const { splitList, parseKeyFeaturesInput, parseFaqInput } = require("./productCatalogueContract");

/** Obsolete product shipping columns — ignored on import (not charge authority). */
const OBSOLETE_PRODUCT_SHIPPING_COLUMNS = [
  "shippingApplicability",
  "shippingVisibility",
  "shippingType",
  "shippingCharge",
];

/**
 * Convert string to number
 * @param {string|number} value - Value to convert
 * @param {number} defaultValue - Default value if conversion fails
 * @returns {number} - Converted number
 */
const convertToNumber = (value, defaultValue = 0) => {
  if (value === null || value === undefined || value === '') {
    return defaultValue;
  }
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return isNaN(num) ? defaultValue : num;
};

/**
 * Convert string to integer
 * @param {string|number} value - Value to convert
 * @param {number} defaultValue - Default value if conversion fails
 * @returns {number} - Converted integer
 */
const convertToInteger = (value, defaultValue = 0) => {
  if (value === null || value === undefined || value === '') {
    return defaultValue;
  }
  const num = typeof value === 'string' ? parseInt(value, 10) : value;
  return isNaN(num) ? defaultValue : num;
};

/**
 * Convert string to MongoDB ObjectId
 * @param {string} value - Value to convert
 * @returns {mongoose.Types.ObjectId|null} - Converted ObjectId or null
 */
const convertToObjectId = (value) => {
  if (!value || value === '' || value === 'null' || value === 'undefined') {
    return null;
  }
  if (value instanceof mongoose.Types.ObjectId) {
    return value;
  }
  if (mongoose.Types.ObjectId.isValid(value)) {
    return new mongoose.Types.ObjectId(value);
  }
  return null;
};

/**
 * Lookup ObjectId by name or slug from a model
 * @param {string} value - Name, slug, or ObjectId to lookup
 * @param {mongoose.Model} model - Mongoose model to search
 * @param {string} nameField - Field name for name lookup (default: 'name')
 * @param {string} slugField - Field name for slug lookup (default: 'slug')
 * @returns {Promise<mongoose.Types.ObjectId|null>} - Found ObjectId or null
 */
const lookupObjectIdByNameOrSlug = async (value, model, nameField = 'name', slugField = 'slug') => {
  if (!value || value === '' || value === 'null' || value === 'undefined') {
    return null;
  }

  // If already a valid ObjectId, return it
  if (value instanceof mongoose.Types.ObjectId) {
    return value;
  }
  if (mongoose.Types.ObjectId.isValid(value)) {
    return new mongoose.Types.ObjectId(value);
  }

  // Try to find by name (case-insensitive)
  const nameQuery = {};
  nameQuery[nameField] = { $regex: new RegExp(`^${value.trim()}$`, 'i') };
  let found = await model.findOne(nameQuery);
  if (found) {
    return found._id;
  }

  // Try to find by slug (case-insensitive) if slug field exists
  if (slugField && model.schema.paths[slugField]) {
    const slugQuery = {};
    slugQuery[slugField] = { $regex: new RegExp(`^${value.trim().toLowerCase()}$`, 'i') };
    found = await model.findOne(slugQuery);
    if (found) {
      return found._id;
    }
  }

  return null;
};

/**
 * Convert string to boolean
 * @param {string|boolean} value - Value to convert
 * @returns {boolean} - Converted boolean
 */
const convertToBoolean = (value) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    return lower === 'true' || lower === '1' || lower === 'yes' || lower === 'on';
  }
  return false;
};

/**
 * Parse JSON string to array or object
 * @param {string|Array|Object} value - Value to parse
 * @param {string} type - Expected type: 'array' or 'object'
 * @returns {Array|Object|null} - Parsed value or null
 */
const parseJson = (value, type = 'array') => {
  if (!value || value === '' || value === '[]' || value === '{}') {
    return type === 'array' ? [] : {};
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'object' && value !== null) {
    return value;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (type === 'array' && Array.isArray(parsed)) {
        return parsed;
      }
      if (type === 'object' && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
      return type === 'array' ? [] : {};
    } catch (error) {
      // If JSON parsing fails, try to parse as comma-separated string for arrays
      if (type === 'array') {
        return value.split(',').map(item => item.trim()).filter(Boolean);
      }
      return type === 'array' ? [] : {};
    }
  }
  return type === 'array' ? [] : {};
};

/**
 * Parse comma-separated string to array
 * @param {string|Array} value - Value to parse
 * @returns {Array} - Parsed array
 */
const parseCommaSeparated = (value) => {
  if (!value || value === '') {
    return [];
  }
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }
  if (typeof value === 'string') {
    if (value.includes(' | ') || value.includes('|')) {
      return splitList(value);
    }
    return value.split(',').map(item => item.trim()).filter(Boolean);
  }
  return [];
};

async function resolveSecondaryCategoryPath(path = {}) {
  const category = path.category
    ? await lookupObjectIdByNameOrSlug(path.category, Category, "name", "slug")
    : null;
  const subcategory = path.subcategory
    ? await lookupObjectIdByNameOrSlug(path.subcategory, Subcategory, "name", "slug")
    : null;
  const childCategory = path.childCategory
    ? await lookupObjectIdByNameOrSlug(path.childCategory, ChildCategory, "name", "slug")
    : null;
  return {
    category: category || path.category || null,
    subcategory: subcategory || undefined,
    childCategory: childCategory || undefined,
    unresolved: Boolean(path.category) && !category,
  };
}

async function resolveSecondaryCategoriesForImport(raw) {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const parsed = parseSecondaryCategoriesInput(raw);
  if (!parsed.length) return [];
  const resolved = [];
  for (const path of parsed) {
    resolved.push(await resolveSecondaryCategoryPath(path));
  }
  return resolved;
}

/**
 * ⚠️ IMPORTANT:
 * Bulk Upload does NOT support assigning products to arbitrary sellers.
 * Seller assignment here is intentionally restricted and hard-coded.
 *
 * Admin Product Add/Edit UI is the ONLY supported path for seller assignment.
 *
 * Do NOT modify this logic without redesigning CSV format,
 * payout attribution, and SKU governance.
 *
 * Convert a product row from CSV format to proper types
 * @param {Object} row - Product data row from CSV
 * @param {string} sellerId - Seller ID
 * @returns {Promise<Object>} - Converted product row with proper types
 */
const convertProductRow = async (row, sellerId) => {
  // Handle sellerId - can be ObjectId or string
  let sellerIdObj = null;
  if (sellerId) {
    if (sellerId instanceof mongoose.Types.ObjectId) {
      sellerIdObj = sellerId;
    } else if (mongoose.Types.ObjectId.isValid(sellerId)) {
      sellerIdObj = new mongoose.Types.ObjectId(sellerId);
    }
  }

  const converted = {
    ...row,
    seller: sellerIdObj,
    // Ensure ownership for delete/trash: same as uploader (admin or seller)
    ...(sellerIdObj && { ownerUserId: sellerIdObj }),

    // Convert numbers
    regularPrice: convertToNumber(row.regularPrice, 0),
    salePrice: row.salePrice ? convertToNumber(row.salePrice, 0) : undefined,
    stock: convertToInteger(row.stock, 0),
    length: row.length ? convertToNumber(row.length, 0) : undefined,
    width: row.width ? convertToNumber(row.width, 0) : undefined,
    height: row.height ? convertToNumber(row.height, 0) : undefined,
    weight: row.weight ? convertToNumber(row.weight, 0) : undefined,
    taxRate: row.taxRate ? convertToNumber(row.taxRate, 0) : undefined,

    // Convert ObjectIds (with name/slug lookup)
    category: await lookupObjectIdByNameOrSlug(row.category, Category, 'name', 'slug'),
    subcategory: row.subcategory ? await lookupObjectIdByNameOrSlug(row.subcategory, Subcategory, 'name', 'slug') : undefined,
    childCategory: row.childCategory ? await lookupObjectIdByNameOrSlug(row.childCategory, ChildCategory, 'name', 'slug') : undefined,
    brand: row.brand ? await lookupObjectIdByNameOrSlug(row.brand, Brand, 'name') : undefined,

    // Shipping Slab (WeightClass) — resolved/validated in bulkUploadValidator (P3 required)
    weightClass: row.weightClass,

    // Convert booleans
    isFeatured: convertToBoolean(row.isFeatured),
    taxIncluded: row.taxIncluded !== undefined ? convertToBoolean(row.taxIncluded) : undefined,

    // Convert arrays/objects
    variants: row.variants ? parseJson(row.variants, 'array') : undefined,
    features: row.features
      ? normalizeFeaturesForWrite(
          Array.isArray(row.features) ? row.features : parseKeyFeaturesInput(row.features)
        )
      : undefined,
    usageInstructions: row.usageInstructions ? parseJson(row.usageInstructions, 'array') : undefined,
    featuresContent: row.featuresContent || undefined,
    usageSafetyContent: row.usageSafetyContent || undefined,
    qandas: row.qandas
      ? (Array.isArray(row.qandas) ? row.qandas : parseFaqInput(row.qandas))
      : undefined,
    tags: row.tags ? normalizeProductTagsForWrite(parseCommaSeparated(row.tags)) : undefined,
    upsellSkus: row.upsellSkus ? parseCommaSeparated(row.upsellSkus) : undefined,
    crossSellSkus: row.crossSellSkus ? parseCommaSeparated(row.crossSellSkus) : undefined,
    boughtTogetherSkus: row.boughtTogetherSkus ? parseCommaSeparated(row.boughtTogetherSkus) : undefined,
    secondaryCategories: await resolveSecondaryCategoriesForImport(row.secondaryCategories),

    // Parse bulk discount if present
    bulkDiscount: row.bulkDiscount ? parseJson(row.bulkDiscount, 'object') : undefined,

    // v2 contract — variant Mixed maps (JSON columns)
    variantPricing: row.variantPricing ? parseJson(row.variantPricing, 'object') : undefined,
    variantStock: row.variantStock ? parseJson(row.variantStock, 'object') : undefined,
    variantSku: row.variantSku ? parseJson(row.variantSku, 'object') : undefined,
    variantMedia: row.variantMedia ? parseJson(row.variantMedia, 'object') : undefined,
    contractVersion: row.contractVersion ? String(row.contractVersion).trim() : undefined,

    // ✅ Map SEO Primary Keyword (handles flat column "seo.primaryKeyword" or nested "seo")
    seo: row.seo
      ? parseJson(row.seo, 'object')
      : (row['seo.primaryKeyword'] ? { primaryKeyword: row['seo.primaryKeyword'] } : undefined),

    // ✅ Media Fields (Direct string mapping)
    mainImage: row.mainImage || undefined,
    galleryImages: row.galleryImages ? parseCommaSeparated(row.galleryImages) : undefined,
    video: row.video || undefined,

    // Logistics timing only — obsolete shipping charge/applicability/type/visibility ignored
    deliveryTime: row.deliveryTime || undefined,
    returnPolicyMode: row.returnPolicyMode || undefined,
    returnAllowed:
      row.returnAllowed === undefined || row.returnAllowed === ""
        ? undefined
        : convertToBoolean(row.returnAllowed),
    returnWindowDays:
      row.returnWindowDays === undefined || row.returnWindowDays === ""
        ? undefined
        : convertToInteger(row.returnWindowDays),
    hsnCode: row.hsnCode || undefined,

    // ✅ Meta SEO Fields
    metaTitle: row.metaTitle || undefined,
    metaDescription: row.metaDescription || undefined,
    metaKeywords: row.metaKeywords || undefined,
  };

  assignAssuranceFields(converted, row);

  // Strip obsolete shipping columns so they never persist from import spreads
  OBSOLETE_PRODUCT_SHIPPING_COLUMNS.forEach((key) => {
    delete converted[key];
  });

  // Remove undefined values to keep the object clean
  Object.keys(converted).forEach(key => {
    if (converted[key] === undefined) {
      delete converted[key];
    }
  });

  return converted;
};

/**
 * Convert multiple product rows from CSV format to proper types
 * @param {Array<Object>} rows - Array of product data rows from CSV
 * @param {string} sellerId - Seller ID
 * @returns {Promise<Array<Object>>} - Array of converted product rows with proper types
 */
const convertProductRows = async (rows, sellerId) => {
  const convertedRows = [];
  for (const row of rows) {
    const converted = await convertProductRow(row, sellerId);
    convertedRows.push(converted);
  }
  return convertedRows;
};

module.exports = {
  convertToNumber,
  convertToInteger,
  convertToObjectId,
  convertToBoolean,
  parseJson,
  parseCommaSeparated,
  lookupObjectIdByNameOrSlug,
  convertProductRow,
  convertProductRows
};

