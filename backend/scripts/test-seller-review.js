#!/usr/bin/env node

/**
 * Test Seller Review Creation
 * This script tests if seller can create reviews for their own products
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Seller = require('../models/Seller');
const Product = require('../models/Product');
const Review = require('../models/Review');

const MONGO_URI = process.env.MONGODB_URI;

async function connectDB() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
}

async function testSellerReview() {
  try {
    // 1. Find seller user
    const seller = await Seller.findOne({ email: 'testseller@example.com' });
    if (!seller) {
      console.log('❌ Seller user not found. Run: node scripts/setup-users.js');
      return;
    }
    console.log('✅ Seller found:', seller.email);
    console.log('   Seller ID:', seller._id);
    console.log('   Shop Name:', seller.shopName);

    // 2. Find a product owned by this seller
    const product = await Product.findOne({ seller: seller._id });
    if (!product) {
      console.log('❌ No products found for this seller');
      console.log('   Create a product first as this seller');
      return;
    }
    console.log('✅ Product found:', product.name);
    console.log('   Product ID:', product._id);
    console.log('   Product SKU:', product.sku);

    // 3. Check if seller review already exists
    const existingReview = await Review.findOne({
      product: product._id,
      'reviewer.userId': seller._id,
      'reviewer.role': 'seller'
    });

    if (existingReview) {
      console.log('ℹ️  Seller review already exists for this product');
      console.log('   Review ID:', existingReview._id);
      console.log('   Rating:', existingReview.rating);
      console.log('   Comment:', existingReview.comment);
      console.log('   Created:', existingReview.createdAt);
      return;
    }

    // 4. Create seller review
    const sellerName = `${seller.firstName || ''} ${seller.lastName || ''}`.trim() || seller.shopName;
    
    const newReview = new Review({
      product: product._id,
      productSku: product.sku,
      seller: seller._id,
      reviewer: {
        userId: seller._id,
        role: 'seller',
        roleModel: 'Seller',
        name: sellerName,
        email: seller.email
      },
      rating: 5,
      comment: 'This is a test seller review created by test script.',
      isAuthoritative: true,
      status: 'approved'
    });

    await newReview.save();
    console.log('✅ Seller review created successfully!');
    console.log('   Review ID:', newReview._id);
    console.log('   Rating:', newReview.rating);
    console.log('   Comment:', newReview.comment);

    // 5. Verify the review was saved
    const savedReview = await Review.findById(newReview._id);
    if (savedReview) {
      console.log('✅ Review verification successful');
    } else {
      console.log('❌ Review verification failed');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

async function main() {
  await connectDB();
  await testSellerReview();
  await mongoose.connection.close();
  console.log('\n✅ Test complete. Database connection closed.');
}

main();



