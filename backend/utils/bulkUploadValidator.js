// backend/utils/bulkUploadValidator.js
const mongoose = require("mongoose");
const Product = require("../models/Product");
const Category = require("../models/Category");
const Subcategory = require("../models/Subcategory");
const ChildCategory = require("../models/ChildCategory");
const Brand = require("../models/brand");
const { resolveWeightClassForImport } = require("./catalogShippingValidation");
const { normalizeAndValidateSecondaryCategories } = require("./productCategoryValidation");

/**
 * Validate required fields for a product row
 * @param {Object} row - Product data row
 * @param {number} rowIndex - Row index (0-based) for error messages
 * @returns {Object} - Validation result { isValid: boolean, errors: string[] }
 */
const validateRequiredFields = (row, rowIndex) => {
  const errors = [];
  const requiredFields = {
    name: "Product name",
    regularPrice: "Regular price",
    stock: "Stock",
    category: "Category"
  };

  for (const [field, label] of Object.entries(requiredFields)) {
    if (!row[field] || (typeof row[field] === 'string' && row[field].trim() === '')) {
      errors.push(`Row ${rowIndex + 1}: ${label} is required`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validate SKU uniqueness
 * @param {string} sku - SKU to check
 * @param {string} sellerId - Seller ID
 * @param {Array<string>} existingSkus - SKUs already in the current batch
 * @param {{ allowExistingSku?: boolean }} [options]
 * @returns {Promise<Object>} - Validation result { isValid: boolean, error: string }
 */
const validateSkuUniqueness = async (sku, sellerId, existingSkus = [], options = {}) => {
  if (!sku || sku.trim() === '') {
    return { isValid: true };
  }

  // Check if SKU already exists in current batch
  if (existingSkus.includes(sku)) {
    return {
      isValid: false,
      error: `SKU "${sku}" is duplicated in the upload file`
    };
  }

  if (options.allowExistingSku) {
    return { isValid: true };
  }

  // Check if SKU exists in database
  const existingProduct = await Product.findOne({ sku });
  if (existingProduct) {
    return {
      isValid: false,
      error: `SKU "${sku}" already exists in the database`
    };
  }

  return { isValid: true };
};

/**
 * Validate price range
 * @param {number|string} price - Price value
 * @param {string} fieldName - Field name for error message
 * @returns {Object} - Validation result { isValid: boolean, error: string, value: number }
 */
const validatePrice = (price, fieldName = "Price") => {
  const numPrice = typeof price === 'string' ? parseFloat(price) : price;

  if (isNaN(numPrice)) {
    return {
      isValid: false,
      error: `${fieldName} must be a valid number`,
      value: null
    };
  }

  if (numPrice <= 0) {
    return {
      isValid: false,
      error: `${fieldName} must be greater than 0`,
      value: null
    };
  }

  return {
    isValid: true,
    value: numPrice
  };
};

/**
 * Validate stock value
 * @param {number|string} stock - Stock value
 * @returns {Object} - Validation result { isValid: boolean, error: string, value: number }
 */
const validateStock = (stock) => {
  const numStock = typeof stock === 'string' ? parseInt(stock, 10) : stock;

  if (isNaN(numStock)) {
    return {
      isValid: false,
      error: "Stock must be a valid number",
      value: null
    };
  }

  if (numStock < 0) {
    return {
      isValid: false,
      error: "Stock cannot be negative",
      value: null
    };
  }

  return {
    isValid: true,
    value: numStock
  };
};

/**
 * Validate MongoDB ObjectId format and existence
 * @param {string} id - ObjectId to validate
 * @param {mongoose.Model} model - Mongoose model to check existence
 * @param {string} fieldName - Field name for error message
 * @returns {Promise<Object>} - Validation result { isValid: boolean, error: string }
 */
const validateObjectId = async (id, model, fieldName) => {
  if (!id || (typeof id === 'string' && id.trim() === '')) {
    return { isValid: true }; // Optional field
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return {
      isValid: false,
      error: `${fieldName} must be a valid ObjectId`
    };
  }

  // Check if ObjectId exists in database
  const exists = await model.findById(id);
  if (!exists) {
    return {
      isValid: false,
      error: `${fieldName} with ID "${id}" does not exist in the database`
    };
  }

  return { isValid: true };
};

/**
 * Validate a single product row
 * @param {Object} row - Product data row
 * @param {number} rowIndex - Row index (0-based) for error messages
 * @param {string} sellerId - Seller ID
 * @param {Array<string>} existingSkus - SKUs already in the current batch
 * @param {{ mode?: string }} [options]
 * @returns {Promise<Object>} - Validation result { isValid: boolean, errors: string[], row: Object }
 */
const validateProductRow = async (row, rowIndex, sellerId, existingSkus = [], options = {}) => {
  const errors = [];
  const warnings = [];
  // Handle sellerId - can be ObjectId or string
  let sellerIdObj = sellerId;
  if (sellerId && !(sellerId instanceof mongoose.Types.ObjectId) && mongoose.Types.ObjectId.isValid(sellerId)) {
    sellerIdObj = new mongoose.Types.ObjectId(sellerId);
  }
  const validatedRow = { ...row, seller: sellerIdObj };

  // Validate required fields
  const requiredValidation = validateRequiredFields(row, rowIndex);
  if (!requiredValidation.isValid) {
    errors.push(...requiredValidation.errors);
    return { isValid: false, errors, row: validatedRow };
  }

  // Validate SKU uniqueness
  const skuValidation = await validateSkuUniqueness(row.sku, sellerId, existingSkus, {
    allowExistingSku: options.mode === "upsert",
  });
  if (!skuValidation.isValid) {
    errors.push(`Row ${rowIndex + 1}: ${skuValidation.error}`);
  }

  // Validate regular price
  const regularPriceValidation = validatePrice(row.regularPrice, "Regular price");
  if (!regularPriceValidation.isValid) {
    errors.push(`Row ${rowIndex + 1}: ${regularPriceValidation.error}`);
  } else {
    validatedRow.regularPrice = regularPriceValidation.value;
  }

  // Validate sale price (optional)
  if (row.salePrice) {
    const salePriceValidation = validatePrice(row.salePrice, "Sale price");
    if (!salePriceValidation.isValid) {
      errors.push(`Row ${rowIndex + 1}: ${salePriceValidation.error}`);
    } else {
      validatedRow.salePrice = salePriceValidation.value;
    }
  }

  // Validate stock
  const stockValidation = validateStock(row.stock);
  if (!stockValidation.isValid) {
    errors.push(`Row ${rowIndex + 1}: ${stockValidation.error}`);
  } else {
    validatedRow.stock = stockValidation.value;
  }

  // Validate category ObjectId (now supports name/slug lookup)
  if (!row.category || row.category === null) {
    errors.push(`Row ${rowIndex + 1}: Category is required`);
  } else {
    // Check if it's a valid ObjectId or was found by name/slug lookup
    const categoryId = row.category instanceof mongoose.Types.ObjectId
      ? row.category
      : (mongoose.Types.ObjectId.isValid(row.category) ? new mongoose.Types.ObjectId(row.category) : null);

    if (!categoryId) {
      errors.push(`Row ${rowIndex + 1}: Category "${row.category}" not found. Please use a valid category name, slug, or ObjectId`);
    } else {
      const categoryExists = await Category.findById(categoryId);
      if (!categoryExists) {
        errors.push(`Row ${rowIndex + 1}: Category with ID "${categoryId}" does not exist in the database`);
      }
    }
  }

  // Validate subcategory ObjectId (optional, supports name lookup)
  if (row.subcategory) {
    const subcategoryId = row.subcategory instanceof mongoose.Types.ObjectId
      ? row.subcategory
      : (mongoose.Types.ObjectId.isValid(row.subcategory) ? new mongoose.Types.ObjectId(row.subcategory) : null);

    if (!subcategoryId) {
      errors.push(`Row ${rowIndex + 1}: Subcategory "${row.subcategory}" not found. Please use a valid subcategory name or ObjectId`);
    } else {
      const subcategoryExists = await Subcategory.findById(subcategoryId);
      if (!subcategoryExists) {
        errors.push(`Row ${rowIndex + 1}: Subcategory with ID "${subcategoryId}" does not exist in the database`);
      }
    }
  }

  // Validate child category ObjectId (optional, supports name lookup)
  if (row.childCategory) {
    const childCategoryId = row.childCategory instanceof mongoose.Types.ObjectId
      ? row.childCategory
      : (mongoose.Types.ObjectId.isValid(row.childCategory) ? new mongoose.Types.ObjectId(row.childCategory) : null);

    if (!childCategoryId) {
      errors.push(`Row ${rowIndex + 1}: Child category "${row.childCategory}" not found. Please use a valid child category name or ObjectId`);
    } else {
      const childCategoryExists = await ChildCategory.findById(childCategoryId);
      if (!childCategoryExists) {
        errors.push(`Row ${rowIndex + 1}: Child category with ID "${childCategoryId}" does not exist in the database`);
      }
    }
  }

  // Validate brand ObjectId (optional, supports name lookup)
  if (row.brand) {
    const brandId = row.brand instanceof mongoose.Types.ObjectId
      ? row.brand
      : (mongoose.Types.ObjectId.isValid(row.brand) ? new mongoose.Types.ObjectId(row.brand) : null);

    if (!brandId) {
      errors.push(`Row ${rowIndex + 1}: Brand "${row.brand}" not found. Please use a valid brand name or ObjectId`);
    } else {
      const brandExists = await Brand.findById(brandId);
      if (!brandExists) {
        errors.push(`Row ${rowIndex + 1}: Brand with ID "${brandId}" does not exist in the database`);
      }
    }
  }

  if (Array.isArray(row.secondaryCategories) && row.secondaryCategories.length > 0) {
    const unresolved = row.secondaryCategories.filter((path) => path && path.unresolved);
    if (unresolved.length) {
      errors.push(
        `Row ${rowIndex + 1}: One or more secondaryCategories paths could not be resolved by name or id`
      );
    } else {
      try {
        const cleaned = row.secondaryCategories.map((path) => ({
          category: path.category,
          subcategory: path.subcategory,
          childCategory: path.childCategory,
        }));
        validatedRow.secondaryCategories = await normalizeAndValidateSecondaryCategories(
          cleaned,
          {
            category: row.category,
            subcategory: row.subcategory,
            childCategory: row.childCategory,
          }
        );
      } catch (err) {
        errors.push(`Row ${rowIndex + 1}: ${err.message}`);
      }
    }
  }

  // P6: obsolete shippingApplicability / shippingVisibility / shippingType / shippingCharge
  // columns are ignored if present. Operator CSV does not include weightClass —
  // shipping slab is set in Admin Product UI before Publish. Full technical /
  // leftover weightClass columns are still resolved when present.
  const weightClassResolve = await resolveWeightClassForImport(row.weightClass);
  if (weightClassResolve.missing) {
    delete validatedRow.weightClass;
  } else if (!weightClassResolve.ok) {
    errors.push(`Row ${rowIndex + 1}: ${weightClassResolve.message}`);
  } else {
    validatedRow.weightClass = weightClassResolve.value;
  }

  // Ensure obsolete charge-authority columns never pass through to create/update
  delete validatedRow.shippingApplicability;
  delete validatedRow.shippingVisibility;
  delete validatedRow.shippingType;
  delete validatedRow.shippingCharge;

  if (row.returnPolicyMode !== undefined && row.returnPolicyMode !== "") {
    const mode = String(row.returnPolicyMode).trim().toLowerCase();
    if (!["inherit", "override"].includes(mode)) {
      errors.push(
        `Row ${rowIndex + 1}: returnPolicyMode must be "inherit" or "override"`
      );
    } else {
      validatedRow.returnPolicyMode = mode;
      if (mode === "override" && (row.returnAllowed === undefined || row.returnAllowed === "")) {
        errors.push(
          `Row ${rowIndex + 1}: returnAllowed is required when returnPolicyMode is override`
        );
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    row: validatedRow
  };
};

/**
 * Validate multiple product rows
 * @param {Array<Object>} rows - Array of product data rows
 * @param {string} sellerId - Seller ID
 * @param {{ mode?: string }} [options]
 * @returns {Promise<Object>} - Validation result { isValid: boolean, validRows: Array, invalidRows: Array, errors: Array }
 */
const validateProductRows = async (rows, sellerId, options = {}) => {
  const validRows = [];
  const invalidRows = [];
  const allErrors = [];
  const allWarnings = [];
  const existingSkus = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const validation = await validateProductRow(row, i, sellerId, existingSkus, options);

    if (validation.warnings?.length) {
      allWarnings.push(...validation.warnings);
    }

    if (validation.isValid) {
      validRows.push(validation.row);
      if (validation.row.sku && validation.row.sku.trim() !== '') {
        existingSkus.push(validation.row.sku);
      }
    } else {
      invalidRows.push({
        rowIndex: i + 1,
        row,
        errors: validation.errors
      });
      allErrors.push(...validation.errors);
    }
  }

  return {
    isValid: invalidRows.length === 0,
    validRows,
    invalidRows,
    errors: allErrors,
    warnings: allWarnings,
    summary: {
      total: rows.length,
      valid: validRows.length,
      invalid: invalidRows.length
    }
  };
};

module.exports = {
  validateRequiredFields,
  validateSkuUniqueness,
  validatePrice,
  validateStock,
  validateObjectId,
  validateProductRow,
  validateProductRows
};

