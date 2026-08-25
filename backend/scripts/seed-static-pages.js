/**
 * Seed StaticPageContent documents for CMS-enabled pages (pilot through Phase 4).
 * Usage:
 *   node backend/scripts/seed-static-pages.js
 *   node backend/scripts/seed-static-pages.js --force   (overwrite zones/seo from manifest)
 *   node backend/scripts/seed-static-pages.js --merge-zones   (add missing zone keys only)
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const StaticPageContent = require('../models/StaticPageContent');
const { CMS_SEED_PAGE_KEYS } = require('../config/staticPageRegistry');
const { getManifest } = require('../config/staticPageManifests');
const { getRegistryEntry } = require('../config/staticPageRegistry');

const forceReseed = process.argv.includes('--force');
const mergeZones = process.argv.includes('--merge-zones');

const zonesToObject = (zones) => {
  if (!zones) return {};
  if (zones instanceof Map) return Object.fromEntries(zones);
  return { ...zones };
};

const mergeManifestZones = (existingZones, manifestZones) => {
  const merged = zonesToObject(existingZones);
  for (const [key, value] of Object.entries(manifestZones || {})) {
    if (merged[key] === undefined) {
      merged[key] = value;
    }
  }
  return new Map(Object.entries(merged));
};

const buildSeedPayload = (pageKey, registry, manifest) => ({
  pageKey,
  slug: registry.slug,
  status: 'published',
  seo: {
    title: manifest.seoDefaults?.title || '',
    metaDescription: manifest.seoDefaults?.metaDescription || '',
  },
  zones: new Map(Object.entries(manifest.zoneDefaults || {})),
  publishedAt: new Date(),
});

const seed = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');
  if (forceReseed) {
    console.log('Force reseed: overwriting zones and seo from manifests for CMS-enabled pages.');
  }

  for (const pageKey of CMS_SEED_PAGE_KEYS) {
    const registry = getRegistryEntry(pageKey);
    const manifest = getManifest(pageKey);
    if (!registry || !manifest) {
      console.warn(`Skipping ${pageKey}: missing registry or manifest`);
      continue;
    }

    const existing = await StaticPageContent.findOne({ pageKey });
    const payload = buildSeedPayload(pageKey, registry, manifest);

    if (existing) {
      if (mergeZones && !forceReseed) {
        const before = zonesToObject(existing.zones);
        existing.zones = mergeManifestZones(existing.zones, manifest.zoneDefaults);
        const after = zonesToObject(existing.zones);
        const added = Object.keys(after).filter((k) => before[k] === undefined);
        await existing.save();
        console.log(
          `Merged zones: ${pageKey}${added.length ? ` (+${added.join(', ')})` : ' (no new keys)'}`
        );
        continue;
      }
      if (!forceReseed) {
        console.log(`Already exists: ${pageKey} (${existing.status})`);
        continue;
      }
      existing.slug = payload.slug;
      existing.status = payload.status;
      existing.seo = payload.seo;
      existing.zones = payload.zones;
      existing.publishedAt = payload.publishedAt;
      await existing.save();
      console.log(`Updated (force reseed): ${pageKey}`);
      continue;
    }

    await StaticPageContent.create(payload);
    console.log(`Created published StaticPageContent: ${pageKey}`);
  }

  await mongoose.disconnect();
  console.log('Done.');
};

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
