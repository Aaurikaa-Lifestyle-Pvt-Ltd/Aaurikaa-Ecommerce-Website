/**
 * Migration Script: Add displayTitle field to existing HomepageCategoryConfig records
 * 
 * This script:
 * 1. Ensures all existing records have the displayTitle field (sets to empty string if missing)
 * 2. Optionally populates default titles based on sectionName (if you want to pre-fill them)
 * 
 * Run: node backend/scripts/migrate-display-titles.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const HomepageCategoryConfig = require('../models/HomepageCategoryConfig');

// Default titles mapping (optional - only used if you want to pre-populate titles)
const DEFAULT_TITLES = {
  'top-electronics': 'Top Electronics: Gadgets And Gear',
  'fashion-forward': 'Fashion Forward: Trendy Apparels',
  'sports-comfort': 'Sports Comfort & Style: Quality Clothing',
  'beauty-wellness': 'Beauty & Wellness: Cosmetics and Health Essentials',
  'home-essentials': 'Home Essentials',
  'furniture-lifestyle': 'Furniture & Lifestyle',
  'toys-games': 'Toys & Games',
  'grocery-staples': 'Grocery & Staples',
  'apparels-accessories': 'Apparels & Accessories',
  'footwear-personal-care': 'Footwear & Personal Care',
  'apparels': 'Fashion Forward: Trendy Apparels', // Legacy section
};

async function migrate() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/your-database';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Find all existing configs
    const configs = await HomepageCategoryConfig.find({});
    console.log(`📊 Found ${configs.length} existing configurations`);

    let updated = 0;
    let skipped = 0;
    let populated = 0;

    for (const config of configs) {
      let needsUpdate = false;
      let updateData = {};

      // Check if displayTitle field is missing or null
      if (!config.displayTitle || config.displayTitle === null || config.displayTitle === undefined) {
        // Option 1: Set to empty string (recommended - let admins set titles manually)
        updateData.displayTitle = '';
        needsUpdate = true;
        
        // Option 2: Pre-populate with default title (uncomment if you want this)
        // const defaultTitle = DEFAULT_TITLES[config.sectionName];
        // if (defaultTitle) {
        //   updateData.displayTitle = defaultTitle;
        //   populated++;
        // } else {
        //   updateData.displayTitle = '';
        // }
        // needsUpdate = true;
      }

      if (needsUpdate) {
        config.displayTitle = updateData.displayTitle;
        await config.save();
        console.log(`✅ Updated ${config.sectionName} (${config.sectionType}) - displayTitle: "${updateData.displayTitle || '(empty)'}"`);
        updated++;
      } else {
        console.log(`⏭️  Skipping ${config.sectionName} (${config.sectionType}) - already has displayTitle: "${config.displayTitle}"`);
        skipped++;
      }
    }

    console.log('\n📈 Migration Summary:');
    console.log(`   ✅ Updated: ${updated}`);
    if (populated > 0) {
      console.log(`   📝 Pre-populated with defaults: ${populated}`);
    }
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   📊 Total: ${configs.length}`);

    // Verify migration
    const withTitle = await HomepageCategoryConfig.countDocuments({ 
      displayTitle: { $exists: true, $ne: null } 
    });
    console.log('\n🔍 Verification:');
    console.log(`   Records with displayTitle field: ${withTitle}/${configs.length}`);

    console.log('\n✅ Migration completed successfully!');
    console.log('\n💡 Note: Admins can now edit titles in the admin panel.');
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

