/**
 * Backfill displayOrder on Slider documents (0-based consecutive integers).
 *
 * Preserves current visual order: newest first (createdAt DESC, _id ASC).
 *
 * Usage:
 *   node backend/scripts/backfill-slider-display-order.js --dry-run
 *   node backend/scripts/backfill-slider-display-order.js
 *   node backend/scripts/backfill-slider-display-order.js --force
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
require('dotenv').config();

const mongoose = require('mongoose');
const Slider = require('../models/Slider');

const SLIDER_LEGACY_SORT = { createdAt: -1, _id: 1 };

function parseFlags(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
    force: argv.includes('--force'),
  };
}

function needsUpdate(slider, force) {
  if (force) return true;
  return slider.displayOrder === undefined || slider.displayOrder === null;
}

async function backfill() {
  const { dryRun, force } = parseFlags(process.argv.slice(2));

  const mongoUri =
    process.argv.find((arg) => arg.startsWith('mongodb')) ||
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    process.env.MONGO_URL;

  if (!mongoUri) {
    console.error('MongoDB URI not found. Set MONGODB_URI or pass URI as argument.');
    process.exit(1);
  }

  console.log(`Mode: ${dryRun ? 'DRY-RUN (no writes)' : 'LIVE'}${force ? ' (force overwrite)' : ''}`);

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  const sliders = await Slider.collection
    .find({})
    .sort(SLIDER_LEGACY_SORT)
    .toArray();

  if (sliders.length === 0) {
    console.log('No sliders found. Nothing to do.');
    await mongoose.disconnect();
    process.exit(0);
  }

  const planned = sliders.map((slider, index) => ({
    id: slider._id,
    heading: slider.heading || '(no heading)',
    currentDisplayOrder: slider.displayOrder,
    newDisplayOrder: index,
    willUpdate: needsUpdate(slider, force),
  }));

  console.log('\nPlanned order:');
  planned.forEach((row) => {
    const action = row.willUpdate ? `-> ${row.newDisplayOrder}` : '(skip)';
    console.log(
      `  [${row.newDisplayOrder}] ${row.id} "${row.heading}" displayOrder=${row.currentDisplayOrder ?? 'missing'} ${action}`
    );
  });

  const toUpdate = planned.filter((row) => row.willUpdate);

  if (dryRun) {
    console.log(`\nDry-run summary: would update ${toUpdate.length} of ${sliders.length} slider(s).`);
    await mongoose.disconnect();
    process.exit(0);
  }

  let updated = 0;
  for (const row of toUpdate) {
    await Slider.collection.updateOne(
      { _id: row.id },
      { $set: { displayOrder: row.newDisplayOrder } }
    );
    updated += 1;
  }

  console.log(`\nUpdated ${updated} slider(s). Skipped ${sliders.length - updated}.`);

  const preview = await Slider.find()
    .sort({ displayOrder: 1, createdAt: -1, _id: 1 })
    .select('heading displayOrder createdAt')
    .lean();

  console.log('\nFinal order preview:');
  preview.forEach((s) => {
    console.log(`  displayOrder=${s.displayOrder} "${s.heading}"`);
  });

  await mongoose.disconnect();
  process.exit(0);
}

backfill().catch((err) => {
  console.error('Backfill failed:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
