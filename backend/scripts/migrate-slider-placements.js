/**
 * Migrate legacy Slider homepage slots to placement + per-section displayOrder.
 *
 * Mapping (preserves IDs / images / copy):
 *   displayOrder 1 → placement=hero,   displayOrder=1
 *   displayOrder 2 → placement=promo1, displayOrder=1
 *   displayOrder 3 → placement=promo2, displayOrder=1
 *
 * Ambiguous rows (any other displayOrder, or already conflicting) are REPORTED
 * and left unchanged — no invented placement.
 *
 * Does NOT copy desktop image → mobileImage.
 *
 * Usage:
 *   node backend/scripts/migrate-slider-placements.js --dry-run
 *   node backend/scripts/migrate-slider-placements.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
require('dotenv').config();

const mongoose = require('mongoose');
const Slider = require('../models/Slider');

const SLOT_MAP = {
  1: { placement: 'hero', displayOrder: 1 },
  2: { placement: 'promo1', displayOrder: 1 },
  3: { placement: 'promo2', displayOrder: 1 },
};

function parseFlags(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
  };
}

async function migrate() {
  const { dryRun } = parseFlags(process.argv.slice(2));

  const mongoUri =
    process.argv.find((arg) => arg.startsWith('mongodb')) ||
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    process.env.MONGO_URL;

  if (!mongoUri) {
    console.error('MongoDB URI not found. Set MONGODB_URI or pass URI as argument.');
    process.exit(1);
  }

  console.log(`Mode: ${dryRun ? 'DRY-RUN (no writes)' : 'LIVE'}`);

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  const sliders = await Slider.collection.find({}).sort({ displayOrder: 1, createdAt: 1 }).toArray();

  if (sliders.length === 0) {
    console.log('No sliders found. Nothing to do.');
    await mongoose.disconnect();
    process.exit(0);
  }

  const planned = [];
  const ambiguous = [];
  const skippedAlreadyPlaced = [];

  for (const slider of sliders) {
    const id = String(slider._id);
    const order = slider.displayOrder;
    const heading = slider.heading || '(no heading)';

    if (slider.placement && ['hero', 'promo1', 'promo2'].includes(slider.placement)) {
      skippedAlreadyPlaced.push({
        id,
        heading,
        placement: slider.placement,
        displayOrder: order,
        reason: 'already has placement',
      });
      continue;
    }

    const mapped = SLOT_MAP[order];
    if (!mapped) {
      ambiguous.push({
        id,
        heading,
        displayOrder: order,
        isActive: slider.isActive,
        reason: `displayOrder ${order} is not in {1,2,3} — placement not invented`,
      });
      continue;
    }

    planned.push({
      id: slider._id,
      heading,
      from: { displayOrder: order, placement: slider.placement ?? null },
      to: mapped,
      hasMobileImage: Boolean(slider.mobileImage),
      isActive: slider.isActive,
    });
  }

  console.log('\n=== Will migrate ===');
  if (planned.length === 0) {
    console.log('  (none)');
  } else {
    planned.forEach((row) => {
      console.log(
        `  ${row.id} "${row.heading}" displayOrder ${row.from.displayOrder} → ${row.to.placement} / order ${row.to.displayOrder}` +
          (row.isActive && !row.hasMobileImage ? ' [WARN: active, no mobileImage]' : '')
      );
    });
  }

  console.log('\n=== Ambiguous (skipped — no invented placement) ===');
  if (ambiguous.length === 0) {
    console.log('  (none)');
  } else {
    ambiguous.forEach((row) => {
      console.log(`  ${row.id} "${row.heading}" displayOrder=${row.displayOrder} active=${row.isActive} — ${row.reason}`);
    });
  }

  console.log('\n=== Already placed (skipped) ===');
  if (skippedAlreadyPlaced.length === 0) {
    console.log('  (none)');
  } else {
    skippedAlreadyPlaced.forEach((row) => {
      console.log(`  ${row.id} "${row.heading}" ${row.placement}/${row.displayOrder}`);
    });
  }

  if (dryRun) {
    console.log(
      `\nDry-run summary: would migrate ${planned.length}, skip ambiguous ${ambiguous.length}, skip already-placed ${skippedAlreadyPlaced.length}.`
    );
    await mongoose.disconnect();
    process.exit(ambiguous.length > 0 ? 2 : 0);
  }

  let updated = 0;
  for (const row of planned) {
    await Slider.collection.updateOne(
      { _id: row.id },
      {
        $set: {
          placement: row.to.placement,
          displayOrder: row.to.displayOrder,
        },
      }
    );
    updated += 1;
  }

  console.log(`\nMigrated ${updated} slider(s). Ambiguous left unchanged: ${ambiguous.length}.`);

  const preview = await Slider.find()
    .sort({ placement: 1, displayOrder: 1, createdAt: -1 })
    .select('heading placement displayOrder isActive mobileImage')
    .lean();

  console.log('\nFinal preview:');
  preview.forEach((s) => {
    console.log(
      `  placement=${s.placement ?? '(unset)'} order=${s.displayOrder} active=${s.isActive} mobile=${s.mobileImage ? 'yes' : 'no'} "${s.heading}"`
    );
  });

  await mongoose.disconnect();
  process.exit(ambiguous.length > 0 ? 2 : 0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
