/**
 * Quick script to check actual sectionType values in database
 */

require('dotenv').config();
const mongoose = require('mongoose');
const HomepageCategoryConfig = require('../models/HomepageCategoryConfig');

async function check() {
  try {
    const mongoUri = process.argv[2] || process.env.MONGODB_URI || process.env.MONGO_URI;
    await mongoose.connect(mongoUri);
    
    const configs = await HomepageCategoryConfig.find({}).lean();
    
    console.log('\n📊 Section Type Analysis:\n');
    console.log('='.repeat(60));
    
    configs.forEach(config => {
      const sectionType = config.sectionType;
      const typeStr = sectionType ? `"${sectionType}"` : '(null/undefined)';
      const typeLength = sectionType ? sectionType.length : 0;
      const typeCode = sectionType ? Array.from(sectionType).map(c => c.charCodeAt(0)).join(',') : 'N/A';
      
      console.log(`Section: ${config.sectionName}`);
      console.log(`  sectionType: ${typeStr}`);
      console.log(`  Length: ${typeLength}`);
      console.log(`  Type: ${typeof sectionType}`);
      if (sectionType) {
        console.log(`  Matches 'front-page': ${sectionType === 'front-page'}`);
        console.log(`  Matches 'two-row': ${sectionType === 'two-row'}`);
      }
      console.log('');
    });
    
    // Count by exact values
    const frontPage = configs.filter(c => c.sectionType === 'front-page').length;
    const twoRow = configs.filter(c => c.sectionType === 'two-row').length;
    const other = configs.filter(c => c.sectionType && c.sectionType !== 'front-page' && c.sectionType !== 'two-row').length;
    const missing = configs.filter(c => !c.sectionType).length;
    
    console.log('='.repeat(60));
    console.log('Summary:');
    console.log(`  Exact 'front-page': ${frontPage}`);
    console.log(`  Exact 'two-row': ${twoRow}`);
    console.log(`  Other values: ${other}`);
    console.log(`  Missing/null: ${missing}`);
    console.log(`  Total: ${configs.length}`);
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

check();

