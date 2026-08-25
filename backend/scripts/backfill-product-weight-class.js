#!/usr/bin/env node
/**
 * P2 — Backfill Product.weightClass to ops-chosen default WeightClass.
 *
 * Never derives slab from product weight.
 * Default: DRY RUN. Writes only with --apply.
 *
 * Usage:
 *   node scripts/backfill-product-weight-class.js
 *   node scripts/backfill-product-weight-class.js --apply
 *   node scripts/backfill-product-weight-class.js --apply --default-weight-class-id <ObjectId>
 *   node scripts/backfill-product-weight-class.js --apply --default-weight-class-name "Standard"
 *   node scripts/backfill-product-weight-class.js --clear --apply   # rollback clear (only if P4/P5 not live)
 *   node scripts/backfill-product-weight-class.js --verify-only
 *
 * If no default id/name is passed, reads backend/reports/shipping-p0-baseline.json
 * (written by shipping-p0-baseline.js).
 *
 * Env: MONGODB_URI | MONGO_URI | MONGO_URL
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const Product = require('../models/Product');
const WeightClass = require('../models/WeightClass');

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function getArg(flag, fallback = '') {
  const idx = process.argv.findIndex((a) => a === flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] || fallback;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readDefaultFromP0Report() {
  const reportPath = path.join(__dirname, '../reports/shipping-p0-baseline.json');
  if (!fs.existsSync(reportPath)) return null;
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    return report?.defaultWeightClass || null;
  } catch (_) {
    return null;
  }
}

async function resolveDefaultWeightClass({ defaultId, defaultName }) {
  if (defaultId) {
    if (!mongoose.Types.ObjectId.isValid(defaultId)) {
      throw new Error(`Invalid --default-weight-class-id: ${defaultId}`);
    }
    const doc = await WeightClass.findById(defaultId);
    if (!doc) throw new Error(`Default WeightClass id not found: ${defaultId}`);
    if (!doc.active) throw new Error(`Default WeightClass is inactive: ${defaultId}`);
    return doc;
  }

  if (defaultName) {
    const doc = await WeightClass.findOne({
      name: { $regex: new RegExp(`^${escapeRegex(String(defaultName).trim())}$`, 'i') },
    });
    if (!doc) throw new Error(`Default WeightClass name not found: ${defaultName}`);
    if (!doc.active) throw new Error(`Default WeightClass is inactive: ${defaultName}`);
    return doc;
  }

  const fromReport = readDefaultFromP0Report();
  if (fromReport?.id) {
    const doc = await WeightClass.findById(fromReport.id);
    if (!doc) {
      throw new Error(
        `P0 report default WeightClass id not found in DB: ${fromReport.id}`
      );
    }
    if (!doc.active) {
      throw new Error(`P0 report default WeightClass is inactive: ${fromReport.id}`);
    }
    return doc;
  }

  throw new Error(
    'No default WeightClass. Pass --default-weight-class-id / --default-weight-class-name or run shipping-p0-baseline.js first.'
  );
}

function missingWeightClassFilter() {
  return {
    $or: [
      { weightClass: { $exists: false } },
      { weightClass: null },
    ],
  };
}

async function countCoverage() {
  const total = await Product.countDocuments({});
  const missing = await Product.countDocuments(missingWeightClassFilter());
  const assigned = total - missing;
  return { total, missing, assigned };
}

async function main() {
  const apply = hasFlag('--apply');
  const clear = hasFlag('--clear');
  const verifyOnly = hasFlag('--verify-only');
  const limit = Math.max(0, Number(getArg('--limit', '0')) || 0);
  const defaultId = getArg('--default-weight-class-id', '');
  const defaultName = getArg('--default-weight-class-name', '');

  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL;
  if (!uri) {
    console.error('Missing MongoDB URI. Set MONGODB_URI (or MONGO_URI / MONGO_URL).');
    process.exit(1);
  }

  console.log('Product weightClass Backfill (P2)');
  if (verifyOnly) {
    console.log('*** VERIFY ONLY ***');
  } else {
    console.log(apply ? '*** APPLY MODE (writes enabled) ***' : '*** DRY RUN (no writes) ***');
  }
  if (clear) {
    console.log('*** CLEAR MODE — will unset weightClass ***');
  }
  console.log('');

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15000,
  });

  const before = await countCoverage();
  console.log(`[P2] Products total: ${before.total}`);
  console.log(`[P2] Products with weightClass: ${before.assigned}`);
  console.log(`[P2] Products missing weightClass: ${before.missing}`);

  if (verifyOnly) {
    if (before.missing === 0) {
      console.log('\n[P2] VERIFY PASS — zero products missing weightClass.');
      await mongoose.disconnect();
      process.exit(0);
    }
    console.log('\n[P2] VERIFY FAIL — products still missing weightClass.');
    await mongoose.disconnect();
    process.exit(2);
  }

  if (clear) {
    const clearQuery = Product.find({
      weightClass: { $ne: null, $exists: true },
    }).select('_id');
    if (limit > 0) clearQuery.limit(limit);
    const clearTargets = await clearQuery.lean();

    console.log(`[P2] Would clear weightClass on ${clearTargets.length} products`);
    if (!apply) {
      console.log('[P2] DRY RUN complete. Re-run with --apply to clear.');
      await mongoose.disconnect();
      process.exit(0);
    }

    const result = await Product.updateMany(
      { _id: { $in: clearTargets.map((p) => p._id) } },
      { $unset: { weightClass: 1 } }
    );
    console.log(`[P2] Cleared weightClass. matched=${result.matchedCount} modified=${result.modifiedCount}`);
    const after = await countCoverage();
    console.log(`[P2] After clear — missing: ${after.missing}`);
    await mongoose.disconnect();
    process.exit(0);
  }

  const defaultClass = await resolveDefaultWeightClass({ defaultId, defaultName });
  console.log(
    `[P2] Default WeightClass: ${defaultClass._id} ("${defaultClass.name}")`
  );

  const findQuery = Product.find(missingWeightClassFilter()).select('_id name sku');
  if (limit > 0) findQuery.limit(limit);
  const targets = await findQuery.lean();

  console.log(`[P2] Targets to backfill this run: ${targets.length}`);
  for (const p of targets.slice(0, 15)) {
    console.log(`  - ${p._id}  sku=${p.sku || '-'}  name=${p.name || '-'}`);
  }
  if (targets.length > 15) {
    console.log(`  ... and ${targets.length - 15} more`);
  }

  if (!targets.length) {
    console.log('\n[P2] Nothing to backfill. Coverage already complete.');
    await mongoose.disconnect();
    process.exit(0);
  }

  if (!apply) {
    console.log('\n[P2] DRY RUN complete. Re-run with --apply to write.');
    await mongoose.disconnect();
    process.exit(0);
  }

  const result = await Product.updateMany(
    { _id: { $in: targets.map((p) => p._id) } },
    { $set: { weightClass: defaultClass._id } }
  );

  console.log(
    `[P2] Backfill applied. matched=${result.matchedCount} modified=${result.modifiedCount}`
  );

  const after = await countCoverage();
  console.log(`[P2] After — total=${after.total} assigned=${after.assigned} missing=${after.missing}`);

  if (after.missing !== 0) {
    console.log(
      '[P2] GATE INCOMPLETE — some products still missing weightClass (check --limit).'
    );
    await mongoose.disconnect();
    process.exit(2);
  }

  console.log('\n[P2] GATE PASS — zero products missing weightClass.');
  console.log(
    '[P2] Merchant note: default Shipping Slab was applied; sellers should review before engine cutover (P4).'
  );
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
