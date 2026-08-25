#!/usr/bin/env node

/**
 * Test Admin Review Creation
 * This script tests if admin can create reviews
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('../models/Admin');
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

async function testAdminReview() {
  try {
    // 1. Find admin user
    const admin = await Admin.findOne({ email: 'admin@vendorecom.com' });
    if (!admin) {
      console.log('❌ Admin user not found. Run: node scripts/setup-users.js');
      return;
    }
    console.log('✅ Admin found:', admin.email);
    console.log('   Admin ID:', admin._id);
    console.log('   Admin Name:', admin.name);
    console.log('   Admin Username:', admin.username);

    // 2. Find a product
    const product = await Product.findOne();
    if (!product) {
      console.log('❌ No products found in database');
      return;
    }
    console.log('✅ Product found:', product.name);
    console.log('   Product ID:', product._id);
    console.log('   Product SKU:', product.sku);
    console.log('   Seller ID:', product.seller);

    // 3. Check if admin review already exists
    const existingReview = await Review.findOne({
      product: product._id,
      'reviewer.userId': admin._id,
      'reviewer.role': 'admin'
    });

    if (existingReview) {
      console.log('ℹ️  Admin review already exists for this product');
      console.log('   Review ID:', existingReview._id);
      console.log('   Rating:', existingReview.rating);
      console.log('   Comment:', existingReview.comment);
      console.log('   Created:', existingReview.createdAt);
      return;
    }

    // 4. Create admin review
    const newReview = new Review({
      product: product._id,
      productSku: product.sku,
      seller: product.seller,
      reviewer: {
        userId: admin._id,
        role: 'admin',
        roleModel: 'Admin',
        name: admin.name,
        email: admin.email
      },
      rating: 5,
      comment: 'This is a test admin review created by test script.',
      isAuthoritative: true,
      status: 'approved'
    });

    await newReview.save();
    console.log('✅ Admin review created successfully!');
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
  await testAdminReview();
  await mongoose.connection.close();
  console.log('\n✅ Test complete. Database connection closed.');
}

main();

