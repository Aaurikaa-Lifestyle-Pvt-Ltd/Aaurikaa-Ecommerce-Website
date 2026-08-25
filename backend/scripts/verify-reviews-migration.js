/**
 * Verification Script: Verify review migration data integrity
 * 
 * This script verifies:
 * 1. All reviews were migrated correctly
 * 2. Product ratings match Review collection
 * 3. Seller ratings match Review collection
 * 4. No orphaned reviews
 * 5. Data consistency
 * 
 * Run: node backend/scripts/verify-reviews-migration.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Review = require('../models/Review');
const Seller = require('../models/Seller');

async function verify() {
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

    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔍 VERIFICATION REPORT');
    console.log('═══════════════════════════════════════════════════════════\n');

    // 1. Check Review collection
    const totalReviews = await Review.countDocuments();
    console.log(`📝 Total reviews in Review collection: ${totalReviews}`);

    const approvedReviews = await Review.countDocuments({ status: 'approved' });
    console.log(`✅ Approved reviews: ${approvedReviews}`);

    const reviewsByRole = await Review.aggregate([
      {
        $group: {
          _id: '$reviewer.role',
          count: { $sum: 1 }
        }
      }
    ]);
    console.log(`\n📊 Reviews by role:`);
    reviewsByRole.forEach(r => {
      console.log(`   - ${r._id || 'unknown'}: ${r.count}`);
    });

    // 2. Check products with embedded reviews (should be 0)
    const productsWithEmbeddedReviews = await Product.find({
      reviews: { $exists: true, $ne: [], $type: 'array' }
    }).countDocuments();
    console.log(`\n📦 Products with embedded reviews: ${productsWithEmbeddedReviews}`);
    if (productsWithEmbeddedReviews > 0) {
      console.log(`   ⚠️  Warning: Some products still have embedded reviews`);
    } else {
      console.log(`   ✅ No embedded reviews found`);
    }

    // 3. Verify product ratings match Review collection
    console.log(`\n🔍 Verifying product ratings...`);
    const products = await Product.find({}).lean();
    let productsWithMismatchedRatings = [];
    let productsVerified = 0;

    for (const product of products) {
      const reviews = await Review.find({
        product: product._id,
        status: 'approved'
      }).lean();

      if (reviews.length === 0) {
        // No reviews - should have 0 rating
        if (product.avgRating !== 0 || product.reviewCount !== 0) {
          productsWithMismatchedRatings.push({
            productId: product._id,
            sku: product.sku,
            name: product.name,
            issue: 'Has ratings but no reviews',
            productRating: product.avgRating,
            productCount: product.reviewCount,
            reviewCount: 0
          });
        } else {
          productsVerified++;
        }
      } else {
        // Calculate expected rating
        const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
        const expectedAvgRating = Math.round((totalRating / reviews.length) * 10) / 10;
        const expectedCount = reviews.length;

        // Check if ratings match (allow small floating point differences)
        const ratingDiff = Math.abs(product.avgRating - expectedAvgRating);
        if (ratingDiff > 0.1 || product.reviewCount !== expectedCount) {
          productsWithMismatchedRatings.push({
            productId: product._id,
            sku: product.sku,
            name: product.name,
            issue: 'Rating mismatch',
            productRating: product.avgRating,
            productCount: product.reviewCount,
            expectedRating: expectedAvgRating,
            reviewCount: expectedCount
          });
        } else {
          productsVerified++;
        }
      }
    }

    console.log(`   ✅ Products verified: ${productsVerified}`);
    if (productsWithMismatchedRatings.length > 0) {
      console.log(`   ⚠️  Products with mismatched ratings: ${productsWithMismatchedRatings.length}`);
      productsWithMismatchedRatings.slice(0, 5).forEach(p => {
        console.log(`      - ${p.name} (SKU: ${p.sku})`);
        console.log(`        Issue: ${p.issue}`);
        if (p.expectedRating !== undefined) {
          console.log(`        Product: ${p.productRating} (${p.productCount} reviews)`);
          console.log(`        Expected: ${p.expectedRating} (${p.reviewCount} reviews)`);
        }
      });
      if (productsWithMismatchedRatings.length > 5) {
        console.log(`      ... and ${productsWithMismatchedRatings.length - 5} more`);
      }
    } else {
      console.log(`   ✅ All product ratings match`);
    }

    // 4. Verify seller ratings
    console.log(`\n🔍 Verifying seller ratings...`);
    const sellers = await Seller.find({}).lean();
    let sellersWithMismatchedRatings = [];
    let sellersVerified = 0;

    for (const seller of sellers) {
      const reviews = await Review.find({
        seller: seller._id,
        status: 'approved'
      }).lean();

      if (reviews.length === 0) {
        // No reviews - should have 0 rating
        if (seller.avgRating !== 0 || seller.reviewCount !== 0) {
          sellersWithMismatchedRatings.push({
            sellerId: seller._id,
            shopName: seller.shopName,
            issue: 'Has ratings but no reviews',
            sellerRating: seller.avgRating,
            sellerCount: seller.reviewCount,
            reviewCount: 0
          });
        } else {
          sellersVerified++;
        }
      } else {
        // Calculate expected rating
        const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
        const expectedAvgRating = Math.round((totalRating / reviews.length) * 10) / 10;
        const expectedCount = reviews.length;

        // Calculate rating breakdown
        const ratingBreakdown = {
          fiveStar: reviews.filter(r => r.rating === 5).length,
          fourStar: reviews.filter(r => r.rating === 4).length,
          threeStar: reviews.filter(r => r.rating === 3).length,
          twoStar: reviews.filter(r => r.rating === 2).length,
          oneStar: reviews.filter(r => r.rating === 1).length
        };

        // Check if ratings match
        const ratingDiff = Math.abs(seller.avgRating - expectedAvgRating);
        const breakdownMatch = 
          seller.ratingBreakdown?.fiveStar === ratingBreakdown.fiveStar &&
          seller.ratingBreakdown?.fourStar === ratingBreakdown.fourStar &&
          seller.ratingBreakdown?.threeStar === ratingBreakdown.threeStar &&
          seller.ratingBreakdown?.twoStar === ratingBreakdown.twoStar &&
          seller.ratingBreakdown?.oneStar === ratingBreakdown.oneStar;

        if (ratingDiff > 0.1 || seller.reviewCount !== expectedCount || !breakdownMatch) {
          sellersWithMismatchedRatings.push({
            sellerId: seller._id,
            shopName: seller.shopName,
            issue: 'Rating mismatch',
            sellerRating: seller.avgRating,
            sellerCount: seller.reviewCount,
            expectedRating: expectedAvgRating,
            reviewCount: expectedCount,
            breakdownMismatch: !breakdownMatch
          });
        } else {
          sellersVerified++;
        }
      }
    }

    console.log(`   ✅ Sellers verified: ${sellersVerified}`);
    if (sellersWithMismatchedRatings.length > 0) {
      console.log(`   ⚠️  Sellers with mismatched ratings: ${sellersWithMismatchedRatings.length}`);
      sellersWithMismatchedRatings.slice(0, 5).forEach(s => {
        console.log(`      - ${s.shopName || s.sellerId}`);
        console.log(`        Issue: ${s.issue}`);
        if (s.expectedRating !== undefined) {
          console.log(`        Seller: ${s.sellerRating} (${s.sellerCount} reviews)`);
          console.log(`        Expected: ${s.expectedRating} (${s.reviewCount} reviews)`);
        }
      });
      if (sellersWithMismatchedRatings.length > 5) {
        console.log(`      ... and ${sellersWithMismatchedRatings.length - 5} more`);
      }
    } else {
      console.log(`   ✅ All seller ratings match`);
    }

    // 5. Check for orphaned reviews (reviews without valid product)
    console.log(`\n🔍 Checking for orphaned reviews...`);
    const allReviews = await Review.find({}).lean();
    let orphanedReviews = 0;

    for (const review of allReviews) {
      const product = await Product.findById(review.product);
      if (!product) {
        orphanedReviews++;
      }
    }

    console.log(`   📝 Orphaned reviews (product deleted): ${orphanedReviews}`);
    if (orphanedReviews > 0) {
      console.log(`   ℹ️  These reviews are kept intentionally (per SRS: ratings persist after product deletion)`);
      console.log(`   ℹ️  They can be queried by productSku`);
    }

    // 6. Check for reviews without valid seller
    console.log(`\n🔍 Checking for reviews without valid seller...`);
    let reviewsWithoutSeller = 0;
    for (const review of allReviews) {
      const seller = await Seller.findById(review.seller);
      if (!seller) {
        reviewsWithoutSeller++;
      }
    }

    console.log(`   ⚠️  Reviews without valid seller: ${reviewsWithoutSeller}`);
    if (reviewsWithoutSeller > 0) {
      console.log(`   ⚠️  These reviews may need attention`);
    }

    // Summary
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📋 VERIFICATION SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');

    const hasIssues = 
      productsWithEmbeddedReviews > 0 ||
      productsWithMismatchedRatings.length > 0 ||
      sellersWithMismatchedRatings.length > 0 ||
      reviewsWithoutSeller > 0;

    if (hasIssues) {
      console.log('⚠️  Some issues were found. Please review the details above.');
    } else {
      console.log('✅ All verifications passed! Migration appears successful.');
    }

    console.log('');

  } catch (error) {
    console.error('❌ Error during verification:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Disconnected from MongoDB');
  }
}

verify();



