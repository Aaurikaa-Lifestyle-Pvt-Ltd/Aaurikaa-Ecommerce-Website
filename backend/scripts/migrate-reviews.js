/**
 * Migration Script: Migrate embedded reviews from Product to Review collection
 * 
 * This script:
 * 1. Finds products with embedded reviews
 * 2. Creates Review documents from embedded reviews
 * 3. Sets productSku for persistence
 * 4. Links to seller
 * 5. Calculates product avgRating and reviewCount
 * 6. Calculates seller avgRating and reviewCount
 * 7. Updates Product and Seller documents
 * 
 * Run: node backend/scripts/migrate-reviews.js
 * 
 * ⚠️  WARNING: This will modify the database. Run dry-run first:
 * node backend/scripts/migrate-reviews-dryrun.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Review = require('../models/Review');
const Seller = require('../models/Seller');
const Shopper = require('../models/Shopper');
const Admin = require('../models/Admin');
const { updateRatings } = require('../services/ratingAggregationService');

/**
 * Get reviewer info helper
 */
async function getReviewerInfo(userId, role) {
  let reviewer = null;
  let roleModel = null;

  try {
    switch (role) {
      case "shopper":
        reviewer = await Shopper.findById(userId);
        roleModel = "Shopper";
        break;
      case "seller":
        reviewer = await Seller.findById(userId);
        roleModel = "Seller";
        break;
      case "admin":
        reviewer = await Admin.findById(userId);
        roleModel = "Admin";
        break;
      default:
        return null;
    }

    if (!reviewer) {
      return null;
    }

    // Extract name based on model structure
    let name = reviewer.username; // fallback
    if (role === "admin" && reviewer.name) {
      name = reviewer.name;
    } else if ((role === "shopper" || role === "seller") && (reviewer.firstName || reviewer.lastName)) {
      name = `${reviewer.firstName || ""} ${reviewer.lastName || ""}`.trim();
    } else if (reviewer.name) {
      name = reviewer.name;
    }

    return {
      userId: reviewer._id,
      role: role,
      roleModel: roleModel,
      name: name,
      email: reviewer.email
    };
  } catch (error) {
    console.error(`Error getting reviewer info for ${userId}:`, error.message);
    return null;
  }
}

async function migrate() {
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
    const products = await Product.find({}).lean();
    
    console.log(`📊 Total products found: ${products.length}\n`);

    let productsProcessed = 0;
    let productsWithReviews = 0;
    let reviewsCreated = 0;
    let reviewsSkipped = 0;
    let reviewsUpdated = 0;
    let errors = [];

    for (const product of products) {
      productsProcessed++;

      // Check if product has embedded reviews
      const embeddedReviews = product.reviews;
      
      if (!embeddedReviews || !Array.isArray(embeddedReviews) || embeddedReviews.length === 0) {
        continue;
      }

      productsWithReviews++;
      console.log(`\n📦 Processing product: ${product.name} (SKU: ${product.sku})`);

      // Validate product has seller
      if (!product.seller) {
        console.log(`   ⚠️  Skipping - Product has no seller`);
        errors.push({
          productId: product._id,
          sku: product.sku,
          error: 'No seller assigned'
        });
        continue;
      }

      // Validate product has SKU
      if (!product.sku) {
        console.log(`   ⚠️  Skipping - Product has no SKU`);
        errors.push({
          productId: product._id,
          error: 'No SKU assigned'
        });
        continue;
      }

      for (const embeddedReview of embeddedReviews) {
        try {
          // Validate review data
          if (!embeddedReview.userId) {
            console.log(`   ⚠️  Skipping review - No userId`);
            reviewsSkipped++;
            continue;
          }

          if (!embeddedReview.role || !['shopper', 'seller', 'admin'].includes(embeddedReview.role)) {
            console.log(`   ⚠️  Skipping review - Invalid role: ${embeddedReview.role}`);
            reviewsSkipped++;
            continue;
          }

          if (!embeddedReview.rating || embeddedReview.rating < 1 || embeddedReview.rating > 5) {
            console.log(`   ⚠️  Skipping review - Invalid rating: ${embeddedReview.rating}`);
            reviewsSkipped++;
            continue;
          }

          // Get reviewer info
          const reviewerInfo = await getReviewerInfo(embeddedReview.userId, embeddedReview.role);
          if (!reviewerInfo) {
            console.log(`   ⚠️  Skipping review - Reviewer not found: ${embeddedReview.userId}`);
            reviewsSkipped++;
            continue;
          }

          // Check if review already exists (from previous migration attempt)
          const existingReview = await Review.findOne({
            product: product._id,
            "reviewer.userId": embeddedReview.userId,
            "reviewer.role": embeddedReview.role
          });

          if (existingReview) {
            // Update existing review with embedded data
            existingReview.rating = embeddedReview.rating;
            existingReview.comment = embeddedReview.comment || "";
            existingReview.reviewer = reviewerInfo;
            if (embeddedReview.createdAt) {
              existingReview.createdAt = embeddedReview.createdAt;
            }
            if (embeddedReview.updatedAt) {
              existingReview.updatedAt = embeddedReview.updatedAt;
            }
            await existingReview.save();
            reviewsUpdated++;
            console.log(`   ✅ Updated existing review (${embeddedReview.role})`);
          } else {
            // Create new review
            const review = new Review({
              product: product._id,
              productSku: product.sku,
              seller: product.seller,
              reviewer: reviewerInfo,
              rating: embeddedReview.rating,
              comment: embeddedReview.comment || "",
              isAuthoritative: embeddedReview.role === "seller" || embeddedReview.role === "admin",
              status: "approved",
              verifiedPurchase: false, // Can't verify from embedded data
              createdAt: embeddedReview.createdAt || product.createdAt,
              updatedAt: embeddedReview.updatedAt || product.updatedAt
            });

            await review.save();
            reviewsCreated++;
            console.log(`   ✅ Created review (${embeddedReview.role}, rating: ${embeddedReview.rating})`);
          }
        } catch (error) {
          console.error(`   ❌ Error processing review:`, error.message);
          errors.push({
            productId: product._id,
            productSku: product.sku,
            review: embeddedReview,
            error: error.message
          });
          reviewsSkipped++;
        }
      }

      // Update product and seller ratings after migrating all reviews
      try {
        await updateRatings(product._id, product.seller);
        console.log(`   ✅ Updated ratings for product and seller`);
      } catch (error) {
        console.error(`   ⚠️  Error updating ratings:`, error.message);
        errors.push({
          productId: product._id,
          productSku: product.sku,
          error: `Rating update failed: ${error.message}`
        });
      }
    }

    // Final summary
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📋 MIGRATION SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log(`📦 Products processed: ${productsProcessed}`);
    console.log(`📝 Products with reviews: ${productsWithReviews}`);
    console.log(`✅ Reviews created: ${reviewsCreated}`);
    console.log(`🔄 Reviews updated: ${reviewsUpdated}`);
    console.log(`⏭️  Reviews skipped: ${reviewsSkipped}`);
    console.log(`❌ Errors: ${errors.length}\n`);

    if (errors.length > 0) {
      console.log('⚠️  Errors encountered:');
      errors.slice(0, 10).forEach((error, idx) => {
        console.log(`   ${idx + 1}. Product: ${error.productSku || error.productId}`);
        console.log(`      Error: ${error.error}`);
      });
      if (errors.length > 10) {
        console.log(`   ... and ${errors.length - 10} more errors`);
      }
      console.log('');
    }

    // Verify migration
    const totalReviewsInCollection = await Review.countDocuments();
    console.log(`📊 Total reviews in Review collection: ${totalReviewsInCollection}`);

    // Check for products that still have embedded reviews (shouldn't happen, but verify)
    const productsWithEmbeddedReviews = await Product.find({
      reviews: { $exists: true, $ne: [], $type: 'array' }
    }).countDocuments();

    if (productsWithEmbeddedReviews > 0) {
      console.log(`⚠️  Warning: ${productsWithEmbeddedReviews} products still have embedded reviews`);
      console.log(`   You may want to manually clean these up after verifying the migration`);
    } else {
      console.log(`✅ No products with embedded reviews found (cleanup not needed)`);
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✅ MIGRATION COMPLETE');
    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Fatal error during migration:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run migration
migrate();



