/**
 * Variant Utility Functions (Phase 1)
 * Pure utility functions for variant combination normalization and SKU computation
 * No side effects, no database operations, no validation enforcement
 */

/**
 * Normalize a variant combination object to a deterministic string key
 * Format: { Color: "Red", Size: "Large" } -> "color:red|size:large"
 * 
 * Rules:
 * - Sort variant types alphabetically
 * - Lowercase type names and values
 * - Trim whitespace
 * - Same input always produces same output
 * 
 * @param {Object} variantCombination - Object mapping variant types to values
 *   Example: { Color: "Red", Size: "Large" }
 * @returns {String|null} Normalized variant key or null if invalid input
 */
function normalizeVariantCombination(variantCombination) {
  if (!variantCombination || typeof variantCombination !== 'object') {
    return null;
  }
  
  const keys = Object.keys(variantCombination);
  if (keys.length === 0) {
    return null;
  }
  
  // Sort variant types alphabetically for deterministic output
  const sortedKeys = keys.sort();
  
  // Build normalized key parts
  const parts = sortedKeys.map(key => {
    const value = variantCombination[key];
    if (value === null || value === undefined) {
      return null;
    }
    
    // Normalize: lowercase, trim whitespace
    const normalizedKey = String(key).toLowerCase().trim();
    const normalizedValue = String(value).toLowerCase().trim();
    
    return `${normalizedKey}:${normalizedValue}`;
  }).filter(part => part !== null); // Remove null parts
  
  if (parts.length === 0) {
    return null;
  }
  
  // Join with pipe separator
  return parts.join('|');
}

/**
 * Compute variant SKU from product SKU and variant combination
 * Format: {productSku}-{variantKey}
 * 
 * @param {String} productSku - Product SKU
 * @param {Object} variantCombination - Object mapping variant types to values
 * @returns {String|null} Variant SKU or null if invalid input
 */
function computeVariantSku(productSku, variantCombination) {
  if (!productSku || typeof productSku !== 'string') {
    return null;
  }
  
  const variantKey = normalizeVariantCombination(variantCombination);
  if (!variantKey) {
    return null;
  }
  
  return `${productSku}-${variantKey}`;
}

/**
 * Get variant pricing for a given combination (pure function lookup)
 * Returns variant price if exists, otherwise returns null (caller should fallback to product price)
 * 
 * @param {Object} product - Product object or plain object with variantPricing field
 * @param {Object} variantCombination - Object mapping variant types to values
 * @returns {Object|null} { price: Number, salePrice: Number } or null if not found
 */
function getVariantPricing(product, variantCombination) {
  if (!product || !product.variantPricing || typeof product.variantPricing !== 'object') {
    return null;
  }

  if (!variantCombination || typeof variantCombination !== 'object' || Object.keys(variantCombination).length === 0) {
    return null;
  }

  const variantKey = normalizeVariantCombination(variantCombination);
  if (!variantKey) {
    return null;
  }

  return product.variantPricing[variantKey] || null;
}

function combinationFromVariantKey(variantKey) {
  if (!variantKey || typeof variantKey !== "string") {
    return null;
  }

  const combo = {};
  for (const part of variantKey.split("|")) {
    const trimmed = part.trim();
    const idx = trimmed.indexOf(":");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (key && value) combo[key] = value;
  }

  return Object.keys(combo).length ? combo : null;
}

function unitPriceFromVariantPricing(pricing) {
  if (!pricing) return null;
  const sale = Number(pricing.salePrice);
  if (Number.isFinite(sale) && sale > 0) return sale;
  const regular = Number(pricing.price);
  if (Number.isFinite(regular) && regular > 0) return regular;
  return null;
}

/**
 * SEC-001 — unit price from Product.variantPricing only.
 * Client snapshots are never used as the payable amount.
 */
function resolveAuthoritativeVariantPrice(product, variantCombination, variantKey) {
  let pricing = getVariantPricing(product, variantCombination);
  if (!pricing && variantKey && product?.variantPricing && typeof product.variantPricing === "object") {
    pricing =
      product.variantPricing[variantKey] ||
      product.variantPricing[String(variantKey).toLowerCase()] ||
      null;
  }
  if (!pricing && variantKey) {
    pricing = getVariantPricing(product, combinationFromVariantKey(variantKey));
  }
  return unitPriceFromVariantPricing(pricing);
}

/**
 * Get variant stock for a given combination (pure function lookup)
 * Returns variant stock if exists, otherwise returns null (caller should fallback to product stock)
 * 
 * @param {Object} product - Product object or plain object with variantStock field
 * @param {Object} variantCombination - Object mapping variant types to values
 * @returns {Number|null} Stock quantity or null if not found
 */
function getVariantStock(product, variantCombination) {
  if (!product || !product.variantStock || typeof product.variantStock !== 'object') {
    return null;
  }
  
  if (!variantCombination || typeof variantCombination !== 'object' || Object.keys(variantCombination).length === 0) {
    return null;
  }
  
  const variantKey = normalizeVariantCombination(variantCombination);
  if (!variantKey) {
    return null;
  }
  
  const stock = product.variantStock[variantKey];
  return typeof stock === 'number' ? stock : null;
}

/**
 * Get variant media for a given combination (pure function lookup)
 * Returns variant media if exists, otherwise returns null (caller should fallback to product media)
 * 
 * @param {Object} product - Product object or plain object with variantMedia field
 * @param {Object} variantCombination - Object mapping variant types to values
 * @returns {Object|null} { mainImage: String, galleryImages: [String], video: String } or null if not found
 */
function getVariantMedia(product, variantCombination) {
  if (!product || !product.variantMedia || typeof product.variantMedia !== 'object') {
    return null;
  }
  
  if (!variantCombination || typeof variantCombination !== 'object' || Object.keys(variantCombination).length === 0) {
    return null;
  }
  
  const variantKey = normalizeVariantCombination(variantCombination);
  if (!variantKey) {
    return null;
  }
  
  return product.variantMedia[variantKey] || null;
}

/**
 * Generate all possible variant combinations from variant definitions
 * 
 * @param {Array} variants - Array of variant objects with { type, values: [] }
 * @returns {Array} Array of variant combination objects
 * Example: [{ Color: "Red", Size: "Large" }, { Color: "Red", Size: "Small" }, ...]
 */
function generateVariantCombinations(variants) {
  if (!variants || !Array.isArray(variants) || variants.length === 0) {
    return [];
  }

  // Filter out variants without type or values
  const validVariants = variants.filter(v => v && v.type && Array.isArray(v.values) && v.values.length > 0);
  
  if (validVariants.length === 0) {
    return [];
  }

  // Extract values for each variant type, handling "label|hex" format
  const variantValues = validVariants.map(v => ({
    type: v.type,
    values: v.values.map(val => {
      // Handle "label|hex" format for colors - extract just the label
      if (typeof val === 'string' && val.includes('|')) {
        return val.split('|')[0];
      }
      return val;
    })
  }));

  // Generate cartesian product
  function cartesianProduct(arrays) {
    return arrays.reduce((acc, arr) => {
      const result = [];
      acc.forEach(accItem => {
        arr.forEach(arrItem => {
          result.push([...accItem, arrItem]);
        });
      });
      return result;
    }, [[]]);
  }

  const valueArrays = variantValues.map(v => v.values);
  const combinations = cartesianProduct(valueArrays);

  // Convert to objects
  return combinations.map(combo => {
    const combination = {};
    variantValues.forEach((variant, index) => {
      combination[variant.type] = combo[index];
    });
    return combination;
  });
}

/**
 * Check if product has valid variants
 * Validates that product has variants array with proper structure (type + non-empty values)
 * 
 * @param {Object} product - Product object
 * @returns {Boolean} True if product has valid variants
 */
function productHasVariants(product) {
  if (!product || !Array.isArray(product.variants) || product.variants.length === 0) {
    return false;
  }
  
  // Validate each variant has type and non-empty values array
  return product.variants.every(v => 
    v && 
    v.type && 
    typeof v.type === 'string' &&
    Array.isArray(v.values) && 
    v.values.length > 0
  );
}

/**
 * Validate variant combination against product's actual variant definitions
 * Checks that:
 * 1. All variant types from product are present in variantCombination
 * 2. All values in variantCombination are valid for their respective types
 * 3. Handles case sensitivity and "label|hex" format
 * 
 * @param {Object} product - Product object with variants array
 * @param {Object} variantCombination - Object mapping variant types to values
 * @returns {Object} { valid: Boolean, error: String|null }
 */
function validateVariantCombination(product, variantCombination) {
  // Check if product has variants
  if (!productHasVariants(product)) {
    return { valid: false, error: 'Product does not have variants' };
  }
  
  // Check if variantCombination is valid object
  if (!variantCombination || typeof variantCombination !== 'object' || Object.keys(variantCombination).length === 0) {
    return { valid: false, error: 'Variant combination is required' };
  }
  
  // Normalize product variant types (case-insensitive)
  const productVariantTypes = product.variants.map(v => ({
    original: v.type,
    normalized: String(v.type).toLowerCase().trim()
  }));
  
  // Normalize variant combination keys (case-insensitive)
  const combinationKeys = Object.keys(variantCombination).map(k => ({
    original: k,
    normalized: String(k).toLowerCase().trim()
  }));
  
  // Check all product variant types are present in combination
  const missingTypes = productVariantTypes.filter(pvt => 
    !combinationKeys.some(ck => ck.normalized === pvt.normalized)
  );
  
  if (missingTypes.length > 0) {
    return { 
      valid: false, 
      error: `Missing variant types: ${missingTypes.map(mt => mt.original).join(', ')}` 
    };
  }
  
  // Check for extra types in combination (not in product)
  const extraTypes = combinationKeys.filter(ck => 
    !productVariantTypes.some(pvt => pvt.normalized === ck.normalized)
  );
  
  if (extraTypes.length > 0) {
    return { 
      valid: false, 
      error: `Invalid variant types: ${extraTypes.map(et => et.original).join(', ')}` 
    };
  }
  
  // Validate each value against product variant definitions
  for (const productVariant of product.variants) {
    const variantType = productVariant.type;
    const variantTypeNormalized = String(variantType).toLowerCase().trim();
    
    // Find matching key in variantCombination (case-insensitive)
    const combinationKey = Object.keys(variantCombination).find(k => 
      String(k).toLowerCase().trim() === variantTypeNormalized
    );
    
    if (!combinationKey) {
      continue; // Already checked above, but safety check
    }
    
    const combinationValue = variantCombination[combinationKey];
    if (!combinationValue) {
      return { 
        valid: false, 
        error: `Variant value is required for type: ${variantType}` 
      };
    }
    
    // Normalize combination value (handle "label|hex" format)
    const normalizedCombinationValue = String(combinationValue)
      .split('|')[0]  // Extract label from "label|hex" format
      .toLowerCase()
      .trim();
    
    // Normalize product variant values (handle "label|hex" format)
    const normalizedProductValues = productVariant.values.map(val => 
      String(val)
        .split('|')[0]  // Extract label from "label|hex" format
        .toLowerCase()
        .trim()
    );
    
    // Check if combination value exists in product variant values
    if (!normalizedProductValues.includes(normalizedCombinationValue)) {
      return { 
        valid: false, 
        error: `Invalid value "${combinationValue}" for variant type "${variantType}". Valid values: ${productVariant.values.join(', ')}` 
      };
    }
  }
  
  return { valid: true, error: null };
}

module.exports = {
  normalizeVariantCombination,
  computeVariantSku,
  getVariantPricing,
  getVariantStock,
  getVariantMedia,
  generateVariantCombinations,
  productHasVariants,
  validateVariantCombination,
  combinationFromVariantKey,
  resolveAuthoritativeVariantPrice,
};

