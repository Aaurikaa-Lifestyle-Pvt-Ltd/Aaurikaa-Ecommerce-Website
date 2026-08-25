/**
 * Rating Aggregation Service Tests
 * Tests for rating calculation and aggregation logic
 */

const mongoose = require('mongoose');
const ratingAggregationService = require('../../services/ratingAggregationService');
const Review = require('../../models/Review');
const Product = require('../../models/Product');
const Seller = require('../../models/Seller');
const Shopper = require('../../models/Shopper');

// Helper functions
const createTestShopper = async () => {
  return await Shopper.create({
    firstName: 'Test',
    lastName: 'Shopper',
    username: `testshopper${Date.now()}`,
    email: `testshopper${Date.now()}@test.com`,
    password: 'hashedpassword',
    role: 'shopper'
  });
};

const createTestSeller = async () => {
  return await Seller.create({
    firstName: 'Test',
    lastName: 'Seller',
    username: `testseller${Date.now()}`,
    email: `testseller${Date.now()}@test.com`,
    password: 'hashedpassword',
    shopName: 'Test Shop',
    role: 'seller',
    isApproved: true
  });
};

const createTestProduct = async (options = {}) => {
  const seller = options.seller || await createTestSeller();
  return await Product.create({
    name: 'Test Product',
    sku: `SKU-${Date.now()}`,
    seller: seller._id,
    regularPrice: 100,
    stock: 10,
    status: 'published',
    approvalStatus: 'approved',
    ...options
  });
};

const createReview = async (product, reviewer, role, rating, comment = '') => {
  const reviewerInfo = {
    userId: reviewer._id,
    role: role,
    roleModel: role === 'shopper' ? 'Shopper' : role === 'seller' ? 'Seller' : 'Admin',
    name: role === 'shopper' ? 'Test Shopper' : role === 'seller' ? 'Test Seller' : 'Test Admin'
  };

  return await Review.create({
    product: product._id,
    productSku: product.sku,
    seller: product.seller,
    reviewer: reviewerInfo,
    rating: rating,
    comment: comment,
    status: 'approved',
    isAuthoritative: role !== 'shopper'
  });
};

describe('Rating Aggregation Service', () => {
  beforeEach(async () => {
    await Review.deleteMany({});
    await Product.deleteMany({});
    await Seller.deleteMany({});
    await Shopper.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('TC-REV-016: Product Rating Calculation', () => {
    it('should calculate product avgRating correctly', async () => {
      const product = await createTestProduct();
      const shopper1 = await createTestShopper();
      const shopper2 = await createTestShopper();
      const shopper3 = await createTestShopper();

      // Create reviews: 5, 4, 3
      await createReview(product, shopper1, 'shopper', 5);
      await createReview(product, shopper2, 'shopper', 4);
      await createReview(product, shopper3, 'shopper', 3);

      await ratingAggregationService.updateProductRatings(product._id);

      const updatedProduct = await Product.findById(product._id);
      expect(updatedProduct.avgRating).toBe(4); // (5+4+3)/3 = 4
      expect(updatedProduct.reviewCount).toBe(3);
    });

    it('should recalculate ratings when review is updated', async () => {
      const product = await createTestProduct();
      const shopper = await createTestShopper();

      // Create review with rating 3
      const review = await createReview(product, shopper, 'shopper', 3);
      await ratingAggregationService.updateProductRatings(product._id);

      let updatedProduct = await Product.findById(product._id);
      expect(updatedProduct.avgRating).toBe(3);

      // Update review to rating 5
      review.rating = 5;
      await review.save();
      await ratingAggregationService.updateProductRatings(product._id);

      updatedProduct = await Product.findById(product._id);
      expect(updatedProduct.avgRating).toBe(5);
    });

    it('should recalculate ratings when review is deleted', async () => {
      const product = await createTestProduct();
      const shopper1 = await createTestShopper();
      const shopper2 = await createTestShopper();

      // Create two reviews: 5, 4
      const review1 = await createReview(product, shopper1, 'shopper', 5);
      await createReview(product, shopper2, 'shopper', 4);
      await ratingAggregationService.updateProductRatings(product._id);

      let updatedProduct = await Product.findById(product._id);
      expect(updatedProduct.avgRating).toBe(4.5);
      expect(updatedProduct.reviewCount).toBe(2);

      // Delete one review
      await Review.findByIdAndDelete(review1._id);
      await ratingAggregationService.updateProductRatings(product._id);

      updatedProduct = await Product.findById(product._id);
      expect(updatedProduct.avgRating).toBe(4);
      expect(updatedProduct.reviewCount).toBe(1);
    });

    it('should handle product with no reviews', async () => {
      const product = await createTestProduct();

      await ratingAggregationService.updateProductRatings(product._id);

      const updatedProduct = await Product.findById(product._id);
      expect(updatedProduct.avgRating).toBe(0);
      expect(updatedProduct.reviewCount).toBe(0);
    });
  });

  describe('TC-REV-017: Seller Rating Calculation', () => {
    it('should calculate seller avgRating across all products', async () => {
      const seller = await createTestSeller();
      const product1 = await createTestProduct({ seller: seller._id });
      const product2 = await createTestProduct({ seller: seller._id });
      const shopper = await createTestShopper();

      // Create reviews: product1 (5 stars), product2 (4 stars)
      await createReview(product1, shopper, 'shopper', 5);
      await createReview(product2, shopper, 'shopper', 4);

      await ratingAggregationService.updateSellerRatings(seller._id);

      const updatedSeller = await Seller.findById(seller._id);
      expect(updatedSeller.avgRating).toBe(4.5);
      expect(updatedSeller.reviewCount).toBe(2);
      expect(updatedSeller.ratingBreakdown.fiveStar).toBe(1);
      expect(updatedSeller.ratingBreakdown.fourStar).toBe(1);
      expect(updatedSeller.ratingBreakdown.threeStar).toBe(0);
    });

    it('should calculate rating breakdown correctly', async () => {
      const seller = await createTestSeller();
      const product1 = await createTestProduct({ seller: seller._id });
      const product2 = await createTestProduct({ seller: seller._id });
      const product3 = await createTestProduct({ seller: seller._id });
      const shopper1 = await createTestShopper();
      const shopper2 = await createTestShopper();
      const shopper3 = await createTestShopper();
      const shopper4 = await createTestShopper();
      const shopper5 = await createTestShopper();
      const shopper6 = await createTestShopper();

      // Create reviews: 5, 5, 4, 3, 2, 1 (using different shoppers to avoid unique constraint)
      await createReview(product1, shopper1, 'shopper', 5);
      await createReview(product1, shopper2, 'shopper', 5);
      await createReview(product2, shopper3, 'shopper', 4);
      await createReview(product2, shopper4, 'shopper', 3);
      await createReview(product3, shopper5, 'shopper', 2);
      await createReview(product3, shopper6, 'shopper', 1);

      await ratingAggregationService.updateSellerRatings(seller._id);

      const updatedSeller = await Seller.findById(seller._id);
      expect(updatedSeller.ratingBreakdown.fiveStar).toBe(2);
      expect(updatedSeller.ratingBreakdown.fourStar).toBe(1);
      expect(updatedSeller.ratingBreakdown.threeStar).toBe(1);
      expect(updatedSeller.ratingBreakdown.twoStar).toBe(1);
      expect(updatedSeller.ratingBreakdown.oneStar).toBe(1);
      expect(updatedSeller.reviewCount).toBe(6);
    });

    it('should handle seller with no reviews', async () => {
      const seller = await createTestSeller();

      await ratingAggregationService.updateSellerRatings(seller._id);

      const updatedSeller = await Seller.findById(seller._id);
      expect(updatedSeller.avgRating).toBe(0);
      expect(updatedSeller.reviewCount).toBe(0);
      expect(updatedSeller.ratingBreakdown.fiveStar).toBe(0);
    });
  });

  describe('TC-REV-018: Seller Rating Persistence After Product Deletion', () => {
    it('should maintain seller rating after product deletion', async () => {
      const seller = await createTestSeller();
      const product1 = await createTestProduct({ seller: seller._id });
      const product2 = await createTestProduct({ seller: seller._id });
      const shopper = await createTestShopper();

      // Create reviews
      await createReview(product1, shopper, 'shopper', 5);
      await createReview(product2, shopper, 'shopper', 4);
      await ratingAggregationService.updateSellerRatings(seller._id);

      let updatedSeller = await Seller.findById(seller._id);
      expect(updatedSeller.avgRating).toBe(4.5);
      expect(updatedSeller.reviewCount).toBe(2);

      // Delete product1
      await Product.findByIdAndDelete(product1._id);

      // Recalculate (should include deleted product reviews)
      await ratingAggregationService.updateSellerRatings(seller._id);

      updatedSeller = await Seller.findById(seller._id);
      expect(updatedSeller.avgRating).toBe(4.5); // Still includes deleted product review
      expect(updatedSeller.reviewCount).toBe(2);
    });

    it('should include reviews from multiple deleted products', async () => {
      const seller = await createTestSeller();
      const product1 = await createTestProduct({ seller: seller._id });
      const product2 = await createTestProduct({ seller: seller._id });
      const product3 = await createTestProduct({ seller: seller._id });
      const shopper = await createTestShopper();

      // Create reviews for all products
      await createReview(product1, shopper, 'shopper', 5);
      await createReview(product2, shopper, 'shopper', 4);
      await createReview(product3, shopper, 'shopper', 3);
      await ratingAggregationService.updateSellerRatings(seller._id);

      let updatedSeller = await Seller.findById(seller._id);
      expect(updatedSeller.avgRating).toBe(4); // (5+4+3)/3 = 4
      expect(updatedSeller.reviewCount).toBe(3);

      // Delete product1 and product2
      await Product.findByIdAndDelete(product1._id);
      await Product.findByIdAndDelete(product2._id);

      // Recalculate
      await ratingAggregationService.updateSellerRatings(seller._id);

      updatedSeller = await Seller.findById(seller._id);
      expect(updatedSeller.avgRating).toBe(4); // (5+4+3)/3 = 4 (all reviews still counted)
      expect(updatedSeller.reviewCount).toBe(3);
    });
  });
});

