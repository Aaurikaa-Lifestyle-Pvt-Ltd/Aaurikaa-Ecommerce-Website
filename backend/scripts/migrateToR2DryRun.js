// backend/scripts/migrateToR2DryRun.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Import models
const Product = require('../models/Product');
const Brand = require('../models/brand');
const Category = require('../models/Category');
const Seller = require('../models/Seller');
const Admin = require('../models/Admin');
const BannerSettings = require('../models/bannerSettingsModel');

/**
 * Dry run statistics
 */
const dryRunStats = {
  totalFiles: 0,
  existingFiles: 0,
  missingFiles: 0,
  alreadyR2Files: 0,
  errors: [],
  fileDetails: []
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
 * Get file size in bytes
 * @param {string} filePath - File path (e.g., "admin/filename.jpg")
 * @returns {number} - File size in bytes
 */
const getFileSize = (filePath) => {
  try {
    // Database stores paths like "admin/filename.jpg", need to add "uploads/" prefix
    const fullPath = path.join(__dirname, '..', 'uploads', filePath);
    const stats = fs.statSync(fullPath);
    return stats.size;
  } catch (error) {
    return 0;
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
 * Analyze a single file for migration
 * @param {string} filePath - Local file path
 * @param {string} category - File category
 * @param {string} modelType - Model type (Product, Brand, etc.)
 * @param {string} recordId - Record ID
 * @param {string} fieldName - Field name
 * @returns {Object} - Analysis result
 */
const analyzeFileForMigration = (filePath, category, modelType, recordId, fieldName) => {
  const analysis = {
    filePath,
    category,
    modelType,
    recordId,
    fieldName,
    exists: false,
    size: 0,
    r2Key: '',
    status: 'unknown'
  };

  dryRunStats.totalFiles++;

  if (!isLocalUploadPath(filePath)) {
    analysis.status = 'already_r2';
    dryRunStats.alreadyR2Files++;
    return analysis;
  }

  if (fileExists(filePath)) {
    analysis.exists = true;
    analysis.size = getFileSize(filePath);
    analysis.r2Key = filePath; // Use same path structure for R2
    analysis.status = 'ready_for_migration';
    dryRunStats.existingFiles++;
  } else {
    analysis.status = 'missing_file';
    dryRunStats.missingFiles++;
  }

  dryRunStats.fileDetails.push(analysis);
  return analysis;
};

/**
 * Analyze Product files
 */
const analyzeProductFiles = async () => {
  console.log('🔍 Analyzing Product files...');
  
  const products = await Product.find({
    $or: [
      { mainImage: { $exists: true, $ne: null, $ne: '' } },
      { galleryImages: { $exists: true, $ne: [] } },
      { video: { $exists: true, $ne: null, $ne: '' } }
    ]
  });

  console.log(`   Found ${products.length} products with files`);

  for (const product of products) {
    // Analyze main image
    if (product.mainImage) {
      analyzeFileForMigration(product.mainImage, 'products', 'Product', product._id, 'mainImage');
    }

    // Analyze gallery images
    if (product.galleryImages && product.galleryImages.length > 0) {
      product.galleryImages.forEach((imagePath, index) => {
        analyzeFileForMigration(imagePath, 'products', 'Product', product._id, `galleryImages[${index}]`);
      });
    }

    // Analyze video
    if (product.video) {
      analyzeFileForMigration(product.video, 'products', 'Product', product._id, 'video');
    }
  }
};

/**
 * Analyze Brand files
 */
const analyzeBrandFiles = async () => {
  console.log('🔍 Analyzing Brand files...');
  
  const brands = await Brand.find({
    logo: { $exists: true, $ne: null, $ne: '' }
  });

  console.log(`   Found ${brands.length} brands with logos`);

  for (const brand of brands) {
    if (brand.logo) {
      analyzeFileForMigration(brand.logo, 'brands', 'Brand', brand._id, 'logo');
    }
  }
};

/**
 * Analyze Category files
 */
const analyzeCategoryFiles = async () => {
  console.log('🔍 Analyzing Category files...');
  
  const categories = await Category.find({
    image: { $exists: true, $ne: null, $ne: '' }
  });

  console.log(`   Found ${categories.length} categories with images`);

  for (const category of categories) {
    if (category.image) {
      analyzeFileForMigration(category.image, 'categories', 'Category', category._id, 'image');
    }
  }
};

/**
 * Analyze Seller files
 */
const analyzeSellerFiles = async () => {
  console.log('🔍 Analyzing Seller files...');
  
  const sellers = await Seller.find({
    $or: [
      { profileImage: { $exists: true, $ne: null, $ne: '' } },
      { documents: { $exists: true, $ne: [] } }
    ]
  });

  console.log(`   Found ${sellers.length} sellers with files`);

  for (const seller of sellers) {
    // Analyze profile image
    if (seller.profileImage) {
      analyzeFileForMigration(seller.profileImage, 'sellers', 'Seller', seller._id, 'profileImage');
    }

    // Analyze documents
    if (seller.documents && seller.documents.length > 0) {
      seller.documents.forEach((docPath, index) => {
        analyzeFileForMigration(docPath, 'sellers', 'Seller', seller._id, `documents[${index}]`);
      });
    }
  }
};

/**
 * Analyze Admin files
 */
const analyzeAdminFiles = async () => {
  console.log('🔍 Analyzing Admin files...');
  
  const admins = await Admin.find({
    profileImage: { $exists: true, $ne: null, $ne: '' }
  });

  console.log(`   Found ${admins.length} admins with profile images`);

  for (const admin of admins) {
    if (admin.profileImage) {
      analyzeFileForMigration(admin.profileImage, 'admins', 'Admin', admin._id, 'profileImage');
    }
  }
};

/**
 * Analyze Banner Settings files
 */
const analyzeBannerFiles = async () => {
  console.log('🔍 Analyzing Banner Settings files...');
  
  const bannerSettings = await BannerSettings.findOne();

  if (bannerSettings) {
    let bannerFileCount = 0;

    // Analyze background image
    if (bannerSettings.backgroundImage) {
      analyzeFileForMigration(bannerSettings.backgroundImage, 'banners', 'BannerSettings', bannerSettings._id, 'backgroundImage');
      bannerFileCount++;
    }

    // Analyze offer images
    if (bannerSettings.offers && bannerSettings.offers.length > 0) {
      bannerSettings.offers.forEach((offer, index) => {
        if (offer.image) {
          analyzeFileForMigration(offer.image, 'banners', 'BannerSettings', bannerSettings._id, `offers[${index}].image`);
          bannerFileCount++;
        }
      });
    }

    console.log(`   Found ${bannerFileCount} banner files`);
  } else {
    console.log('   No banner settings found');
  }
};

/**
 * Format file size for display
 * @param {number} bytes - File size in bytes
 * @returns {string} - Formatted file size
 */
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Print detailed analysis results
 */
const printDetailedResults = () => {
  console.log('\n📊 DETAILED ANALYSIS RESULTS:');
  console.log('=' .repeat(80));

  // Group by status
  const byStatus = dryRunStats.fileDetails.reduce((acc, file) => {
    if (!acc[file.status]) acc[file.status] = [];
    acc[file.status].push(file);
    return acc;
  }, {});

  // Ready for migration
  if (byStatus.ready_for_migration) {
    console.log('\n✅ FILES READY FOR MIGRATION:');
    console.log(`   Total: ${byStatus.ready_for_migration.length} files`);
    
    let totalSize = 0;
    byStatus.ready_for_migration.forEach(file => {
      totalSize += file.size;
      console.log(`   - ${file.modelType} ${file.recordId} (${file.fieldName}): ${file.filePath} (${formatFileSize(file.size)})`);
    });
    console.log(`   Total size to migrate: ${formatFileSize(totalSize)}`);
  }

  // Missing files
  if (byStatus.missing_file) {
    console.log('\n❌ MISSING FILES:');
    console.log(`   Total: ${byStatus.missing_file.length} files`);
    byStatus.missing_file.forEach(file => {
      console.log(`   - ${file.modelType} ${file.recordId} (${file.fieldName}): ${file.filePath}`);
    });
  }

  // Already R2 files
  if (byStatus.already_r2) {
    console.log('\n✅ ALREADY R2 FILES:');
    console.log(`   Total: ${byStatus.already_r2.length} files`);
    byStatus.already_r2.forEach(file => {
      console.log(`   - ${file.modelType} ${file.recordId} (${file.fieldName}): ${file.filePath}`);
    });
  }

  // Group by category
  console.log('\n📁 FILES BY CATEGORY:');
  const byCategory = dryRunStats.fileDetails.reduce((acc, file) => {
    if (!acc[file.category]) acc[file.category] = { total: 0, ready: 0, missing: 0, size: 0 };
    acc[file.category].total++;
    if (file.status === 'ready_for_migration') {
      acc[file.category].ready++;
      acc[file.category].size += file.size;
    }
    if (file.status === 'missing_file') acc[file.category].missing++;
    return acc;
  }, {});

  Object.entries(byCategory).forEach(([category, stats]) => {
    console.log(`   ${category}: ${stats.ready}/${stats.total} ready (${formatFileSize(stats.size)})`);
  });
};

/**
 * Main dry run function
 */
const runDryRun = async () => {
  try {
    console.log('🔍 Starting R2 Migration Dry Run...');
    console.log('This will analyze existing files without performing any migration.\n');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://localhost:27017/ecommerce_db');
    console.log('✅ Connected to MongoDB\n');

    // Run analysis
    await analyzeProductFiles();
    await analyzeBrandFiles();
    await analyzeCategoryFiles();
    await analyzeSellerFiles();
    await analyzeAdminFiles();
    await analyzeBannerFiles();

    // Print summary
    console.log('\n📊 DRY RUN SUMMARY:');
    console.log('=' .repeat(50));
    console.log(`Total files found: ${dryRunStats.totalFiles}`);
    console.log(`Files ready for migration: ${dryRunStats.existingFiles}`);
    console.log(`Missing files: ${dryRunStats.missingFiles}`);
    console.log(`Already R2 files: ${dryRunStats.alreadyR2Files}`);

    // Print detailed results
    printDetailedResults();

    // Recommendations
    console.log('\n💡 RECOMMENDATIONS:');
    if (dryRunStats.missingFiles > 0) {
      console.log(`⚠️  ${dryRunStats.missingFiles} files are missing from local storage.`);
      console.log('   These files will be skipped during migration.');
    }
    
    if (dryRunStats.existingFiles > 0) {
      console.log(`✅ ${dryRunStats.existingFiles} files are ready for migration.`);
      console.log('   You can proceed with the actual migration.');
    } else {
      console.log('ℹ️  No files found that need migration.');
    }

    console.log('\n🔧 NEXT STEPS:');
    console.log('1. Review the analysis results above');
    console.log('2. If satisfied, run: node scripts/migrateToR2.js');
    console.log('3. Monitor the migration process');
    console.log('4. Verify files are accessible via R2 URLs');
    
  } catch (error) {
    console.error('❌ Dry run failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

// Run dry run if this script is executed directly
if (require.main === module) {
  runDryRun();
}

module.exports = {
  runDryRun,
  analyzeFileForMigration,
  dryRunStats
};
