/**
 * DRY-RUN Migration Script: Add sectionType to existing HomepageCategoryConfig records
 * 
 * ⚠️  THIS IS A DRY-RUN - NO CHANGES WILL BE MADE TO THE DATABASE ⚠️
 * 
 * This script shows what would be changed:
 * - Front Page Category sections: top-electronics, fashion-forward, sports-comfort, beauty-wellness
 * - Two-Row Category sections: home-essentials, furniture-lifestyle, toys-games, 
 *   grocery-staples, apparels-accessories, footwear-personal-care
 * 
 * Run: node backend/scripts/migrate-homepage-categories-dryrun.js
 * 
 * After reviewing the output, run the actual migration:
 * node backend/scripts/migrate-homepage-categories.js
 */

// Try loading .env from multiple possible locations
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
require('dotenv').config(); // Also try current directory
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

async function dryRun() {
  try {
    // Debug: Check what env vars are available (without showing sensitive data)
    const hasMongoDbUri = !!process.env.MONGODB_URI;
    const hasMongoUri = !!process.env.MONGO_URI;
    const hasMongoUrl = !!process.env.MONGO_URL;
    
    // Connect to MongoDB - check command line arg first, then env vars
    const mongoUri = process.argv[2] || process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL;
    
    if (!mongoUri) {
      console.error('❌ Error: MongoDB URI not found.');
      console.error('');
      console.error('   Environment check:');
      console.error(`   - MONGODB_URI: ${hasMongoDbUri ? '✅ found' : '❌ not found'}`);
      console.error(`   - MONGO_URI: ${hasMongoUri ? '✅ found' : '❌ not found'}`);
      console.error(`   - MONGO_URL: ${hasMongoUrl ? '✅ found' : '❌ not found'}`);
      console.error('');
      console.error('   Usage options:');
      console.error('   1. Set environment variable:');
      console.error('      MONGODB_URI="your-connection-string" node migrate-homepage-categories-dryrun.js');
      console.error('');
      console.error('   2. Pass as argument:');
      console.error('      node migrate-homepage-categories-dryrun.js "your-connection-string"');
      console.error('');
      console.error('   3. Create .env file in project root with:');
      console.error('      MONGODB_URI=your-connection-string');
      process.exit(1);
    }
    
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
    console.log('🔍 DRY-RUN MODE: No changes will be saved\n');

    // Find all existing configs
    const configs = await HomepageCategoryConfig.find({});
    console.log(`📊 Found ${configs.length} existing configurations\n`);

    let wouldUpdate = 0;
    let wouldSkip = 0;
    const changes = [];

    for (const config of configs) {
      // Skip if sectionType already exists
      if (config.sectionType) {
        console.log(`⏭️  [SKIP] ${config.sectionName} - already has sectionType: ${config.sectionType}`);
        wouldSkip++;
        continue;
      }

      let sectionType = null;
      let reason = '';

      // Determine sectionType based on sectionName
      if (FRONT_PAGE_SECTIONS.includes(config.sectionName)) {
        sectionType = 'front-page';
        reason = 'matches Front Page section list';
      } else if (TWO_ROW_SECTIONS.includes(config.sectionName)) {
        sectionType = 'two-row';
        reason = 'matches Two-Row section list';
      } else {
        // Default to front-page for unknown sections
        sectionType = 'front-page';
        reason = '⚠️  UNKNOWN SECTION - defaulting to front-page';
      }

      // Store what would change (but don't save)
      changes.push({
        sectionName: config.sectionName,
        currentSectionType: config.sectionType || '(missing)',
        newSectionType: sectionType,
        reason: reason,
        category: config.category?.name || config.category || 'none',
        subcategory: config.subcategory?.name || config.subcategory || 'none',
        childCategory: config.childCategory?.name || config.childCategory || 'none',
      });

      console.log(`📝 [WOULD UPDATE] ${config.sectionName}`);
      console.log(`   Current: sectionType = ${config.sectionType || '(missing)'}`);
      console.log(`   New:     sectionType = ${sectionType}`);
      console.log(`   Reason:  ${reason}`);
      console.log('');
      wouldUpdate++;
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📈 DRY-RUN SUMMARY');
    console.log('='.repeat(60));
    console.log(`   ✅ Would Update: ${wouldUpdate}`);
    console.log(`   ⏭️  Would Skip:   ${wouldSkip}`);
    console.log(`   📊 Total:        ${configs.length}`);

    if (changes.length > 0) {
      console.log('\n📋 DETAILED CHANGES THAT WOULD BE MADE:');
      console.log('-'.repeat(60));
      changes.forEach((change, index) => {
        console.log(`\n${index + 1}. Section: ${change.sectionName}`);
        console.log(`   Current sectionType: ${change.currentSectionType}`);
        console.log(`   → New sectionType:   ${change.newSectionType}`);
        console.log(`   Reason: ${change.reason}`);
        console.log(`   Category: ${change.category}`);
        console.log(`   Subcategory: ${change.subcategory}`);
        console.log(`   ChildCategory: ${change.childCategory}`);
      });
    }

    // Current state
    const currentFrontPage = await HomepageCategoryConfig.countDocuments({ sectionType: 'front-page' });
    const currentTwoRow = await HomepageCategoryConfig.countDocuments({ sectionType: 'two-row' });
    const currentMissing = await HomepageCategoryConfig.countDocuments({ 
      $or: [{ sectionType: { $exists: false } }, { sectionType: null }] 
    });

    console.log('\n' + '='.repeat(60));
    console.log('🔍 CURRENT DATABASE STATE');
    console.log('='.repeat(60));
    console.log(`   Front Page sections (with sectionType): ${currentFrontPage}`);
    console.log(`   Two-Row sections (with sectionType):    ${currentTwoRow}`);
    console.log(`   Missing sectionType:                    ${currentMissing}`);

    // Projected state
    const wouldBeFrontPage = currentFrontPage + changes.filter(c => c.newSectionType === 'front-page').length;
    const wouldBeTwoRow = currentTwoRow + changes.filter(c => c.newSectionType === 'two-row').length;

    console.log('\n' + '='.repeat(60));
    console.log('📊 PROJECTED STATE AFTER MIGRATION');
    console.log('='.repeat(60));
    console.log(`   Front Page sections: ${wouldBeFrontPage}`);
    console.log(`   Two-Row sections:    ${wouldBeTwoRow}`);
    console.log(`   Missing sectionType: 0`);

    // Warnings
    const unknownSections = changes.filter(c => c.reason.includes('UNKNOWN'));
    if (unknownSections.length > 0) {
      console.log('\n' + '⚠️ '.repeat(20));
      console.log('⚠️  WARNING: Unknown sections found!');
      console.log('⚠️ '.repeat(20));
      unknownSections.forEach(change => {
        console.log(`   - ${change.sectionName} (will default to 'front-page')`);
      });
      console.log('\n💡 Consider adding these to the section mapping lists before running the actual migration.');
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ DRY-RUN COMPLETED - NO CHANGES MADE');
    console.log('='.repeat(60));
    console.log('\n💡 To apply these changes, run:');
    console.log('   node backend/scripts/migrate-homepage-categories.js');
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Dry-run failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run dry-run
dryRun();

