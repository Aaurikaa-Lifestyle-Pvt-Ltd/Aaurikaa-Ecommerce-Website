#!/usr/bin/env node
/**
 * One-time migration: taxonomy description fields (HTML/plain) → TipTap JSON.
 *
 * Usage:
 *   node backend/scripts/migrate-taxonomy-descriptions-to-tiptap.js [--dry-run] [--force] [--limit=N] [--backup-dir=path]
 *
 * Scope: Category, Subcategory, ChildCategory + Translation overlay description fields.
 */
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config();

const mongoose = require('mongoose');
const Category = require('../models/Category');
const Subcategory = require('../models/Subcategory');
const ChildCategory = require('../models/ChildCategory');
const Translation = require('../models/Translation');
const { isStructuredContent } = require('../utils/contentGovernance');
const { normalizeTaxonomyDescriptionForStorage } = require('../utils/taxonomyDescriptionFormat');

const TAXONOMY_MODELS = ['Category', 'Subcategory', 'ChildCategory'];

function parseArgs(argv) {
  const opts = {
    dryRun: false,
    force: false,
    limit: Infinity,
    backupDir: path.join(__dirname, '../../backups'),
  };

  for (const arg of argv) {
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--force') opts.force = true;
    else if (arg.startsWith('--limit=')) opts.limit = Number(arg.split('=')[1]) || Infinity;
    else if (arg.startsWith('--backup-dir=')) opts.backupDir = path.resolve(arg.split('=').slice(1).join('='));
  }

  return opts;
}

function needsMigration(value) {
  if (!value || !String(value).trim()) return false;
  return !isStructuredContent(String(value));
}

function ensureBackupDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function appendBackupLine(stream, record) {
  stream.write(`${JSON.stringify(record)}\n`);
}

async function migrateEntityDescription(entity, modelName, stats, backupStream, opts) {
  const original = entity.description;
  if (!needsMigration(original)) {
    stats.skipped += 1;
    return;
  }

  const converted = normalizeTaxonomyDescriptionForStorage(original);
  if (!converted || isStructuredContent(original)) {
    stats.skipped += 1;
    return;
  }

  appendBackupLine(backupStream, {
    type: 'taxonomy',
    model: modelName,
    id: String(entity._id),
    field: 'description',
    before: original,
    after: converted,
  });

  if (!opts.dryRun) {
    entity.description = converted;
    await entity.save();
  }

  stats.migrated += 1;
}

async function migrateTranslationDescription(doc, stats, backupStream, opts) {
  if (!TAXONOMY_MODELS.includes(doc.model)) {
    stats.skipped += 1;
    return;
  }

  const fields = doc.fields && typeof doc.fields === 'object' ? doc.fields : {};
  const original = fields.description;
  if (!needsMigration(original)) {
    stats.skipped += 1;
    return;
  }

  const converted = normalizeTaxonomyDescriptionForStorage(original);

  appendBackupLine(backupStream, {
    type: 'translation',
    model: doc.model,
    id: String(doc._id),
    documentId: String(doc.documentId),
    locale: doc.locale,
    field: 'description',
    before: original,
    after: converted,
  });

  if (!opts.dryRun) {
    doc.fields = { ...fields, description: converted };
    doc.markModified('fields');
    await doc.save();
  }

  stats.migrated += 1;
}

async function run() {
  const opts = parseArgs(process.argv.slice(2));
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

  if (!mongoUri) {
    console.error('MONGODB_URI (or MONGO_URI) is required');
    process.exit(1);
  }

  if (!opts.dryRun && !opts.force) {
    console.error('Live run requires --force. Use --dry-run to preview changes.');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log(`Connected to MongoDB (${opts.dryRun ? 'DRY RUN' : 'LIVE'})`);

  ensureBackupDir(opts.backupDir);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(opts.backupDir, `taxonomy-descriptions-${timestamp}.jsonl`);
  const backupStream = fs.createWriteStream(backupPath, { flags: 'a' });
  console.log(`Backup: ${backupPath}`);

  const stats = { migrated: 0, skipped: 0, errors: 0 };
  let processed = 0;

  const collections = [
    { Model: Category, name: 'Category' },
    { Model: Subcategory, name: 'Subcategory' },
    { Model: ChildCategory, name: 'ChildCategory' },
  ];

  for (const { Model, name } of collections) {
    const cursor = Model.find({ description: { $exists: true, $nin: [null, ''] } }).cursor();
    for await (const entity of cursor) {
      if (processed >= opts.limit) break;
      const original = entity.description;
      if (!needsMigration(original)) continue;
      try {
        await migrateEntityDescription(entity, name, stats, backupStream, opts);
        processed += 1;
      } catch (err) {
        stats.errors += 1;
        console.error(`[${name}:${entity._id}] ${err.message}`);
      }
    }
    if (processed >= opts.limit) break;
  }

  if (processed < opts.limit) {
    const translationCursor = Translation.find({
      model: { $in: TAXONOMY_MODELS },
      'fields.description': { $exists: true, $nin: [null, ''] },
    }).cursor();

    for await (const doc of translationCursor) {
      if (processed >= opts.limit) break;
      const before = doc.fields?.description;
      if (!needsMigration(before)) continue;
      try {
        await migrateTranslationDescription(doc, stats, backupStream, opts);
        processed += 1;
      } catch (err) {
        stats.errors += 1;
        console.error(`[Translation:${doc._id}] ${err.message}`);
      }
    }
  }

  backupStream.end();
  await mongoose.disconnect();

  console.log('Migration complete:', stats);
  if (opts.dryRun) {
    console.log('No documents were modified (dry run).');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
