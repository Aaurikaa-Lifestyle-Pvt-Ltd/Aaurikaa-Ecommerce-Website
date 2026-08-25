/**
 * DRY-RUN Migration Script: StaticPageContent jobSections → Career collection
 *
 * ⚠️  THIS IS A DRY-RUN — NO CHANGES WILL BE MADE TO THE DATABASE ⚠️
 *
 * Run: node backend/scripts/migrate-careers-from-static-page-dryrun.js
 *
 * After reviewing output, execute migration in Phase H6:
 * node backend/scripts/migrate-careers-from-static-page.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('dotenv').config();

const mongoose = require('mongoose');
const slugify = require('slugify');
const StaticPageContent = require('../models/StaticPageContent');
const Career = require('../models/Career');
const { paragraphSection } = require('../utils/staticPageSectionBuilders');

const FALLBACK_JOB_SECTIONS = [
  paragraphSection(
    'Frontend Developer',
    'Work with React, Next.js, Tailwind CSS to build scalable ecommerce features.'
  ),
  paragraphSection(
    'Customer Support Executive',
    'Assist customers, resolve queries, and ensure great shopping experience.'
  ),
  paragraphSection(
    'Marketing Intern',
    'Support digital campaigns, social media & growth initiatives.'
  ),
];

const FALLBACK_JOB_META = [
  { location: 'Remote / India', type: 'Full-Time', active: true },
  { location: 'West Bengal, India', type: 'Full-Time', active: false },
  { location: 'Remote', type: 'Internship', active: true },
];

const EMPLOYMENT_TYPE_MAP = {
  'full-time': 'full_time',
  'part-time': 'part_time',
  contract: 'contract',
  internship: 'internship',
};

function zonesMapToObject(zones) {
  if (!zones) return {};
  if (zones instanceof Map) return Object.fromEntries(zones);
  if (typeof zones === 'object') return { ...zones };
  return {};
}

function parseTitleParts(title) {
  const parts = String(title || '').split(' — ').map((p) => p.trim());
  if (parts.length >= 3) {
    return {
      title: parts[0],
      location: parts[1],
      employmentLabel: parts[2],
    };
  }
  return { title: String(title || '').trim(), location: '', employmentLabel: '' };
}

function mapEmploymentType(label) {
  const key = String(label || '').trim().toLowerCase();
  return EMPLOYMENT_TYPE_MAP[key] || 'other';
}

function buildMigrationSourceKey(index) {
  return `static-page:careers:index:${index}`;
}

function buildSlug(title, index) {
  const base = slugify(String(title), { lower: true, strict: true }) || `career-${index}`;
  return `${base}-m${index}`;
}

function normalizeJobSection(section, index, meta) {
  const parsed = parseTitleParts(section.title);
  const location = meta?.location || parsed.location || '';
  const employmentType = mapEmploymentType(meta?.type || parsed.employmentLabel);
  const status = meta?.active === false ? 'inactive' : 'active';

  return {
    migrationSourceKey: buildMigrationSourceKey(index),
    title: parsed.title || section.title,
    description: section.bodyRichText,
    location,
    employmentType,
    status,
    displayOrder: index * 10,
    slug: buildSlug(parsed.title || section.title, index),
  };
}

async function dryRun() {
  const mongoUri = process.argv[2]
    || process.env.MONGODB_URI
    || process.env.MONGO_URI
    || process.env.MONGO_URL;

  if (!mongoUri) {
    console.error('❌ MongoDB URI not found. Set MONGODB_URI or pass as first argument.');
    process.exit(1);
  }

  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected');
    console.log('🔍 DRY-RUN MODE: No writes will be performed\n');

    const staticPage = await StaticPageContent.findOne({ pageKey: 'careers' }).lean();
    const zones = zonesMapToObject(staticPage?.zones);
    let jobSections = Array.isArray(zones.jobSections) ? zones.jobSections : [];

    let source = 'StaticPageContent.zones.jobSections';
    if (jobSections.length === 0) {
      jobSections = FALLBACK_JOB_SECTIONS;
      source = 'phase4Fallbacks (CMS zone empty)';
      console.log('ℹ️  CMS jobSections empty — using fallback reference data\n');
    } else {
      console.log(`📄 Found careers StaticPageContent with ${jobSections.length} job section(s)\n`);
    }

    const existingMigrated = await Career.find({
      migrationSourceKey: { $regex: /^static-page:careers:index:/ },
    }).select('migrationSourceKey slug title status').lean();

    const existingKeys = new Set(existingMigrated.map((c) => c.migrationSourceKey));

    console.log(`📊 Existing migrated careers: ${existingMigrated.length}`);
    if (existingMigrated.length > 0) {
      existingMigrated.forEach((c) => {
        console.log(`   • ${c.migrationSourceKey} → ${c.slug} (${c.status})`);
      });
      console.log('');
    }

    const wouldCreate = [];
    const wouldSkip = [];

    jobSections.forEach((section, index) => {
      const meta = FALLBACK_JOB_META[index] || FALLBACK_JOB_META[FALLBACK_JOB_META.length - 1];
      const normalized = normalizeJobSection(section, index, meta);
      const key = normalized.migrationSourceKey;

      if (existingKeys.has(key)) {
        wouldSkip.push({ index, key, title: normalized.title, reason: 'migrationSourceKey exists' });
      } else {
        wouldCreate.push({ index, source, ...normalized });
      }
    });

    console.log(`✅ Would CREATE: ${wouldCreate.length}`);
    wouldCreate.forEach((item) => {
      console.log(`   [${item.index}] ${item.title}`);
      console.log(`       key: ${item.migrationSourceKey}`);
      console.log(`       slug: ${item.slug}`);
      console.log(`       status: ${item.status} | location: ${item.location || '—'} | type: ${item.employmentType}`);
      console.log(`       displayOrder: ${item.displayOrder}`);
    });

    console.log(`\n⏭️  Would SKIP (idempotent): ${wouldSkip.length}`);
    wouldSkip.forEach((item) => {
      console.log(`   [${item.index}] ${item.title} — ${item.reason}`);
    });

    console.log('\n📋 Sort preview (displayOrder ASC, createdAt DESC, _id ASC):');
    const previewSort = [...wouldCreate].sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
      return a.index - b.index;
    });
    previewSort.forEach((item, rank) => {
      console.log(`   ${rank + 1}. ${item.title} (displayOrder=${item.displayOrder})`);
    });

    const duplicateOrders = {};
    wouldCreate.forEach((item) => {
      duplicateOrders[item.displayOrder] = (duplicateOrders[item.displayOrder] || 0) + 1;
    });
    const dupes = Object.entries(duplicateOrders).filter(([, count]) => count > 1);
    if (dupes.length > 0) {
      console.log('\nℹ️  Duplicate displayOrder values (tie-break: createdAt DESC, _id ASC):');
      dupes.forEach(([order, count]) => console.log(`   displayOrder ${order}: ${count} jobs`));
    }

    console.log('\n✅ Dry-run complete. StaticPageContent document was NOT modified.');
    console.log(`   Data source: ${source}`);
    console.log(`   Total sections processed: ${jobSections.length}`);
  } catch (err) {
    console.error('❌ Dry-run failed:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

dryRun();
