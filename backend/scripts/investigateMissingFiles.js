// backend/scripts/investigateMissingFiles.js
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
 * Check if a file exists locally with detailed path analysis
 * @param {string} filePath - File path to check (e.g., "admin/filename.jpg")
 * @returns {Object} - Detailed analysis result
 */
const analyzeFileExistence = (filePath) => {
  const analysis = {
    originalPath: filePath,
    exists: false,
    possiblePaths: [],
    actualPath: null,
    reason: 'unknown'
  };

  // Try different possible paths
  const possiblePaths = [
    // Database path as-is (e.g., "admin/filename.jpg")
    path.join(__dirname, '..', 'uploads', filePath),
    
    // With uploads prefix (e.g., "uploads/admin/filename.jpg")
    path.join(__dirname, '..', 'uploads', 'uploads', filePath),
    
    // Direct path (e.g., "admin/filename.jpg" in root)
    path.join(__dirname, '..', filePath),
    
    // In uploads root (e.g., "filename.jpg" in uploads/)
    path.join(__dirname, '..', 'uploads', path.basename(filePath)),
    
    // Try with different folder structures
    path.join(__dirname, '..', 'uploads', 'admin', path.basename(filePath)),
    path.join(__dirname, '..', 'uploads', 'sellers', path.basename(filePath)),
    path.join(__dirname, '..', 'uploads', 'brands', path.basename(filePath)),
    path.join(__dirname, '..', 'uploads', 'categories', path.basename(filePath)),
  ];

  analysis.possiblePaths = possiblePaths.map(p => ({
    path: p,
    exists: fs.existsSync(p),
    relative: path.relative(path.join(__dirname, '..'), p)
  }));

  // Check if any path exists
  const existingPath = analysis.possiblePaths.find(p => p.exists);
  if (existingPath) {
    analysis.exists = true;
    analysis.actualPath = existingPath.relative;
    analysis.reason = 'found_in_alternative_location';
  } else {
    analysis.reason = 'file_not_found_anywhere';
  }

  return analysis;
};

/**
 * Search for files with similar names
 * @param {string} filename - Base filename to search for
 * @returns {Array} - Array of similar files found
 */
const findSimilarFiles = (filename) => {
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  const similarFiles = [];

  try {
    const searchInDirectory = (dir, baseName) => {
      if (!fs.existsSync(dir)) return;

      const items = fs.readdirSync(dir);
      for (const item of items) {
        const itemPath = path.join(dir, item);
        const stat = fs.statSync(itemPath);

        if (stat.isDirectory()) {
          searchInDirectory(itemPath, baseName);
        } else if (stat.isFile()) {
          // Check if filename is similar (contains base name or vice versa)
          const itemBaseName = path.basename(item, path.extname(item));
          const searchBaseName = path.basename(baseName, path.extname(baseName));
          
          if (itemBaseName.includes(searchBaseName) || searchBaseName.includes(itemBaseName)) {
            similarFiles.push({
              path: path.relative(uploadsDir, itemPath),
              fullPath: itemPath,
              size: stat.size,
              modified: stat.mtime
            });
          }
        }
      }
    };

    searchInDirectory(uploadsDir, filename);
  } catch (error) {
    console.error(`Error searching for similar files: ${error.message}`);
  }

  return similarFiles;
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

  const missingFiles = [];

  for (const product of products) {
    // Analyze main image
    if (product.mainImage) {
      const analysis = analyzeFileExistence(product.mainImage);
      if (!analysis.exists) {
        missingFiles.push({
          type: 'Product',
          id: product._id,
          field: 'mainImage',
          path: product.mainImage,
          analysis,
          similarFiles: findSimilarFiles(product.mainImage)
        });
      }
    }

    // Analyze gallery images
    if (product.galleryImages && product.galleryImages.length > 0) {
      product.galleryImages.forEach((imagePath, index) => {
        const analysis = analyzeFileExistence(imagePath);
        if (!analysis.exists) {
          missingFiles.push({
            type: 'Product',
            id: product._id,
            field: `galleryImages[${index}]`,
            path: imagePath,
            analysis,
            similarFiles: findSimilarFiles(imagePath)
          });
        }
      });
    }

    // Analyze video
    if (product.video) {
      const analysis = analyzeFileExistence(product.video);
      if (!analysis.exists) {
        missingFiles.push({
          type: 'Product',
          id: product._id,
          field: 'video',
          path: product.video,
          analysis,
          similarFiles: findSimilarFiles(product.video)
        });
      }
    }
  }

  return missingFiles;
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

  const missingFiles = [];

  for (const brand of brands) {
    if (brand.logo) {
      const analysis = analyzeFileExistence(brand.logo);
      if (!analysis.exists) {
        missingFiles.push({
          type: 'Brand',
          id: brand._id,
          field: 'logo',
          path: brand.logo,
          analysis,
          similarFiles: findSimilarFiles(brand.logo)
        });
      }
    }
  }

  return missingFiles;
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

  const missingFiles = [];

  for (const category of categories) {
    if (category.image) {
      const analysis = analyzeFileExistence(category.image);
      if (!analysis.exists) {
        missingFiles.push({
          type: 'Category',
          id: category._id,
          field: 'image',
          path: category.image,
          analysis,
          similarFiles: findSimilarFiles(category.image)
        });
      }
    }
  }

  return missingFiles;
};

/**
 * Print detailed missing files report
 */
const printMissingFilesReport = (missingFiles) => {
  console.log('\n📊 MISSING FILES DETAILED ANALYSIS:');
  console.log('=' .repeat(80));

  // Group by reason
  const byReason = missingFiles.reduce((acc, file) => {
    if (!acc[file.analysis.reason]) acc[file.analysis.reason] = [];
    acc[file.analysis.reason].push(file);
    return acc;
  }, {});

  Object.entries(byReason).forEach(([reason, files]) => {
    console.log(`\n🔍 REASON: ${reason.toUpperCase()}`);
    console.log(`   Count: ${files.length} files`);
    
    files.forEach(file => {
      console.log(`   - ${file.type} ${file.id} (${file.field}): ${file.path}`);
      
      if (file.similarFiles.length > 0) {
        console.log(`     Similar files found:`);
        file.similarFiles.forEach(similar => {
          console.log(`       • ${similar.path} (${similar.size} bytes, ${similar.modified})`);
        });
      }
    });
  });

  // Group by path pattern
  console.log('\n📁 MISSING FILES BY PATH PATTERN:');
  const byPattern = missingFiles.reduce((acc, file) => {
    const pattern = file.path.split('/')[0] || 'root';
    if (!acc[pattern]) acc[pattern] = [];
    acc[pattern].push(file);
    return acc;
  }, {});

  Object.entries(byPattern).forEach(([pattern, files]) => {
    console.log(`\n   ${pattern}/: ${files.length} files`);
    files.slice(0, 5).forEach(file => {
      console.log(`     - ${file.path}`);
    });
    if (files.length > 5) {
      console.log(`     ... and ${files.length - 5} more`);
    }
  });

  // Summary
  console.log('\n📈 SUMMARY:');
  console.log(`   Total missing files: ${missingFiles.length}`);
  console.log(`   Files with similar matches: ${missingFiles.filter(f => f.similarFiles.length > 0).length}`);
  console.log(`   Files with no matches: ${missingFiles.filter(f => f.similarFiles.length === 0).length}`);
};

/**
 * Main investigation function
 */
const investigateMissingFiles = async () => {
  try {
    console.log('🔍 Starting Missing Files Investigation...');
    console.log('This will analyze why files are missing and find similar files.\n');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://localhost:27017/ecommerce_db');
    console.log('✅ Connected to MongoDB\n');

    // Run analysis
    const productMissing = await analyzeProductFiles();
    const brandMissing = await analyzeBrandFiles();
    const categoryMissing = await analyzeCategoryFiles();

    const allMissingFiles = [...productMissing, ...brandMissing, ...categoryMissing];

    // Print detailed report
    printMissingFilesReport(allMissingFiles);

    console.log('\n💡 RECOMMENDATIONS:');
    if (allMissingFiles.length > 0) {
      console.log('1. Check if files exist in different locations');
      console.log('2. Verify file naming conventions');
      console.log('3. Check if files were moved or deleted');
      console.log('4. Consider updating database paths if files exist elsewhere');
    } else {
      console.log('✅ No missing files found!');
    }
    
  } catch (error) {
    console.error('❌ Investigation failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

// Run investigation if this script is executed directly
if (require.main === module) {
  investigateMissingFiles();
}

module.exports = {
  investigateMissingFiles,
  analyzeFileExistence,
  findSimilarFiles
};
