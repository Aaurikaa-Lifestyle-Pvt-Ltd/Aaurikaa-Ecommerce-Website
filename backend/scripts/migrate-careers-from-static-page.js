/**
 * Migration Script: StaticPageContent jobSections → Career collection
 *
 * Idempotent via migrationSourceKey. Does NOT modify StaticPageContent.
 *
 * Run: node backend/scripts/migrate-careers-from-static-page.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('dotenv').config();

const mongoose = require('mongoose');
const slugify = require('slugify');
const StaticPageContent = require('../models/StaticPageContent');
const Career = require('../models/Career');
const Admin = require('../models/Admin');
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

async function resolveMigrationAdminId() {
  if (process.env.MIGRATION_ADMIN_ID) {
    const admin = await Admin.findById(process.env.MIGRATION_ADMIN_ID).select('_id').lean();
    if (admin) return admin._id;
    throw new Error(`MIGRATION_ADMIN_ID not found: ${process.env.MIGRATION_ADMIN_ID}`);
  }

  const admin = await Admin.findOne().sort({ createdAt: 1 }).select('_id email').lean();
  if (!admin) {
    throw new Error('No admin account found. Create an admin or set MIGRATION_ADMIN_ID.');
  }
  return admin._id;
}

async function migrate() {
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

    const adminId = await resolveMigrationAdminId();
    console.log(`👤 Migration audit admin: ${adminId}`);

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

    let created = 0;
    let skipped = 0;

    for (let index = 0; index < jobSections.length; index += 1) {
      const section = jobSections[index];
      const meta = FALLBACK_JOB_META[index] || FALLBACK_JOB_META[FALLBACK_JOB_META.length - 1];
      const normalized = normalizeJobSection(section, index, meta);

      if (existingKeys.has(normalized.migrationSourceKey)) {
        skipped += 1;
        console.log(`⏭️  [${index}] ${normalized.title} — already migrated`);
        continue;
      }

      const now = new Date();
      const career = new Career({
        ...normalized,
        createdBy: adminId,
        updatedBy: adminId,
        statusChangedBy: adminId,
        statusChangedAt: now,
        publishedAt: normalized.status === 'active' ? now : null,
        publishedBy: normalized.status === 'active' ? adminId : null,
      });

      await career.save();
      created += 1;
      console.log(`✅ [${index}] Created: ${normalized.title} (${normalized.slug}, ${normalized.status})`);
    }

    console.log('\n📋 Migration complete');
    console.log(`   Data source: ${source}`);
    console.log(`   Created: ${created}`);
    console.log(`   Skipped (idempotent): ${skipped}`);
    console.log(`   Total sections: ${jobSections.length}`);
    console.log('   StaticPageContent document was NOT modified.');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

migrate();
