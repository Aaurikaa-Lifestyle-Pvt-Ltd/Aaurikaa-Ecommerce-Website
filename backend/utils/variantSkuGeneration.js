const { generateSku } = require("./skuGenerator");
const {
  generateVariantCombinations,
  normalizeVariantCombination,
} = require("./variantUtils");

class VariantSkuGenerationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "VariantSkuGenerationError";
    this.statusCode = statusCode;
    this.code = "DUPLICATE_VARIANT_SKU";
  }
}

/**
 * Build local exclude list: base SKU plus any existing variant SKU values.
 */
function buildLocalExcludeSkus(baseSku, variantSkuMap = {}) {
  const excludes = [String(baseSku || "").trim()].filter(Boolean);
  Object.values(variantSkuMap || {}).forEach((sku) => {
    const normalized = String(sku || "").trim();
    if (normalized && !excludes.includes(normalized)) {
      excludes.push(normalized);
    }
  });
  return excludes;
}

/**
 * Reject maps that contain duplicate variant SKU values.
 */
function assertUniqueVariantSkus(variantSku) {
  const skuValues = Object.values(variantSku || {}).filter(
    (sku) => sku && String(sku).trim() !== ""
  );
  const duplicateSkus = skuValues.filter(
    (sku, index) => skuValues.indexOf(sku) !== index
  );
  if (duplicateSkus.length > 0) {
    throw new VariantSkuGenerationError(
      `Duplicate variant SKUs generated. Each variant must have a unique SKU. Duplicates: ${[...new Set(duplicateSkus)].join(", ")}`
    );
  }
}

/**
 * Generate variant SKUs for all combinations (regenerate flow).
 */
async function regenerateAllVariantSkus({
  product,
  variants,
  baseSku,
  category,
  seller,
}) {
  return generateVariantSkuMap({
    product,
    variants,
    variantSku: {},
    baseSku,
    category,
    seller,
    overwriteAll: true,
  });
}

/**
 * Generate variant SKUs only for combinations missing entries (create/update flow).
 */
async function fillMissingVariantSkus({
  product,
  variants,
  variantSku = {},
  baseSku,
  category,
  seller,
}) {
  return generateVariantSkuMap({
    product,
    variants,
    variantSku,
    baseSku,
    category,
    seller,
    overwriteAll: false,
  });
}

/**
 * Shared variant SKU map generation with localExcludeSkus collision prevention.
 */
async function generateVariantSkuMap({
  product,
  variants,
  variantSku = {},
  baseSku,
  category,
  seller,
  overwriteAll = false,
}) {
  const allCombinations = generateVariantCombinations(variants);
  const vSku = overwriteAll ? {} : { ...variantSku };
  const seedMap = overwriteAll ? {} : variantSku;
  const localExcludeSkus = buildLocalExcludeSkus(baseSku, seedMap);
  let updated = false;

  for (const combo of allCombinations) {
    const key = normalizeVariantCombination(combo);
    if (!key) {
      continue;
    }
    if (!overwriteAll && vSku[key]) {
      continue;
    }

    const variantSkuValue = await generateSku({
      product,
      category,
      seller,
      variantCombination: combo,
      variantValues: Object.values(combo),
      excludeSkus: localExcludeSkus,
    });

    vSku[key] = variantSkuValue;
    localExcludeSkus.push(variantSkuValue);
    updated = true;
  }

  if (updated) {
    assertUniqueVariantSkus(vSku);
  }

  return { variantSku: vSku, updated };
}

module.exports = {
  VariantSkuGenerationError,
  buildLocalExcludeSkus,
  assertUniqueVariantSkus,
  fillMissingVariantSkus,
  regenerateAllVariantSkus,
  generateVariantSkuMap,
};
