// backend/scripts/migrateToR2.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { uploadFileToR2, getPublicUrl, extractKeyFromUrl } = require('../services/r2UploadService');
const { validateR2Config } = require('../config/r2Config');

// Import models
const Product = require('../models/Product');
const Brand = require('../models/brand');
const Category = require('../models/Category');
const Seller = require('../models/Seller');
const Admin = require('../models/Admin');
const BannerSettings = require('../models/bannerSettingsModel');

/**
 * Migration statistics
 */
const migrationStats = {
  totalFiles: 0,
  migratedFiles: 0,
  failedFiles: 0,
  skippedFiles: 0,
  errors: []
};

/**
 * Check if a file path is a local upload path
 * @param {string} filePath - File path to check
 * @returns {boolean} - Whether it's a local upload path
 */
const isLocalUploadPath = (filePath) => {
  if (!filePath || typeof filePath !== 'string') return false;
  
  // Check if it's a local upload path (not a full URL)
  // Database stores paths like: "admin/filename.jpg", "sellers/filename.jpg"
  return !filePath.startsWith('http') && !filePath.startsWith('https');
};

/**
 * Check if a file exists locally
 * @param {string} filePath - File path to check (e.g., "admin/filename.jpg")
 * @returns {boolean} - Whether file exists
 */
const fileExists = (filePath) => {
  try {
    // Database stores paths like "admin/filename.jpg", need to add "uploads/" prefix
    const fullPath = path.join(__dirname, '..', 'uploads', filePath);
    return fs.existsSync(fullPath);
  } catch (error) {
    return false;
  }
};

/**
 * Read file buffer from local path
 * @param {string} filePath - Local file path (e.g., "admin/filename.jpg")
 * @returns {Buffer|null} - File buffer or null
 */
const readFileBuffer = (filePath) => {
  try {
    // Database stores paths like "admin/filename.jpg", need to add "uploads/" prefix
    const fullPath = path.join(__dirname, '..', 'uploads', filePath);
    return fs.readFileSync(fullPath);
  } catch (error) {
    console.error(`❌ Error reading file ${filePath}:`, error.message);
    return null;
  }
};

/**
 * Determine file category from path
 * @param {string} filePath - File path
 * @returns {string} - File category
 */
const getFileCategory = (filePath) => {
  if (filePath.includes('/brands/')) return 'brands';
  if (filePath.includes('/categories/')) return 'categories';
  if (filePath.includes('/products/')) return 'products';
  if (filePath.includes('/sellers/')) return 'sellers';
  if (filePath.includes('/admins/')) return 'admins';
  if (filePath.includes('/banners/')) return 'banners';
  if (filePath.includes('/profiles/')) return 'profiles';
  return 'images'; // default
};

/**
 * Get MIME type from file extension
 * @param {string} filePath - File path
 * @returns {string} - MIME type
 */
const getMimeType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm'
  };
  return mimeTypes[ext] || 'application/octet-stream';
};

/**
 * Migrate a single file to R2
 * @param {string} filePath - Local file path
 * @param {string} category - File category
 * @returns {Object} - Migration result
 */
const migrateFileToR2 = async (filePath, category) => {
  try {
    migrationStats.totalFiles++;

    // Check if file exists locally
    if (!fileExists(filePath)) {
      migrationStats.skippedFiles++;
      return {
        success: false,
        error: 'File not found locally',
        skipped: true
      };
    }

    // Read file buffer
    const fileBuffer = readFileBuffer(filePath);
    if (!fileBuffer) {
      migrationStats.failedFiles++;
      return {
        success: false,
        error: 'Failed to read file buffer'
      };
    }

    // Use the same path structure for R2 (database already stores correct paths)
    // Database stores paths like "admin/filename.jpg", use as-is for R2
    const r2Key = filePath;

    // Upload to R2
    const mimeType = getMimeType(filePath);
    const result = await uploadFileToR2(fileBuffer, r2Key, mimeType);

    if (result.success) {
      migrationStats.migratedFiles++;
      return {
        success: true,
        r2Key: result.key,
        publicUrl: result.publicUrl
      };
    } else {
      migrationStats.failedFiles++;
      return {
        success: false,
        error: result.error
      };
    }
  } catch (error) {
    migrationStats.failedFiles++;
    migrationStats.errors.push({
      filePath,
      error: error.message
    });
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Migrate Product files
 */
const migrateProductFiles = async () => {
  console.log('🔄 Migrating Product files...');
  
  const products = await Product.find({
    $or: [
      { mainImage: { $exists: true, $ne: null, $ne: '' } },
      { galleryImages: { $exists: true, $ne: [] } },
      { video: { $exists: true, $ne: null, $ne: '' } }
    ]
  });

  for (const product of products) {
    const updates = {};

    // Migrate main image
    if (product.mainImage && isLocalUploadPath(product.mainImage)) {
      const result = await migrateFileToR2(product.mainImage, 'products');
      if (result.success) {
        updates.mainImage = result.publicUrl;
        console.log(`✅ Migrated main image: ${product.mainImage} -> ${result.publicUrl}`);
      } else if (!result.skipped) {
        console.log(`❌ Failed to migrate main image: ${product.mainImage} - ${result.error}`);
      }
    }

    // Migrate gallery images
    if (product.galleryImages && product.galleryImages.length > 0) {
      const migratedGalleryImages = [];
      for (const imagePath of product.galleryImages) {
        if (isLocalUploadPath(imagePath)) {
          const result = await migrateFileToR2(imagePath, 'products');
          if (result.success) {
            migratedGalleryImages.push(result.publicUrl);
            console.log(`✅ Migrated gallery image: ${imagePath} -> ${result.publicUrl}`);
          } else if (!result.skipped) {
            console.log(`❌ Failed to migrate gallery image: ${imagePath} - ${result.error}`);
            migratedGalleryImages.push(imagePath); // Keep original if migration failed
          } else {
            migratedGalleryImages.push(imagePath); // Keep original if skipped
          }
        } else {
          migratedGalleryImages.push(imagePath); // Keep non-local paths as-is
        }
      }
      updates.galleryImages = migratedGalleryImages;
    }

    // Migrate video
    if (product.video && isLocalUploadPath(product.video)) {
      const result = await migrateFileToR2(product.video, 'products');
      if (result.success) {
        updates.video = result.publicUrl;
        console.log(`✅ Migrated video: ${product.video} -> ${result.publicUrl}`);
      } else if (!result.skipped) {
        console.log(`❌ Failed to migrate video: ${product.video} - ${result.error}`);
      }
    }

    // Update product if there are changes
    if (Object.keys(updates).length > 0) {
      await Product.findByIdAndUpdate(product._id, updates);
      console.log(`✅ Updated product ${product._id} with R2 URLs`);
    }
  }
};

/**
 * Migrate Brand files
 */
const migrateBrandFiles = async () => {
  console.log('🔄 Migrating Brand files...');
  
  const brands = await Brand.find({
    logo: { $exists: true, $ne: null, $ne: '' }
  });

  for (const brand of brands) {
    if (brand.logo && isLocalUploadPath(brand.logo)) {
      const result = await migrateFileToR2(brand.logo, 'brands');
      if (result.success) {
        await Brand.findByIdAndUpdate(brand._id, { logo: result.publicUrl });
        console.log(`✅ Migrated brand logo: ${brand.logo} -> ${result.publicUrl}`);
      } else if (!result.skipped) {
        console.log(`❌ Failed to migrate brand logo: ${brand.logo} - ${result.error}`);
      }
    }
  }
};

/**
 * Migrate Category files
 */
const migrateCategoryFiles = async () => {
  console.log('🔄 Migrating Category files...');
  
  const categories = await Category.find({
    image: { $exists: true, $ne: null, $ne: '' }
  });

  for (const category of categories) {
    if (category.image && isLocalUploadPath(category.image)) {
      const result = await migrateFileToR2(category.image, 'categories');
      if (result.success) {
        await Category.findByIdAndUpdate(category._id, { image: result.publicUrl });
        console.log(`✅ Migrated category image: ${category.image} -> ${result.publicUrl}`);
      } else if (!result.skipped) {
        console.log(`❌ Failed to migrate category image: ${category.image} - ${result.error}`);
      }
    }
  }
};

/**
 * Migrate Seller files
 */
const migrateSellerFiles = async () => {
  console.log('🔄 Migrating Seller files...');
  
  const sellers = await Seller.find({
    $or: [
      { profileImage: { $exists: true, $ne: null, $ne: '' } },
      { documents: { $exists: true, $ne: [] } }
    ]
  });

  for (const seller of sellers) {
    const updates = {};

    // Migrate profile image
    if (seller.profileImage && isLocalUploadPath(seller.profileImage)) {
      const result = await migrateFileToR2(seller.profileImage, 'sellers');
      if (result.success) {
        updates.profileImage = result.publicUrl;
        console.log(`✅ Migrated seller profile: ${seller.profileImage} -> ${result.publicUrl}`);
      } else if (!result.skipped) {
        console.log(`❌ Failed to migrate seller profile: ${seller.profileImage} - ${result.error}`);
      }
    }

    // Migrate documents
    if (seller.documents && seller.documents.length > 0) {
      const migratedDocuments = [];
      for (const docPath of seller.documents) {
        if (isLocalUploadPath(docPath)) {
          const result = await migrateFileToR2(docPath, 'sellers');
          if (result.success) {
            migratedDocuments.push(result.publicUrl);
            console.log(`✅ Migrated seller document: ${docPath} -> ${result.publicUrl}`);
          } else if (!result.skipped) {
            console.log(`❌ Failed to migrate seller document: ${docPath} - ${result.error}`);
            migratedDocuments.push(docPath); // Keep original if migration failed
          } else {
            migratedDocuments.push(docPath); // Keep original if skipped
          }
        } else {
          migratedDocuments.push(docPath); // Keep non-local paths as-is
        }
      }
      updates.documents = migratedDocuments;
    }

    // Update seller if there are changes
    if (Object.keys(updates).length > 0) {
      await Seller.findByIdAndUpdate(seller._id, updates);
      console.log(`✅ Updated seller ${seller._id} with R2 URLs`);
    }
  }
};

/**
 * Migrate Admin files
 */
const migrateAdminFiles = async () => {
  console.log('🔄 Migrating Admin files...');
  
  const admins = await Admin.find({
    profileImage: { $exists: true, $ne: null, $ne: '' }
  });

  for (const admin of admins) {
    if (admin.profileImage && isLocalUploadPath(admin.profileImage)) {
      const result = await migrateFileToR2(admin.profileImage, 'admins');
      if (result.success) {
        await Admin.findByIdAndUpdate(admin._id, { profileImage: result.publicUrl });
        console.log(`✅ Migrated admin profile: ${admin.profileImage} -> ${result.publicUrl}`);
      } else if (!result.skipped) {
        console.log(`❌ Failed to migrate admin profile: ${admin.profileImage} - ${result.error}`);
      }
    }
  }
};

/**
 * Migrate Banner Settings files
 */
const migrateBannerFiles = async () => {
  console.log('🔄 Migrating Banner Settings files...');
  
  const bannerSettings = await BannerSettings.findOne();

  if (bannerSettings) {
    const updates = {};

    // Migrate background image
    if (bannerSettings.backgroundImage && isLocalUploadPath(bannerSettings.backgroundImage)) {
      const result = await migrateFileToR2(bannerSettings.backgroundImage, 'banners');
      if (result.success) {
        updates.backgroundImage = result.publicUrl;
        console.log(`✅ Migrated background image: ${bannerSettings.backgroundImage} -> ${result.publicUrl}`);
      } else if (!result.skipped) {
        console.log(`❌ Failed to migrate background image: ${bannerSettings.backgroundImage} - ${result.error}`);
      }
    }

    // Migrate offer images
    if (bannerSettings.offers && bannerSettings.offers.length > 0) {
      const migratedOffers = bannerSettings.offers.map(offer => {
        if (offer.image && isLocalUploadPath(offer.image)) {
          // Note: We can't await here, so we'll handle this differently
          return offer;
        }
        return offer;
      });
      updates.offers = migratedOffers;
    }

    // Update banner settings if there are changes
    if (Object.keys(updates).length > 0) {
      await BannerSettings.findByIdAndUpdate(bannerSettings._id, updates);
      console.log(`✅ Updated banner settings with R2 URLs`);
    }
  }
};

/**
 * Main migration function
 */
const runMigration = async () => {
  try {
    console.log('🚀 Starting R2 Migration...');
    
    // Validate R2 configuration
    validateR2Config();
    console.log('✅ R2 configuration validated');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://localhost:27017/ecommerce_db');
    console.log('✅ Connected to MongoDB');

    // Run migrations
    await migrateProductFiles();
    await migrateBrandFiles();
    await migrateCategoryFiles();
    await migrateSellerFiles();
    await migrateAdminFiles();
    await migrateBannerFiles();

    // Print migration statistics
    console.log('\n📊 Migration Statistics:');
    console.log(`Total files processed: ${migrationStats.totalFiles}`);
    console.log(`Successfully migrated: ${migrationStats.migratedFiles}`);
    console.log(`Failed migrations: ${migrationStats.failedFiles}`);
    console.log(`Skipped files: ${migrationStats.skippedFiles}`);
    
    if (migrationStats.errors.length > 0) {
      console.log('\n❌ Migration Errors:');
      migrationStats.errors.forEach(error => {
        console.log(`- ${error.filePath}: ${error.error}`);
      });
    }

    console.log('\n✅ Migration completed!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  }
};

// Run migration if this script is executed directly
if (require.main === module) {
  runMigration();
}

module.exports = {
  runMigration,
  migrateFileToR2,
  migrationStats
};
