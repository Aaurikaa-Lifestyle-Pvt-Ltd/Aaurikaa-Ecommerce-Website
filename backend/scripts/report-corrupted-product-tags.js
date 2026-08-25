/**
 * Read-only report: products with potentially corrupted tags.
 * Usage: node scripts/report-corrupted-product-tags.js
 * Uses MONGODB_URI from backend/.env
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Product = require("../models/Product");
const { normalizeProductTagsForWrite } = require("../utils/productTags");

const CORRUPTION_THRESHOLDS = {
  minTagArrayLength: 50,
  minSingleTagLength: 200,
};

function analyzeProduct(product) {
  const rawTags = Array.isArray(product.tags) ? product.tags : [];
  const tagCount = rawTags.length;
  const canonical = normalizeProductTagsForWrite(rawTags);
  const uniqueTagCount = canonical.length;
  const maxTagLen = rawTags.reduce(
    (max, t) => Math.max(max, String(t || "").length),
    0
  );

  const isCorrupted =
    tagCount >= CORRUPTION_THRESHOLDS.minTagArrayLength ||
    maxTagLen >= CORRUPTION_THRESHOLDS.minSingleTagLength ||
    (tagCount > 0 && uniqueTagCount > 0 && tagCount !== uniqueTagCount);

  return {
    productId: String(product._id),
    productName: product.name || "",
    sku: product.sku || "",
    tagCount,
    uniqueTagCount,
    maxTagLen,
    isCorrupted,
  };
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("Missing MONGODB_URI");
    process.exit(1);
  }

  await mongoose.connect(uri);
  const products = await Product.find({ tags: { $exists: true, $ne: [] } })
    .select("name sku tags")
    .lean();

  const report = products.map(analyzeProduct).filter((r) => r.isCorrupted);
  report.sort((a, b) => b.tagCount - a.tagCount);

  console.log(JSON.stringify({ scanned: products.length, corrupted: report.length, products: report }, null, 2));
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
