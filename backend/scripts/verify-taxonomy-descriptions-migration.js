/**
 * Audit taxonomy description fields after migration.
 * Reports records still stored as HTML/plain (not TipTap JSON).
 *
 * Run: node backend/scripts/verify-taxonomy-descriptions-migration.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('dotenv').config();

const mongoose = require('mongoose');
const Category = require('../models/Category');
const Subcategory = require('../models/Subcategory');
const ChildCategory = require('../models/ChildCategory');
const Translation = require('../models/Translation');
const { isStructuredContent } = require('../utils/contentGovernance');

const TAXONOMY_MODELS = ['Category', 'Subcategory', 'ChildCategory'];

function isLegacyDescription(value) {
  if (!value || !String(value).trim()) return false;
  return !isStructuredContent(String(value));
}

async function countLegacyDescriptions(Model, label) {
  const docs = await Model.find({ description: { $exists: true, $nin: [null, ''] } })
    .select('_id name slug description')
    .lean();
  const legacy = docs.filter((doc) => isLegacyDescription(doc.description));
  return { label, total: docs.length, legacy: legacy.length, samples: legacy.slice(0, 5) };
}

async function countLegacyTranslations() {
  const docs = await Translation.find({
    model: { $in: TAXONOMY_MODELS },
    'fields.description': { $exists: true, $nin: [null, ''] },
  })
    .select('model documentId locale fields')
    .lean();

  const legacy = docs.filter((doc) => isLegacyDescription(doc.fields?.description));
  return { label: 'Translation', total: docs.length, legacy: legacy.length, samples: legacy.slice(0, 5) };
}

async function run() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('MONGODB_URI (or MONGO_URI) is required');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);

  const reports = await Promise.all([
    countLegacyDescriptions(Category, 'Category'),
    countLegacyDescriptions(Subcategory, 'Subcategory'),
    countLegacyDescriptions(ChildCategory, 'ChildCategory'),
    countLegacyTranslations(),
  ]);

  let totalLegacy = 0;
  for (const report of reports) {
    totalLegacy += report.legacy;
    console.log(`${report.label}: ${report.legacy}/${report.total} non-JSON descriptions`);
    if (report.samples.length) {
      report.samples.forEach((sample) => {
        const id = sample._id || sample.documentId;
        console.log(`  - ${id}`);
      });
    }
  }

  await mongoose.disconnect();
  console.log(totalLegacy === 0 ? 'PASS: all taxonomy descriptions are TipTap JSON.' : `FAIL: ${totalLegacy} legacy descriptions remain.`);
  process.exit(totalLegacy === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
