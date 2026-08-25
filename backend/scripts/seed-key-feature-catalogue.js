/**
 * Seed / re-sync Key Feature Catalogue from baseline JSON.
 *
 * Usage: node scripts/seed-key-feature-catalogue.js
 */
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { seedCatalogueFromBaseline } = require('../utils/keyFeatureCatalogueService');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is required');
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');
  const result = await seedCatalogueFromBaseline();
  console.log('Key feature catalogue seed complete:', result);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
