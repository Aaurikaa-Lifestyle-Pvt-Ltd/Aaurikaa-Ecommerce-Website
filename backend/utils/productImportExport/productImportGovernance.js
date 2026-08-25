// backend/utils/productImportExport/productImportGovernance.js
const {
  productHasVariants,
  generateVariantCombinations,
  normalizeVariantCombination,
} = require('../variantUtils');
const { LEGACY_CONTRACT_VERSIONS } = require('./constants');
const { extractVariantSkuValues } = require('./variantSkuCollision');

const URL_PATTERN = /^https?:\/\/.+/i;

function isContractV2(contractVersion) {
  const v = String(contractVersion || '1.0').trim();
  return !LEGACY_CONTRACT_VERSIONS.includes(v);
}

function validateMediaUrl(url, fieldName) {
  if (!url || typeof url !== 'string' || !url.trim()) return null;
  const trimmed = url.trim();
  if (!URL_PATTERN.test(trimmed)) {
    return `${fieldName} must be a valid http(s) URL`;
  }
  return null;
}

/**
 * Governance rules for v2 contract rows (after type conversion).
 * @param {Object} row - converted product row
 * @param {number} rowIndex - 0-based
 * @param {Object} ctx
 * @param {string} ctx.contractVersion
 * @param {Set<string>} ctx.fileSkuSet - all SKUs in file (product + variant)
 * @param {Set<string>} ctx.dbSkuSet - existing global SKUs
 * @param {Set<string>} [ctx.upsertIgnoreSkuSet] - SKUs belonging to products being updated
 * @returns {{ errors: string[], warnings: string[] }}
 */
function validateRowGovernance(row, rowIndex, ctx) {
  const errors = [];
  const warnings = [];
  const label = `Row ${rowIndex + 1}`;

  if (!isContractV2(ctx.contractVersion)) {
    return { errors, warnings };
  }

  if (row.mainImage) {
    const e = validateMediaUrl(row.mainImage, 'mainImage');
    if (e) errors.push(`${label}: ${e}`);
  }
  if (row.video) {
    const e = validateMediaUrl(row.video, 'video');
    if (e) errors.push(`${label}: ${e}`);
  }

  const hasVariants = productHasVariants(row);

  if (hasVariants) {
    const combinations = generateVariantCombinations(row.variants);
    if (!combinations.length) {
      errors.push(`${label}: variants defined but no valid combinations`);
      return { errors, warnings };
    }

    const variantStock = row.variantStock && typeof row.variantStock === 'object' ? row.variantStock : {};
    const variantSku = row.variantSku && typeof row.variantSku === 'object' ? row.variantSku : {};
    const variantPricing = row.variantPricing && typeof row.variantPricing === 'object' ? row.variantPricing : {};

    for (const combo of combinations) {
      const key = normalizeVariantCombination(combo);
      if (!key) continue;

      const stock = variantStock[key];
      if (stock === undefined || stock === null || stock === '') {
        errors.push(`${label}: variantStock missing for combination "${key}"`);
      } else if (typeof stock !== 'number' || isNaN(stock) || stock < 0) {
        errors.push(`${label}: variantStock for "${key}" must be a number >= 0`);
      }

      const vSku = variantSku[key];
      if (!vSku || !String(vSku).trim()) {
        errors.push(`${label}: variantSku missing for combination "${key}"`);
      } else {
        const trimmed = String(vSku).trim();
        if (ctx.fileSkuSet.has(trimmed)) {
          errors.push(`${label}: duplicate SKU "${trimmed}" in upload file`);
        } else {
          ctx.fileSkuSet.add(trimmed);
        }
        if (ctx.dbSkuSet.has(trimmed) && !ctx.upsertIgnoreSkuSet?.has(trimmed)) {
          errors.push(`${label}: variant SKU "${trimmed}" already exists in catalog`);
        }
      }

      const pricing = variantPricing[key];
      if (pricing && typeof pricing === 'object') {
        if (pricing.price !== undefined && (isNaN(Number(pricing.price)) || Number(pricing.price) <= 0)) {
          errors.push(`${label}: variant pricing.price for "${key}" must be > 0`);
        }
      }
    }

    if (row.stock !== undefined && row.stock !== null && row.stock !== '') {
      const parentStock = Number(row.stock);
      const sumVariant = combinations.reduce((sum, combo) => {
        const key = normalizeVariantCombination(combo);
        const s = variantStock[key];
        return sum + (typeof s === 'number' ? s : 0);
      }, 0);
      if (!isNaN(parentStock) && parentStock !== sumVariant) {
        warnings.push(
          `${label}: parent stock (${parentStock}) does not match sum of variantStock (${sumVariant})`
        );
      }
    }

    if (row.variantMedia && typeof row.variantMedia === 'object') {
      Object.entries(row.variantMedia).forEach(([key, media]) => {
        if (!media || typeof media !== 'object') return;
        if (media.mainImage) {
          const e = validateMediaUrl(media.mainImage, `variantMedia.${key}.mainImage`);
          if (e) errors.push(`${label}: ${e}`);
        }
        if (media.video) {
          const e = validateMediaUrl(media.video, `variantMedia.${key}.video`);
          if (e) errors.push(`${label}: ${e}`);
        }
      });
    }
  } else if (row.variantStock || row.variantSku || row.variantPricing || row.variantMedia) {
    warnings.push(`${label}: variant Mixed fields present but product has no valid variants; fields ignored`);
  }

  if (row.sku && String(row.sku).trim()) {
    const sku = String(row.sku).trim();
    extractVariantSkuValues(row.variantSku).forEach((vSku) => {
      if (vSku === sku) {
        errors.push(`${label}: product sku cannot equal a variant SKU in the same product`);
      }
    });
  }

  return { errors, warnings };
}

/**
 * @param {Array<Object>} rows
 * @param {string} contractVersion
 * @param {Set<string>} dbSkuSet
 * @param {Set<string>} [upsertIgnoreSkuSet]
 * @returns {{ isValid: boolean, errors: string[], warnings: string[], invalidRows: Array }}
 */
function validateRowsGovernance(rows, contractVersion, dbSkuSet, upsertIgnoreSkuSet) {
  const allErrors = [];
  const allWarnings = [];
  const invalidRows = [];
  const fileSkuSet = new Set();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.sku && String(row.sku).trim()) {
      const sku = String(row.sku).trim();
      if (fileSkuSet.has(sku)) {
        allErrors.push(`Row ${i + 1}: duplicate product SKU "${sku}" in upload file`);
      } else {
        fileSkuSet.add(sku);
      }
    }
    extractVariantSkuValues(row.variantSku).forEach((v) => {
      if (fileSkuSet.has(v)) {
        allErrors.push(`Row ${i + 1}: duplicate SKU "${v}" in upload file`);
      } else {
        fileSkuSet.add(v);
      }
    });
  }

  const usedFileSkus = new Set();

  for (let i = 0; i < rows.length; i++) {
    const { errors, warnings } = validateRowGovernance(rows[i], i, {
      contractVersion,
      fileSkuSet: usedFileSkus,
      dbSkuSet,
      upsertIgnoreSkuSet,
    });
    if (errors.length === 0) {
      const row = rows[i];
      if (row.sku && String(row.sku).trim()) usedFileSkus.add(String(row.sku).trim());
      extractVariantSkuValues(row.variantSku).forEach((v) => usedFileSkus.add(v));
    }
    if (errors.length) {
      invalidRows.push({ rowIndex: i + 1, row: rows[i], errors });
      allErrors.push(...errors);
    }
    allWarnings.push(...warnings);
  }

  return {
    isValid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
    invalidRows,
  };
}

module.exports = {
  isContractV2,
  validateRowGovernance,
  validateRowsGovernance,
};
