/**
 * DRY-RUN Migration Script: Migrate embedded reviews from Product to Review collection
 * 
 * ⚠️  THIS IS A DRY-RUN - NO CHANGES WILL BE MADE TO THE DATABASE ⚠️
 * 
 * This script shows what would be migrated:
 * - Finds products with embedded reviews
 * - Shows how many reviews would be migrated
 * - Shows rating calculations
 * - Verifies data integrity
 * 
 * Run: node backend/scripts/migrate-reviews-dryrun.js
 * 
 * After reviewing the output, run the actual migration:
 * node backend/scripts/migrate-reviews.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Review = require('../models/Review');
const Seller = require('../models/Seller');
const Shopper = require('../models/Shopper');
const Admin = require('../models/Admin');

async function dryRun() {
  try {
    // Connect to MongoDB
    const mongoUri = process.argv[2] || process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL;
    
    if (!mongoUri) {
      console.error('❌ MongoDB URI not found. Please provide it as an argument or set MONGODB_URI in .env');
      process.exit(1);
    }

    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB\n');

    // Query products that might have embedded reviews
    // Note: Even though schema doesn't define reviews, MongoDB might still have the data
    const products = await Product.find({}).lean();
    
    console.log(`📊 Total products found: ${products.length}\n`);

    let productsWithReviews = 0;
    let totalReviewsToMigrate = 0;
    let reviewsByRole = { shopper: 0, seller: 0, admin: 0 };
    let productsWithoutSeller = [];
    let reviewsWithInvalidData = [];
    let migrationPlan = [];

    for (const product of products) {
      // Check if product has embedded reviews (even if schema doesn't define it)
      const embeddedReviews = product.reviews;
      
      if (embeddedReviews && Array.isArray(embeddedReviews) && embeddedReviews.length > 0) {
        productsWithReviews++;
        const productReviews = [];

        // Validate product has seller
        if (!product.seller) {
          productsWithoutSeller.push({
            productId: product._id,
            sku: product.sku,
            name: product.name,
            reviewCount: embeddedReviews.length
          });
          continue;
        }

        for (const review of embeddedReviews) {
          totalReviewsToMigrate++;

          // Validate review data
          const validation = {
            hasUserId: !!review.userId,
            hasRole: !!review.role && ['shopper', 'seller', 'admin'].includes(review.role),
            hasRating: !!review.rating && review.rating >= 1 && review.rating <= 5,
            isValid: false
          };

          if (validation.hasUserId && validation.hasRole && validation.hasRating) {
            validation.isValid = true;
            reviewsByRole[review.role] = (reviewsByRole[review.role] || 0) + 1;
          } else {
            reviewsWithInvalidData.push({
              productId: product._id,
              productSku: product.sku,
              review: {
                userId: review.userId,
                role: review.role,
                rating: review.rating,
                comment: review.comment
              },
              issues: Object.keys(validation).filter(k => !validation[k] && k !== 'isValid')
            });
          }

          productReviews.push({
            userId: review.userId,
            role: review.role || 'shopper',
            rating: review.rating,
            comment: review.comment || '',
            createdAt: review.createdAt || product.createdAt,
            updatedAt: review.updatedAt || product.updatedAt
          });
        }

        // Calculate product rating
        const validReviews = productReviews.filter(r => r.rating >= 1 && r.rating <= 5);
        const avgRating = validReviews.length > 0
          ? validReviews.reduce((sum, r) => sum + r.rating, 0) / validReviews.length
          : 0;

        migrationPlan.push({
          productId: product._id,
          productSku: product.sku,
          productName: product.name,
          sellerId: product.seller,
          reviewCount: embeddedReviews.length,
          validReviewCount: validReviews.length,
          currentAvgRating: product.avgRating || 0,
          calculatedAvgRating: Math.round(avgRating * 10) / 10,
          reviews: productReviews
        });
      }
    }

    // Summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 MIGRATION SUMMARY (DRY-RUN)');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log(`📦 Products with embedded reviews: ${productsWithReviews}`);
    console.log(`📝 Total reviews to migrate: ${totalReviewsToMigrate}`);
    console.log(`\n📊 Reviews by role:`);
    console.log(`   - Shopper: ${reviewsByRole.shopper}`);
    console.log(`   - Seller: ${reviewsByRole.seller}`);
    console.log(`   - Admin: ${reviewsByRole.admin}\n`);

    if (productsWithoutSeller.length > 0) {
      console.log(`⚠️  Products without seller (${productsWithoutSeller.length}):`);
      productsWithoutSeller.forEach(p => {
        console.log(`   - ${p.name} (SKU: ${p.sku}) - ${p.reviewCount} reviews`);
      });
      console.log('');
    }

    if (reviewsWithInvalidData.length > 0) {
      console.log(`⚠️  Reviews with invalid data (${reviewsWithInvalidData.length}):`);
      reviewsWithInvalidData.slice(0, 5).forEach(r => {
        console.log(`   - Product: ${r.productSku}, Issues: ${r.issues.join(', ')}`);
      });
      if (reviewsWithInvalidData.length > 5) {
        console.log(`   ... and ${reviewsWithInvalidData.length - 5} more`);
      }
      console.log('');
    }

    // Show sample migration plan
    if (migrationPlan.length > 0) {
      console.log('📋 Sample Migration Plan (first 5 products):');
      console.log('─────────────────────────────────────────────────────────\n');
      migrationPlan.slice(0, 5).forEach((plan, idx) => {
        console.log(`${idx + 1}. Product: ${plan.productName} (SKU: ${plan.productSku})`);
        console.log(`   - Reviews: ${plan.reviewCount} (${plan.validReviewCount} valid)`);
        console.log(`   - Current Rating: ${plan.currentAvgRating} → Calculated: ${plan.calculatedAvgRating}`);
        console.log(`   - Seller ID: ${plan.sellerId}`);
        console.log('');
      });

      if (migrationPlan.length > 5) {
        console.log(`   ... and ${migrationPlan.length - 5} more products\n`);
      }
    }

    // Seller rating impact
    console.log('📊 Seller Rating Impact:');
    const sellerStats = {};
    migrationPlan.forEach(plan => {
      const sellerId = plan.sellerId.toString();
      if (!sellerStats[sellerId]) {
        sellerStats[sellerId] = { reviewCount: 0, totalRating: 0, products: [] };
      }
      sellerStats[sellerId].reviewCount += plan.validReviewCount;
      plan.reviews.forEach(r => {
        if (r.rating >= 1 && r.rating <= 5) {
          sellerStats[sellerId].totalRating += r.rating;
        }
      });
      sellerStats[sellerId].products.push(plan.productSku);
    });

    console.log(`   - Affected sellers: ${Object.keys(sellerStats).length}`);
    Object.entries(sellerStats).slice(0, 5).forEach(([sellerId, stats]) => {
      const avgRating = stats.reviewCount > 0
        ? Math.round((stats.totalRating / stats.reviewCount) * 10) / 10
        : 0;
      console.log(`   - Seller ${sellerId}: ${stats.reviewCount} reviews, avg rating: ${avgRating}`);
    });
    if (Object.keys(sellerStats).length > 5) {
      console.log(`   ... and ${Object.keys(sellerStats).length - 5} more sellers`);
    }
    console.log('');

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ DRY-RUN COMPLETE - No changes were made');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (productsWithReviews === 0) {
      console.log('ℹ️  No products with embedded reviews found. Migration may not be needed.');
    } else {
      console.log('📝 To perform the actual migration, run:');
      console.log('   node backend/scripts/migrate-reviews.js\n');
    }

  } catch (error) {
    console.error('❌ Error during dry-run:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Disconnected from MongoDB');
  }
}

dryRun();



