// backend/utils/productImportExport/variantSkuCollision.js
const Product = require('../../models/Product');

/**
 * Load all product SKUs and variant SKU values from DB into a Set.
 * @param {Object} [options]
 * @param {string} [options.excludeProductId] - Mongo id to exclude (upsert)
 * @returns {Promise<Set<string>>}
 */
async function loadGlobalSkuSet(options = {}) {
  const query = {};
  if (options.excludeProductId) {
    query._id = { $ne: options.excludeProductId };
  }
  const products = await Product.find(query).select('sku variantSku').lean();
  const set = new Set();
  for (const p of products) {
    if (p.sku && String(p.sku).trim()) {
      set.add(String(p.sku).trim());
    }
    if (p.variantSku && typeof p.variantSku === 'object' && !Array.isArray(p.variantSku)) {
      Object.values(p.variantSku).forEach((v) => {
        if (v && String(v).trim()) set.add(String(v).trim());
      });
    }
  }
  return set;
}

/**
 * @param {Object} variantSkuMap
 * @returns {string[]}
 */
function extractVariantSkuValues(variantSkuMap) {
  if (!variantSkuMap || typeof variantSkuMap !== 'object' || Array.isArray(variantSkuMap)) {
    return [];
  }
  return Object.values(variantSkuMap)
    .map((v) => (v == null ? '' : String(v).trim()))
    .filter(Boolean);
}

module.exports = {
  loadGlobalSkuSet,
  extractVariantSkuValues,
};
