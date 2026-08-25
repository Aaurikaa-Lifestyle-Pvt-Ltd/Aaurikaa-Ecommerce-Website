#!/usr/bin/env node
/**
 * Product slug backfill (SAFE):
 * - Default: DRY RUN (no writes)
 * - Apply writes only with explicit `--apply`
 *
 * Safety rules:
 * - Never overwrites existing non-empty slugs
 * - Updates only products where slug is missing/null/empty string
 * - Skips records that can't be repaired safely (e.g., missing name)
 * - Skips records where a unique slug cannot be generated within attempt budget
 *
 * Usage:
 *   node scripts/product-slug-backfill.js               # dry-run
 *   node scripts/product-slug-backfill.js --apply      # write mode (DANGEROUS)
 *   node scripts/product-slug-backfill.js --limit 500  # cap scan
 *   node scripts/product-slug-backfill.js --preview 20 # preview lines
 *
 * Env:
 * - Uses MONGODB_URI or MONGO_URI from backend/.env or process env
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const { generateUniqueSlug } = require('../utils/slugUtils');
const fs = require('fs');
const path = require('path');

function getArg(flag, fallback = '') {
  const idx = process.argv.findIndex((a) => a === flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] || fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function isMissingSlug(doc) {
  // Only targets the exact missing/empty cases.
  return doc.slug === undefined || doc.slug === null || doc.slug === '';
}

async function main() {
  const isApply = hasFlag('--apply');
  const limit = Math.max(1, Number(getArg('--limit', '5000')) || 5000);
  const preview = Math.max(0, Number(getArg('--preview', '15')) || 15);
  const outFile = getArg('--out', '');

  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('Missing MongoDB URI. Set MONGODB_URI (or MONGO_URI).');
    process.exit(1);
  }

  console.log('Product Slug Backfill');
  console.log(isApply ? '*** APPLY MODE (writes enabled) ***' : '*** DRY RUN (no writes) ***');
  console.log(`limit: ${limit}, preview: ${preview}\n`);

  await mongoose.connect(uri, {
    retryWrites: false,
    readPreference: 'secondaryPreferred',
    serverSelectionTimeoutMS: 15000,
  });

  // Fetch target docs (lean, minimal fields)
  const targets = await Product.find({
    $or: [
      { slug: { $exists: false } },
      { slug: null },
      { slug: '' },
    ],
  })
    .select('_id name slug')
    .limit(limit)
    .lean();

  const affected = targets.length;
  if (!affected) {
    console.log('No products missing slug. Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  // Seed taken slugs from DB to ensure uniqueness in proposals.
  const existingSlugs = await Product.find({ slug: { $exists: true, $ne: null, $ne: '' } })
    .select('slug')
    .lean();
  const taken = new Set(existingSlugs.map((d) => d.slug).filter(Boolean));

  let willUpdate = 0;
  let skippedMissingName = 0;
  let skippedExhausted = 0;
  let skippedUnexpected = 0;
  const previewLines = [];
  const skipped = [];
  const reportUpdates = [];
  const reportSkipped = [];

  // Prepare bulk updates (apply mode only)
  const bulkOps = [];

  for (const p of targets) {
    if (!isMissingSlug(p)) continue;

    const name = String(p.name || '').trim();
    if (!name) {
      skippedMissingName++;
      if (skipped.length < preview) skipped.push({ _id: String(p._id), reason: 'missing_name' });
      reportSkipped.push({ _id: String(p._id), reason: 'missing_name', name: p.name ?? null });
      continue;
    }

    const gen = generateUniqueSlug({ input: name, taken });
    if (!gen.ok || !gen.slug) {
      skippedExhausted++;
      if (skipped.length < preview) skipped.push({ _id: String(p._id), reason: gen.reason || 'slug_generation_failed' });
      reportSkipped.push({ _id: String(p._id), reason: gen.reason || 'slug_generation_failed', name: p.name ?? null });
      continue;
    }

    willUpdate++;
    reportUpdates.push({
      _id: String(p._id),
      name: p.name ?? null,
      before: p.slug ?? null,
      after: gen.slug,
      attempts: gen.attempts ?? null,
    });
    if (previewLines.length < preview) {
      previewLines.push({
        _id: String(p._id),
        name: p.name,
        before: p.slug,
        after: gen.slug,
      });
    }

    if (isApply) {
      bulkOps.push({
        updateOne: {
          filter: { _id: p._id, $or: [{ slug: { $exists: false } }, { slug: null }, { slug: '' }] },
          update: { $set: { slug: gen.slug } },
        },
      });
    }
  }

  console.log('Summary');
  console.log(`- scanned_missing_slug (capped): ${affected}`);
  console.log(`- would_update: ${willUpdate}`);
  console.log(`- skipped_missing_name: ${skippedMissingName}`);
  console.log(`- skipped_exhausted_attempts: ${skippedExhausted}`);
  console.log(`- skipped_unexpected: ${skippedUnexpected}\n`);

  if (previewLines.length) {
    console.log('Preview (before → after)');
    for (const row of previewLines) {
      console.log(`- ${row._id}: ${(row.before ?? '∅')} → ${row.after}`);
    }
    console.log('');
  }

  if (skipped.length) {
    console.log('Skipped (sample)');
    for (const s of skipped) {
      console.log(`- ${s._id}: ${s.reason}`);
    }
    console.log('');
  }

  if (!isApply) {
    console.log('DRY RUN complete. Re-run with `--apply` to write updates.');
    if (outFile) {
      const outPath = path.isAbsolute(outFile)
        ? outFile
        : path.resolve(process.cwd(), outFile);
      const payload = {
        mode: 'dry-run',
        generatedAt: new Date().toISOString(),
        limit,
        preview,
        summary: {
          scannedMissingSlugCapped: affected,
          wouldUpdate: willUpdate,
          skippedMissingName,
          skippedExhaustedAttempts: skippedExhausted,
          skippedUnexpected,
        },
        updates: reportUpdates,
        skipped: reportSkipped,
      };
      fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
      console.log(`Wrote report: ${outPath}`);
    }
    await mongoose.disconnect();
    return;
  }

  console.log(`Applying ${bulkOps.length} updates...`);
  if (bulkOps.length === 0) {
    console.log('No updates to apply.');
    await mongoose.disconnect();
    return;
  }

  const result = await Product.bulkWrite(bulkOps, { ordered: false });
  console.log('Apply results');
  console.log(`- matched: ${result.matchedCount}`);
  console.log(`- modified: ${result.modifiedCount}`);
  console.log(`- upserted: ${result.upsertedCount}\n`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Backfill script failed:', err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});

