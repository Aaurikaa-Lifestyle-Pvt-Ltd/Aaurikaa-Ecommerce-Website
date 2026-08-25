/**
 * Fix Homepage Category Indexes
 * 
 * This script:
 * 1. Drops the old unique index on sectionName (sectionName_1)
 * 2. Ensures the compound unique index exists (sectionName + sectionType)
 * 3. Handles any duplicate records that might exist
 * 
 * Run: node backend/scripts/fix-homepage-category-indexes.js
 */

const path = require('path');
// Load .env from backend/ first, then project root
require('dotenv').config({ path: path.join(__dirname, '../.env') });
if (!process.env.MONGODB_URI && !process.env.MONGO_URI && !process.env.MONGO_URL) {
  require('dotenv').config({ path: path.join(__dirname, '../../.env') });
}
const mongoose = require('mongoose');
const HomepageCategoryConfig = require('../models/HomepageCategoryConfig');

async function fixIndexes() {
  try {
    // Connect to MongoDB - check command line arg first, then env vars
    const mongoUri = process.argv[2] || process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL;
    
    if (!mongoUri) {
      console.error('❌ Error: MongoDB URI not found.');
      console.error('   Usage: node fix-homepage-category-indexes.js "your-connection-string"');
      console.error('   Or set MONGODB_URI environment variable');
      process.exit(1);
    }
    
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    const collection = HomepageCategoryConfig.collection;
    const collectionName = collection.collectionName;

    // Get all existing indexes
    const indexes = await collection.indexes();
    console.log('\n📋 Current indexes:');
    indexes.forEach(idx => {
      console.log(`   - ${idx.name}:`, JSON.stringify(idx.key));
    });

    // Check for old sectionName unique index
    const oldIndex = indexes.find(idx => 
      idx.name === 'sectionName_1' || 
      (Object.keys(idx.key).length === 1 && idx.key.sectionName === 1 && idx.unique)
    );

    if (oldIndex) {
      console.log(`\n🔧 Found old unique index: ${oldIndex.name}`);
      console.log('   Dropping old index...');
      
      try {
        await collection.dropIndex(oldIndex.name);
        console.log(`   ✅ Dropped index: ${oldIndex.name}`);
      } catch (error) {
        if (error.code === 27) {
          console.log(`   ⚠️  Index ${oldIndex.name} not found (may have been dropped already)`);
        } else {
          throw error;
        }
      }
    } else {
      console.log('\n✅ No old sectionName unique index found');
    }

    // Check for compound index
    const compoundIndex = indexes.find(idx => 
      idx.key.sectionName === 1 && 
      idx.key.sectionType === 1 && 
      idx.unique
    );

    if (compoundIndex) {
      console.log(`\n✅ Compound unique index already exists: ${compoundIndex.name}`);
    } else {
      console.log('\n🔧 Creating compound unique index...');
      try {
        await collection.createIndex(
          { sectionName: 1, sectionType: 1 },
          { unique: true, name: 'sectionName_1_sectionType_1' }
        );
        console.log('   ✅ Created compound unique index: sectionName_1_sectionType_1');
      } catch (error) {
        console.error('   ❌ Error creating compound index:', error.message);
        
        // If error is due to duplicates, list them
        if (error.code === 11000 || error.message.includes('duplicate')) {
          console.log('\n   ⚠️  Found duplicate records. Checking...');
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
            console.log(`   Found ${duplicates.length} duplicate groups:`);
            duplicates.forEach(dup => {
              console.log(`   - sectionName: "${dup._id.sectionName}", sectionType: "${dup._id.sectionType || 'missing'}", count: ${dup.count}`);
            });
            console.log('\n   💡 Please resolve duplicates manually or run migration script first.');
          }
        }
        throw error;
      }
    }

    // Verify final state
    const finalIndexes = await collection.indexes();
    console.log('\n📋 Final indexes:');
    finalIndexes.forEach(idx => {
      console.log(`   - ${idx.name}:`, JSON.stringify(idx.key), idx.unique ? '(unique)' : '');
    });

    console.log('\n✅ Index fix completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Index fix failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run fix
fixIndexes();

