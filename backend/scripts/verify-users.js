#!/usr/bin/env node

/**
 * User Verification Script
 * Verifies that all users were created successfully
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Import models
const Admin = require('../models/Admin');
const Shopper = require('../models/Shopper');
const Seller = require('../models/Seller');

// Database connection
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://localhost:27017/vendor-ecom';

async function connectDB() {
  try {
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
}

async function verifyUsers() {
  try {
    console.log('🔍 Verifying created users...\n');
    
    // Check Admin
    const admin = await Admin.findOne({ email: 'admin@vendor-ecom.com' });
    if (admin) {
      console.log('✅ Admin found:');
      console.log(`   ID: ${admin._id}`);
      console.log(`   Name: ${admin.name}`);
      console.log(`   Email: ${admin.email}`);
      console.log(`   Username: ${admin.username}`);
      console.log(`   Role: ${admin.role}`);
      console.log(`   Created: ${admin.createdAt}\n`);
    } else {
      console.log('❌ Admin not found\n');
    }
    
    // Check Shopper
    const shopper = await Shopper.findOne({ email: 'john.doe@example.com' });
    if (shopper) {
      console.log('✅ Shopper found:');
      console.log(`   ID: ${shopper._id}`);
      console.log(`   Name: ${shopper.firstName} ${shopper.lastName}`);
      console.log(`   Email: ${shopper.email}`);
      console.log(`   Username: ${shopper.username}`);
      console.log(`   Role: ${shopper.role}`);
      console.log(`   Created: ${shopper.createdAt}\n`);
    } else {
      console.log('❌ Shopper not found\n');
    }
    
    // Check Seller
    const seller = await Seller.findOne({ email: 'jane.smith@example.com' });
    if (seller) {
      console.log('✅ Seller found:');
      console.log(`   ID: ${seller._id}`);
      console.log(`   Name: ${seller.firstName} ${seller.lastName}`);
      console.log(`   Email: ${seller.email}`);
      console.log(`   Username: ${seller.username}`);
      console.log(`   Shop: ${seller.shopName}`);
      console.log(`   Shop URL: ${seller.shopUrl}`);
      console.log(`   Role: ${seller.role}`);
      console.log(`   Approved: ${seller.isApproved}`);
      console.log(`   Commission: ${seller.commission}%`);
      console.log(`   Created: ${seller.createdAt}\n`);
    } else {
      console.log('❌ Seller not found\n');
    }
    
    // Summary
    const adminCount = await Admin.countDocuments();
    const shopperCount = await Shopper.countDocuments();
    const sellerCount = await Seller.countDocuments();
    
    console.log('📊 Database Summary:');
    console.log(`   Total Admins: ${adminCount}`);
    console.log(`   Total Shoppers: ${shopperCount}`);
    console.log(`   Total Sellers: ${sellerCount}`);
    
  } catch (error) {
    console.error('❌ Error verifying users:', error.message);
    throw error;
  }
}

async function main() {
  try {
    await connectDB();
    await verifyUsers();
    console.log('✅ Verification completed successfully!');
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

if (require.main === module) {
  main();
}
