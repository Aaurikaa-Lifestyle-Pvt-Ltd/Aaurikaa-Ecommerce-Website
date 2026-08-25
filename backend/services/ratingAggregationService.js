const Review = require("../models/Review");
const Product = require("../models/Product");
const Seller = require("../models/Seller");

/**
 * Rating Aggregation Service
 * 
 * Handles calculation and update of product and seller ratings
 * based on reviews in the Review collection.
 */

/**
 * Update product ratings based on approved reviews
 * @param {String} productId - Product ID
 * @returns {Promise<Object>} Updated rating data
 */
const updateProductRatings = async (productId) => {
  try {
    // Query all approved reviews for the product
    const reviews = await Review.find({
      product: productId,
      status: "approved"
    });

    if (reviews.length === 0) {
      // No reviews - set to defaults
      await Product.findByIdAndUpdate(productId, {
        avgRating: 0,
        reviewCount: 0
      });
      return { avgRating: 0, reviewCount: 0 };
    }

    // Calculate average rating
    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    const avgRating = totalRating / reviews.length;
    const reviewCount = reviews.length;

    // Update product
    await Product.findByIdAndUpdate(productId, {
      avgRating: Math.round(avgRating * 10) / 10, // Round to 1 decimal place
      reviewCount: reviewCount
    });

    return {
      avgRating: Math.round(avgRating * 10) / 10,
      reviewCount: reviewCount
    };
  } catch (error) {
    console.error("Error updating product ratings:", error);
    throw error;
  }
};

/**
 * Update seller ratings based on all approved reviews for seller's products
 * @param {String} sellerId - Seller ID
 * @returns {Promise<Object>} Updated rating data
 */
const updateSellerRatings = async (sellerId) => {
  try {
    // Query all approved reviews for seller's products
    const reviews = await Review.find({
      seller: sellerId,
      status: "approved"
    });

    if (reviews.length === 0) {
      // No reviews - set to defaults
      await Seller.findByIdAndUpdate(sellerId, {
        avgRating: 0,
        reviewCount: 0,
        ratingBreakdown: {
          fiveStar: 0,
          fourStar: 0,
          threeStar: 0,
          twoStar: 0,
          oneStar: 0
        }
      });
      return {
        avgRating: 0,
        reviewCount: 0,
        ratingBreakdown: {
          fiveStar: 0,
          fourStar: 0,
          threeStar: 0,
          twoStar: 0,
          oneStar: 0
        }
      };
    }

    // Calculate average rating
    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    const avgRating = totalRating / reviews.length;

    // Calculate rating breakdown
    const ratingBreakdown = {
      fiveStar: reviews.filter(r => r.rating === 5).length,
      fourStar: reviews.filter(r => r.rating === 4).length,
      threeStar: reviews.filter(r => r.rating === 3).length,
      twoStar: reviews.filter(r => r.rating === 2).length,
      oneStar: reviews.filter(r => r.rating === 1).length
    };

    // Update seller
    await Seller.findByIdAndUpdate(sellerId, {
      avgRating: Math.round(avgRating * 10) / 10, // Round to 1 decimal place
      reviewCount: reviews.length,
      ratingBreakdown: ratingBreakdown
    });

    return {
      avgRating: Math.round(avgRating * 10) / 10,
      reviewCount: reviews.length,
      ratingBreakdown: ratingBreakdown
    };
  } catch (error) {
    console.error("Error updating seller ratings:", error);
    throw error;
  }
};

/**
 * Update ratings for both product and seller
 * Called after review create/update/delete
 * @param {String} productId - Product ID
 * @param {String} sellerId - Seller ID
 * @returns {Promise<Object>} Updated rating data for both
 */
const updateRatings = async (productId, sellerId) => {
  try {
    const [productRatings, sellerRatings] = await Promise.all([
      updateProductRatings(productId),
      updateSellerRatings(sellerId)
    ]);

    return {
      product: productRatings,
      seller: sellerRatings
    };
  } catch (error) {
    console.error("Error updating ratings:", error);
    throw error;
  }
};

module.exports = {
  updateProductRatings,
  updateSellerRatings,
  updateRatings
};



