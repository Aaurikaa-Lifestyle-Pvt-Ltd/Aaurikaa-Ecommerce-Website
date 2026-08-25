/**
 * Normalize corrupted Product.tags in place.
 *
 * Usage:
 *   node scripts/normalize-product-tags-cleanup.js           # dry-run
 *   node scripts/normalize-product-tags-cleanup.js --apply   # write changes
 *
 * Uses MONGODB_URI from backend/.env
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Product = require("../models/Product");
const { normalizeProductTagsForWrite } = require("../utils/productTags");

const APPLY = process.argv.includes("--apply");

function tagsNeedNormalization(rawTags) {
  const canonical = normalizeProductTagsForWrite(rawTags);
  const raw = Array.isArray(rawTags) ? rawTags : [];
  if (raw.length !== canonical.length) return true;
  return raw.some((tag, i) => String(tag) !== String(canonical[i]));
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

  const toFix = products.filter((p) => tagsNeedNormalization(p.tags));

  const summary = toFix.map((p) => ({
    productId: String(p._id),
    name: p.name,
    sku: p.sku,
    beforeCount: p.tags.length,
    afterCount: normalizeProductTagsForWrite(p.tags).length,
  }));

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? "apply" : "dry-run",
        scanned: products.length,
        toFix: toFix.length,
        products: summary,
      },
      null,
      2
    )
  );

  if (APPLY && toFix.length > 0) {
    let updated = 0;
    for (const p of toFix) {
      const canonical = normalizeProductTagsForWrite(p.tags);
      await Product.updateOne({ _id: p._id }, { $set: { tags: canonical } });
      updated += 1;
    }
    console.log(JSON.stringify({ updated }, null, 2));
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
