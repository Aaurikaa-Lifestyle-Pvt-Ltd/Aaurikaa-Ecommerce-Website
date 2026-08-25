/**
 * Migration Script: Add sectionType to existing HomepageCategoryConfig records
 * 
 * This script assigns sectionType to existing homepage category configurations:
 * - Front Page Category sections: top-electronics, fashion-forward, sports-comfort, beauty-wellness
 * - Two-Row Category sections: home-essentials, furniture-lifestyle, toys-games, 
 *   grocery-staples, apparels-accessories, footwear-personal-care
 * 
 * Run: node backend/scripts/migrate-homepage-categories.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const HomepageCategoryConfig = require('../models/HomepageCategoryConfig');

// Define section mappings
const FRONT_PAGE_SECTIONS = [
  'top-electronics',
  'fashion-forward',
  'sports-comfort',
  'beauty-wellness',
  'apparels', // Legacy section name (should be migrated to fashion-forward)
];

const TWO_ROW_SECTIONS = [
  'home-essentials',
  'furniture-lifestyle',
  'toys-games',
  'grocery-staples',
  'apparels-accessories',
  'footwear-personal-care',
];

async function migrate() {
  try {
    // Connect to MongoDB - check command line arg first, then env vars
    const mongoUri = process.argv[2] || process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL;
    
    if (!mongoUri) {
      console.error('❌ Error: MongoDB URI not found.');
      console.error('   Usage: node migrate-homepage-categories.js "your-connection-string"');
      console.error('   Or set MONGODB_URI environment variable');
      process.exit(1);
    }
    
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Find all existing configs - use lean() to get raw documents without schema defaults
    const configs = await HomepageCategoryConfig.find({}).lean();
    console.log(`📊 Found ${configs.length} existing configurations`);

    let updated = 0;
    let skipped = 0;

    for (const config of configs) {
      // Check if sectionType actually exists in database (not just schema default)
      const hasSectionType = config.sectionType !== undefined && config.sectionType !== null;
      
      // Skip if sectionType already exists and is valid
      if (hasSectionType && (config.sectionType === 'front-page' || config.sectionType === 'two-row')) {
        console.log(`⏭️  Skipping ${config.sectionName} - already has sectionType: ${config.sectionType}`);
        skipped++;
        continue;
      }

      let sectionType = null;

      // Determine sectionType based on sectionName
      if (FRONT_PAGE_SECTIONS.includes(config.sectionName)) {
        sectionType = 'front-page';
      } else if (TWO_ROW_SECTIONS.includes(config.sectionName)) {
        sectionType = 'two-row';
      } else {
        // Default to front-page for unknown sections
        console.log(`⚠️  Unknown section "${config.sectionName}", defaulting to 'front-page'`);
        sectionType = 'front-page';
      }

      // Update the config directly in database (since we used lean())
      await HomepageCategoryConfig.updateOne(
        { _id: config._id },
        { $set: { sectionType: sectionType } }
      );
      console.log(`✅ Updated ${config.sectionName} → sectionType: ${sectionType}`);
      updated++;
    }

    console.log('\n📈 Migration Summary:');
    console.log(`   ✅ Updated: ${updated}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   📊 Total: ${configs.length}`);

    // Verify migration
    const frontPageCount = await HomepageCategoryConfig.countDocuments({ sectionType: 'front-page' });
    const twoRowCount = await HomepageCategoryConfig.countDocuments({ sectionType: 'two-row' });
    console.log('\n🔍 Verification:');
    console.log(`   Front Page sections: ${frontPageCount}`);
    console.log(`   Two-Row sections: ${twoRowCount}`);

    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run migration
migrate();

