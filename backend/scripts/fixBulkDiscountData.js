const mongoose = require('mongoose');
const Product = require('../models/Product');
const { parseBulkDiscount } = require('../utils/bulkDiscountParser');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/Multi-Vendor-Ecom');
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Fix bulk discount data for all products
const fixBulkDiscountData = async () => {
  try {
    console.log('🔍 Starting bulk discount data fix...');
    
    // Use raw MongoDB queries to avoid Mongoose model initialization issues
    const db = mongoose.connection.db;
    const productsCollection = db.collection('products');
    
    // Find all products using raw MongoDB query
    const products = await productsCollection.find({}).toArray();
    console.log(`📦 Found ${products.length} products to check`);
    
    let fixedCount = 0;
    let errorCount = 0;
    
    for (const product of products) {
      try {
        // Check if bulkDiscount needs fixing
        const currentBulkDiscount = product.bulkDiscount;
        const fixedBulkDiscount = parseBulkDiscount(currentBulkDiscount);
        
        // Check if the data is different (needs fixing)
        const needsFixing = JSON.stringify(currentBulkDiscount) !== JSON.stringify(fixedBulkDiscount);
        
        if (needsFixing) {
          console.log(`🔧 Fixing product: ${product.name} (${product._id})`);
          console.log(`   Before: ${JSON.stringify(currentBulkDiscount)}`);
          console.log(`   After:  ${JSON.stringify(fixedBulkDiscount)}`);
          
          // Update the product using raw MongoDB update
          await productsCollection.updateOne(
            { _id: product._id },
            { $set: { bulkDiscount: fixedBulkDiscount } }
          );
          
          fixedCount++;
        }
      } catch (error) {
        console.error(`❌ Error fixing product ${product._id}:`, error.message);
        errorCount++;
      }
    }
    
    console.log('\n📊 Fix Summary:');
    console.log(`✅ Products fixed: ${fixedCount}`);
    console.log(`❌ Errors encountered: ${errorCount}`);
    console.log(`📦 Total products processed: ${products.length}`);
    
  } catch (error) {
    console.error('❌ Error during bulk discount fix:', error);
  }
};

// Main execution
const main = async () => {
  try {
    await connectDB();
    await fixBulkDiscountData();
    console.log('\n✅ Bulk discount data fix completed successfully!');
  } catch (error) {
    console.error('❌ Script failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
    process.exit(0);
  }
};

// Run the script
if (require.main === module) {
  main();
}

module.exports = { fixBulkDiscountData, parseBulkDiscount };
