/**
 * Point N — Production footer legacy URL migration
 *
 * Surgically updates only footer links confirmed by Phase 0 audit:
 *   /order-tracking → /orders
 *   /order-history  → /orders
 *
 * Does NOT overwrite other footer columns or links (production differs from seed).
 * Run once after Phase 1 redirects are verified in staging/production:
 *   node scripts/migrate-point-n-footer-links.js
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const SiteSettings = require('../models/SiteSettings');

const LEGACY_URL_MAP = {
  '/order-tracking': '/orders',
  '/order-history': '/orders',
};

const migrateFooterLinks = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const settings = await SiteSettings.findOne().sort({ createdAt: 1 });
    if (!settings?.footer?.columns?.length) {
      console.log('No footer settings found — nothing to migrate');
      process.exit(0);
    }

    let updatedCount = 0;
    for (const column of settings.footer.columns) {
      if (!Array.isArray(column.links)) continue;
      for (const link of column.links) {
        const nextUrl = LEGACY_URL_MAP[link.url];
        if (nextUrl) {
          console.log(`  ${link.label}: ${link.url} → ${nextUrl}`);
          link.url = nextUrl;
          updatedCount += 1;
        }
      }
    }

    if (updatedCount === 0) {
      console.log('No legacy footer URLs found — footer already migrated or customized');
      process.exit(0);
    }

    settings.markModified('footer');
    await settings.save();
    console.log(`✅ Updated ${updatedCount} footer link(s)`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  }
};

migrateFooterLinks();
