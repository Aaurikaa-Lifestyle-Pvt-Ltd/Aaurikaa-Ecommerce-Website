/**
 * DRY-RUN: Fix Homepage Category Indexes
 * 
 * ⚠️  THIS IS A DRY-RUN - NO CHANGES WILL BE MADE TO THE DATABASE ⚠️
 * 
 * This script shows what would be done:
 * 1. Drops the old unique index on sectionName (sectionName_1)
 * 2. Ensures the compound unique index exists (sectionName + sectionType)
 * 3. Handles any duplicate records that might exist
 * 
 * Run: node backend/scripts/fix-homepage-category-indexes-dryrun.js
 * 
 * After reviewing the output, run the actual fix:
 * node backend/scripts/fix-homepage-category-indexes.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const HomepageCategoryConfig = require('../models/HomepageCategoryConfig');

async function dryRun() {
  try {
    // Connect to MongoDB - check command line arg first, then env vars
    const mongoUri = process.argv[2] || process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL;
    
    if (!mongoUri) {
      console.error('❌ Error: MongoDB URI not found.');
      console.error('   Usage: node fix-homepage-category-indexes-dryrun.js "your-connection-string"');
      console.error('   Or set MONGODB_URI environment variable');
      process.exit(1);
    }
    
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
    console.log('🔍 DRY-RUN MODE: No changes will be made\n');

    const collection = HomepageCategoryConfig.collection;
    const collectionName = collection.collectionName;

    // Get all existing indexes
    const indexes = await collection.indexes();
    console.log('📋 CURRENT INDEXES:');
    console.log('='.repeat(60));
    indexes.forEach(idx => {
      const unique = idx.unique ? ' (unique)' : '';
      console.log(`   - ${idx.name}: ${JSON.stringify(idx.key)}${unique}`);
    });

    // Check for old sectionName unique index
    const oldIndex = indexes.find(idx => 
      idx.name === 'sectionName_1' || 
      (Object.keys(idx.key).length === 1 && idx.key.sectionName === 1 && idx.unique)
    );

    console.log('\n' + '='.repeat(60));
    console.log('🔍 ANALYSIS');
    console.log('='.repeat(60));

    if (oldIndex) {
      console.log(`\n⚠️  FOUND OLD UNIQUE INDEX: ${oldIndex.name}`);
      console.log(`   Key: ${JSON.stringify(oldIndex.key)}`);
      console.log(`   Unique: ${oldIndex.unique}`);
      console.log(`\n   📝 ACTION: Would DROP this index`);
      console.log(`   Command: db.${collectionName}.dropIndex("${oldIndex.name}")`);
    } else {
      console.log('\n✅ No old sectionName unique index found');
      console.log('   📝 ACTION: No action needed');
    }

    // Check for compound index
    const compoundIndex = indexes.find(idx => 
      idx.key.sectionName === 1 && 
      idx.key.sectionType === 1 && 
      idx.unique
    );

    if (compoundIndex) {
      console.log(`\n✅ COMPOUND UNIQUE INDEX EXISTS: ${compoundIndex.name}`);
      console.log(`   Key: ${JSON.stringify(compoundIndex.key)}`);
      console.log(`   Unique: ${compoundIndex.unique}`);
      console.log(`\n   📝 ACTION: No action needed`);
    } else {
      console.log('\n⚠️  COMPOUND UNIQUE INDEX MISSING');
      console.log(`\n   📝 ACTION: Would CREATE compound unique index`);
      console.log(`   Key: { sectionName: 1, sectionType: 1 }`);
      console.log(`   Name: sectionName_1_sectionType_1`);
      console.log(`   Command: db.${collectionName}.createIndex({ sectionName: 1, sectionType: 1 }, { unique: true })`);
      
      // Check for potential duplicates that would prevent index creation
      console.log('\n   🔍 Checking for potential duplicate records...');
      const duplicates = await collection.aggregate([
        {
          $group: {
            _id: { sectionName: '$sectionName', sectionType: '$sectionType' },
            count: { $sum: 1 },
            ids: { $push: '$_id' }
          }
        },
        { $match: { count: { $gt: 1 } } }
      ]).toArray();

      if (duplicates.length > 0) {
        console.log(`\n   ⚠️  WARNING: Found ${duplicates.length} duplicate groups that would prevent index creation:`);
        duplicates.forEach((dup, index) => {
          console.log(`\n   ${index + 1}. sectionName: "${dup._id.sectionName}"`);
          console.log(`      sectionType: "${dup._id.sectionType || 'missing/null'}"`);
          console.log(`      Count: ${dup.count}`);
          console.log(`      Document IDs: ${dup.ids.slice(0, 3).map(id => id.toString()).join(', ')}${dup.ids.length > 3 ? '...' : ''}`);
        });
        console.log('\n   💡 These duplicates must be resolved before the index can be created.');
        console.log('   💡 Consider running a cleanup script or manually removing duplicates.');
      } else {
        console.log('   ✅ No duplicates found - index creation would succeed');
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 DRY-RUN SUMMARY');
    console.log('='.repeat(60));
    
    const actions = [];
    if (oldIndex) {
      actions.push(`DROP index: ${oldIndex.name}`);
    }
    if (!compoundIndex) {
      actions.push('CREATE compound unique index: sectionName_1_sectionType_1');
    }
    
    if (actions.length === 0) {
      console.log('\n✅ No actions needed - indexes are already correct!');
    } else {
      console.log('\n📝 Actions that would be performed:');
      actions.forEach((action, index) => {
        console.log(`   ${index + 1}. ${action}`);
      });
    }

    // Projected final state
    console.log('\n' + '='.repeat(60));
    console.log('📋 PROJECTED FINAL STATE');
    console.log('='.repeat(60));
    console.log('\nAfter migration, indexes would be:');
    
    const projectedIndexes = indexes.filter(idx => 
      !(idx.name === 'sectionName_1' && Object.keys(idx.key).length === 1 && idx.key.sectionName === 1 && idx.unique)
    );
    
    if (!compoundIndex) {
      projectedIndexes.push({
        name: 'sectionName_1_sectionType_1',
        key: { sectionName: 1, sectionType: 1 },
        unique: true
      });
    }
    
    projectedIndexes.forEach(idx => {
      const unique = idx.unique ? ' (unique)' : '';
      console.log(`   - ${idx.name}: ${JSON.stringify(idx.key)}${unique}`);
    });

    console.log('\n' + '='.repeat(60));
    console.log('✅ DRY-RUN COMPLETED - NO CHANGES MADE');
    console.log('='.repeat(60));
    console.log('\n💡 To apply these changes, run:');
    console.log('   node backend/scripts/fix-homepage-category-indexes.js');
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

