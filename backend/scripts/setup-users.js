#!/usr/bin/env node

/**
 * User Setup Script for Multi-Vendor E-Commerce Platform
 * Creates initial admin, shopper, and seller profiles
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

// Import models
const Admin = require('../models/Admin');
const Shopper = require('../models/Shopper');
const Seller = require('../models/Seller');
const Country = require('../models/location/Country');
const State = require('../models/location/State');
const District = require('../models/location/District');

// Database connection
const MONGO_URI = process.env.MONGODB_URI;

// Sample user data
const users = {
  admin1: {
    name: 'Super Admin',
    username: 'admin',
    email: 'admin@vendorecom.com',
    phone: '+1234567890',
    password: 'Admin@123456',
    profileImage: '',
    role: 'admin',
    isSuperAdmin: true,
    permissions: [],
    tokenVersion: 0,
  },
  admin2: {
    name: 'Admin Manager',
    username: 'adminmanager',
    email: 'adminmanager@vendor-ecom.com',
    phone: '+1234567893',
    password: 'AdminManager@123456',
    profileImage: '',
    role: 'admin',
    isSuperAdmin: true,
    permissions: [],
    tokenVersion: 0,
  },
  shopper: {
    firstName: 'Test',
    lastName: 'Shopper',
    username: 'testshopper',
    email: 'testshopper@example.com',
    phone: '+1234567891',
    password: 'Shopper@123456',
    profileImage: '',
    role: 'shopper'
  },
  seller: {
    firstName: 'Test',
    lastName: 'Seller',
    username: 'testseller',
    email: 'testseller@example.com',
    phone: '+1234567892',
    password: 'Seller@123456',
    shopName: 'Test Seller',
    shopUrl: 'test-seller',
    address: {
      address1: '123 Main Street',
      address2: 'Suite 100',
      pincode: '12345',
      country: 'United States',
      state: 'California',
      district: 'Los Angeles'
    },
    profileImage: '',
    shopImage: '',
    role: 'seller',
    isApproved: true, // Pre-approve for testing
    commission: 5.0
  },
  seller2: {
    firstName: 'Premium',
    lastName: 'Vendor',
    username: 'premiumvendor',
    email: 'vendor2@example.com',
    phone: '+1987654321',
    password: 'Vendor@123456',
    shopName: 'Fashion Haven',
    shopUrl: 'fashion-haven',
    address: {
      address1: '456 Fashion Ave',
      address2: 'Floor 2',
      pincode: '54321',
      country: 'United States',
      state: 'California',
      district: 'Los Angeles'
    },
    profileImage: '',
    shopImage: '',
    role: 'seller',
    isApproved: true,
    commission: 10.0
  }
};

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

async function hashPassword(password) {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
}

async function createOrFindLocation() {
  try {
    // Create or find United States country
    let country = await Country.findOne({ name: 'United States' });
    if (!country) {
      country = new Country({
        name: 'United States',
        code: 'US',
        phoneCode: '+1'
      });
      await country.save();
      console.log('✅ Created United States country');
    }

    // Create or find California state
    let state = await State.findOne({ name: 'California', country: country._id });
    if (!state) {
      state = new State({
        name: 'California',
        country: country._id,
        code: 'CA'
      });
      await state.save();
      console.log('✅ Created California state');
    }

    // Create or find Los Angeles district
    let district = await District.findOne({ name: 'Los Angeles', state: state._id });
    if (!district) {
      district = new District({
        name: 'Los Angeles',
        state: state._id,
        code: 'LA'
      });
      await district.save();
      console.log('✅ Created Los Angeles district');
    }

    return { country: country._id, state: state._id, district: district._id };
  } catch (error) {
    console.error('❌ Error creating/finding location:', error.message);
    throw error;
  }
}

async function createAdmin(adminKey) {
  try {
    const adminData = users[adminKey];
    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email: adminData.email });
    if (existingAdmin) {
      console.log(`⚠️  Admin (${adminData.name}) already exists, skipping...`);
      return existingAdmin;
    }

    // Don't hash password here - Admin model's pre-save hook will handle it
    const admin = new Admin({
      ...adminData
    });

    await admin.save();
    console.log(`✅ Admin (${adminData.name}) created successfully`);
    console.log(`   Email: ${adminData.email}`);
    console.log(`   Password: ${adminData.password}`);
    return admin;
  } catch (error) {
    console.error(`❌ Error creating admin (${users[adminKey].name}):`, error.message);
    throw error;
  }
}

async function createShopper() {
  try {
    // Check if shopper already exists
    const existingShopper = await Shopper.findOne({ email: users.shopper.email });
    if (existingShopper) {
      console.log('⚠️  Shopper already exists, skipping...');
      return existingShopper;
    }

    const hashedPassword = await hashPassword(users.shopper.password);
    const shopper = new Shopper({
      ...users.shopper,
      password: hashedPassword
    });

    await shopper.save();
    console.log('✅ Shopper created successfully');
    console.log(`   Email: ${users.shopper.email}`);
    console.log(`   Password: ${users.shopper.password}`);
    return shopper;
  } catch (error) {
    console.error('❌ Error creating shopper:', error.message);
    throw error;
  }
}

async function createSeller() {
  try {
    // Check if seller already exists
    const existingSeller = await Seller.findOne({ email: users.seller.email });
    if (existingSeller) {
      console.log('⚠️  Seller already exists, skipping...');
      return existingSeller;
    }

    // Create or find location data
    const locationData = await createOrFindLocation();

    const hashedPassword = await hashPassword(users.seller.password);
    const seller = new Seller({
      ...users.seller,
      password: hashedPassword,
      address: {
        ...users.seller.address,
        country: locationData.country,
        state: locationData.state,
        district: locationData.district
      }
    });

    await seller.save();
    console.log('✅ Seller created successfully');
    console.log(`   Email: ${users.seller.email}`);
    console.log(`   Password: ${users.seller.password}`);
    console.log(`   Shop: ${users.seller.shopName}`);
    return seller;
  } catch (error) {
    console.error('❌ Error creating seller:', error.message);
    throw error;
  }
}

async function createSeller2() {
  try {
    // Check if seller already exists
    const existingSeller = await Seller.findOne({ email: users.seller2.email });
    if (existingSeller) {
      console.log('⚠️  Seller 2 already exists, skipping...');
      return existingSeller;
    }

    // Create or find location data
    const locationData = await createOrFindLocation();

    const hashedPassword = await hashPassword(users.seller2.password);
    const seller = new Seller({
      ...users.seller2,
      password: hashedPassword,
      address: {
        ...users.seller2.address,
        country: locationData.country,
        state: locationData.state,
        district: locationData.district
      }
    });

    await seller.save();
    console.log('✅ Seller 2 created successfully');
    console.log(`   Email: ${users.seller2.email}`);
    console.log(`   Password: ${users.seller2.password}`);
    console.log(`   Shop: ${users.seller2.shopName}`);
    return seller;
  } catch (error) {
    console.error('❌ Error creating seller 2:', error.message);
    throw error;
  }
}


async function displayCredentials() {
  console.log('\n' + '='.repeat(60));
  console.log('🎉 USER SETUP COMPLETED SUCCESSFULLY!');
  console.log('='.repeat(60));
  console.log('\n📋 LOGIN CREDENTIALS:');
  console.log('\n🔐 ADMIN 1:');
  console.log(`   Name: ${users.admin1.name}`);
  console.log(`   Email: ${users.admin1.email}`);
  console.log(`   Password: ${users.admin1.password}`);
  console.log(`   Role: Admin (Full Access)`);
  
  console.log('\n🔐 ADMIN 2:');
  console.log(`   Name: ${users.admin2.name}`);
  console.log(`   Email: ${users.admin2.email}`);
  console.log(`   Password: ${users.admin2.password}`);
  console.log(`   Role: Admin (Full Access)`);
  
  console.log('\n🛒 SHOPPER:');
  console.log(`   Email: ${users.shopper.email}`);
  console.log(`   Password: ${users.shopper.password}`);
  console.log(`   Role: Shopper (Customer)`);
  
  console.log('\n🏪 SELLER:');
  console.log(`   Email: ${users.seller.email}`);
  console.log(`   Password: ${users.seller.password}`);
  console.log(`   Shop: ${users.seller.shopName}`);
  console.log(`   Role: Seller (Vendor)`);
  
  console.log('\n🏪 SELLER 2:');
  console.log(`   Email: ${users.seller2.email}`);
  console.log(`   Password: ${users.seller2.password}`);
  console.log(`   Shop: ${users.seller2.shopName}`);
  console.log(`   Role: Seller (Vendor)`);
  
  console.log('\n' + '='.repeat(60));
  console.log('⚠️  IMPORTANT SECURITY NOTES:');
  console.log('• Change these passwords immediately in production');
  console.log('• These are default credentials for development only');
  console.log('• Store credentials securely and never commit to version control');
  console.log('='.repeat(60));
}

async function main() {
  try {
    console.log('🚀 Starting user setup process...\n');
    
    // Connect to database
    await connectDB();
    
    // Create users
    console.log('Creating users...\n');
    await createShopper();
    /* 
    // Commented out to avoid duplication
    await createAdmin('admin1');
    await createAdmin('admin2');
   
    await createSeller();
    */

    // Create Second Seller
    await createSeller2();
    
    // Display credentials
    // await displayCredentials();
    
    console.log('\n📋 NEW SELLER CREDENTIALS:');
    console.log(`   Email: ${users.seller2.email}`);
    console.log(`   Password: ${users.seller2.password}`);
    console.log(`   Shop: ${users.seller2.shopName}`);
    
    console.log('\n✅ Setup completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    process.exit(1);
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { createAdmin, createSeller, createShopper };
