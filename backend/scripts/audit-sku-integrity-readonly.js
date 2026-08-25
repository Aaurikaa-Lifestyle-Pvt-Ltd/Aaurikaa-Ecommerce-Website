/**
 * Read-only SKU integrity audit script (Scope N — Phase 3A).
 *
 * Detects:
 * - Orphaned upsellSkus / crossSellSkus / boughtTogetherSkus references
 * - Review.productSku mismatches for existing products
 *
 * This script performs ZERO database modifications.
 *
 * Usage:
 *   node backend/scripts/audit-sku-integrity-readonly.js
 *   node backend/scripts/audit-sku-integrity-readonly.js <mongodb-uri>
 *   node backend/scripts/audit-sku-integrity-readonly.js --json-only
 *
 * Sample output: structured JSON report + human-readable summary on stdout.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
require('dotenv').config();

const mongoose = require('mongoose');
const Product = require('../models/Product');
const Review = require('../models/Review');

const PROMOTION_FIELDS = ['upsellSkus', 'crossSellSkus', 'boughtTogetherSkus'];
const BATCH_SIZE = 500;

function parseArgs(argv) {
  const jsonOnly = argv.includes('--json-only');
  const uriArg = argv.find((arg) => arg.startsWith('mongodb'));
  return { jsonOnly, uriArg };
}

function buildOrphanReport(validSkuSet, products) {
  const fieldMaps = {
    upsellSkus: new Map(),
    crossSellSkus: new Map(),
    boughtTogetherSkus: new Map(),
  };

  const productsWithAnyOrphan = new Set();

  for (const product of products) {
    for (const field of PROMOTION_FIELDS) {
      const refs = Array.isArray(product[field]) ? product[field] : [];
      for (const refSku of refs) {
        const trimmed = String(refSku || '').trim();
        if (!trimmed || validSkuSet.has(trimmed)) continue;

        productsWithAnyOrphan.add(String(product._id));

        if (!fieldMaps[field].has(trimmed)) {
          fieldMaps[field].set(trimmed, new Set());
        }
        fieldMaps[field].get(trimmed).add(String(product._id));
      }
    }
  }

  const orphanedPromotionRefs = {};
  let totalOrphanedRefSkus = 0;

  for (const field of PROMOTION_FIELDS) {
    orphanedPromotionRefs[field] = Array.from(fieldMaps[field].entries())
      .map(([refSku, productIds]) => {
        totalOrphanedRefSkus += 1;
        return {
          refSku,
          referencedByProducts: Array.from(productIds),
          count: productIds.size,
        };
      })
      .sort((a, b) => b.count - a.count || a.refSku.localeCompare(b.refSku));
  }

  return {
    orphanedPromotionRefs,
    productsWithAnyOrphan: productsWithAnyOrphan.size,
    totalOrphanedRefSkus,
  };
}

async function fetchReviewSkuMismatches() {
  return Review.aggregate([
    {
      $lookup: {
        from: 'products',
        localField: 'product',
        foreignField: '_id',
        as: 'p',
      },
    },
    { $unwind: { path: '$p', preserveNullAndEmptyArrays: true } },
    {
      $match: {
        $expr: {
          $and: [
            { $ne: ['$p', null] },
            { $ne: ['$productSku', '$p.sku'] },
          ],
        },
      },
    },
    {
      $project: {
        _id: 1,
        product: 1,
        productSku: 1,
        currentProductSku: '$p.sku',
      },
    },
  ]);
}

function printHumanSummary(report) {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('SKU INTEGRITY AUDIT (READ-ONLY)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Generated at: ${report.generatedAt}`);
  console.log(`Catalog size: ${report.catalogSize} products`);
  console.log('');
  console.log('Orphaned promotion references:');
  for (const field of PROMOTION_FIELDS) {
    const entries = report.orphanedPromotionRefs[field];
    console.log(`  ${field}: ${entries.length} distinct orphan SKU(s)`);
    entries.slice(0, 5).forEach((entry) => {
      console.log(`    - ${entry.refSku} (referenced by ${entry.count} product(s))`);
    });
    if (entries.length > 5) {
      console.log(`    ... and ${entries.length - 5} more`);
    }
  }
  console.log('');
  console.log(`Review SKU mismatches: ${report.reviewSkuMismatches.length}`);
  report.reviewSkuMismatches.slice(0, 5).forEach((row) => {
    console.log(
      `  - review ${row.reviewId}: stored "${row.storedProductSku}" vs actual "${row.actualProductSku}"`
    );
  });
  if (report.reviewSkuMismatches.length > 5) {
    console.log(`  ... and ${report.reviewSkuMismatches.length - 5} more`);
  }
  console.log('');
  console.log('Summary:');
  console.log(`  Total orphaned ref SKUs: ${report.summary.totalOrphanedRefSkus}`);
  console.log(`  Products with any orphan ref: ${report.summary.productsWithAnyOrphanRef}`);
  console.log(`  Total review mismatches: ${report.summary.totalReviewMismatches}`);
  console.log('═══════════════════════════════════════════════════════════');
}

async function runAudit() {
  const { jsonOnly, uriArg } = parseArgs(process.argv.slice(2));
  const mongoUri =
    uriArg || process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL;

  if (!mongoUri) {
    console.error('MongoDB URI not found. Pass as argument or set MONGODB_URI in .env');
    process.exit(1);
  }

  await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const catalogSize = await Product.countDocuments();
  const validSkus = await Product.distinct('sku');
  const validSkuSet = new Set(validSkus.filter(Boolean).map((s) => String(s).trim()));

  const projection = {
    _id: 1,
    upsellSkus: 1,
    crossSellSkus: 1,
    boughtTogetherSkus: 1,
  };

  const products = [];
  let skip = 0;
  while (true) {
    const batch = await Product.find({})
      .select(projection)
      .skip(skip)
      .limit(BATCH_SIZE)
      .lean();
    if (!batch.length) break;
    products.push(...batch);
    skip += batch.length;
  }

  const orphanReport = buildOrphanReport(validSkuSet, products);
  const reviewRows = await fetchReviewSkuMismatches();
  const reviewSkuMismatches = reviewRows.map((row) => ({
    reviewId: String(row._id),
    productId: String(row.product),
    storedProductSku: row.productSku,
    actualProductSku: row.currentProductSku,
  }));

  const report = {
    generatedAt: new Date().toISOString(),
    catalogSize,
    orphanedPromotionRefs: orphanReport.orphanedPromotionRefs,
    reviewSkuMismatches,
    summary: {
      totalOrphanedRefSkus: orphanReport.totalOrphanedRefSkus,
      totalReviewMismatches: reviewSkuMismatches.length,
      productsWithAnyOrphanRef: orphanReport.productsWithAnyOrphan,
    },
  };

  console.log(JSON.stringify(report, null, 2));

  if (!jsonOnly) {
    console.log('');
    printHumanSummary(report);
  }

  await mongoose.disconnect();
}

runAudit().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
