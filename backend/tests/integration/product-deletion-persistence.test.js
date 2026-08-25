/**
 * Product Deletion Persistence Tests
 * Tests for SRS requirement: Ratings persist even if product is removed
 */

const mongoose = require('mongoose');
const Review = require('../../models/Review');
const Product = require('../../models/Product');
const Seller = require('../../models/Seller');
const Shopper = require('../../models/Shopper');
const ratingAggregationService = require('../../services/ratingAggregationService');

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

describe('Review Persistence After Product Deletion', () => {
  beforeEach(async () => {
    await Review.deleteMany({});
    await Product.deleteMany({});
    await Seller.deleteMany({});
    await Shopper.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('TC-REV-028: Reviews Persist After Product Deletion', () => {
    it('should maintain reviews after product deletion', async () => {
      const seller = await createTestSeller();
      const product = await createTestProduct({ seller: seller._id });
      const shopper = await createTestShopper();

      // Create reviews
      const review = await createReview(product, shopper, 'shopper', 5, 'Review');
      const productSku = product.sku;

      // Delete product
      await Product.findByIdAndDelete(product._id);

      // Verify review still exists
      const existingReview = await Review.findById(review._id);
      expect(existingReview).not.toBeNull();
      expect(existingReview.productSku).toBe(productSku);

      // Query reviews by SKU
      const reviewsBySku = await Review.find({ productSku });
      expect(reviewsBySku.length).toBe(1);
      expect(reviewsBySku[0].rating).toBe(5);
      expect(reviewsBySku[0].comment).toBe('Review');
    });

    it('should maintain multiple reviews after product deletion', async () => {
      const seller = await createTestSeller();
      const product = await createTestProduct({ seller: seller._id });
      const shopper1 = await createTestShopper();
      const shopper2 = await createTestShopper();

      // Create multiple reviews
      await createReview(product, shopper1, 'shopper', 5, 'Review 1');
      await createReview(product, shopper2, 'shopper', 4, 'Review 2');
      const productSku = product.sku;

      // Delete product
      await Product.findByIdAndDelete(product._id);

      // Verify all reviews still exist
      const reviewsBySku = await Review.find({ productSku });
      expect(reviewsBySku.length).toBe(2);
    });

    it('should allow querying reviews by productSku after deletion', async () => {
      const seller = await createTestSeller();
      const product = await createTestProduct({ seller: seller._id });
      const shopper = await createTestShopper();

      // Create review
      await createReview(product, shopper, 'shopper', 5, 'Review');
      const productSku = product.sku;

      // Delete product
      await Product.findByIdAndDelete(product._id);

      // Query by SKU should work
      const reviews = await Review.find({ productSku, status: 'approved' });
      expect(reviews.length).toBe(1);
      expect(reviews[0].productSku).toBe(productSku);
    });

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

      // Recalculate seller rating (should include deleted product review)
      await ratingAggregationService.updateSellerRatings(seller._id);

      updatedSeller = await Seller.findById(seller._id);
      expect(updatedSeller.avgRating).toBe(4.5); // Still includes deleted product review
      expect(updatedSeller.reviewCount).toBe(2);
    });

    it('should maintain seller rating with multiple deleted products', async () => {
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

      // Recalculate (should include all reviews, even from deleted products)
      await ratingAggregationService.updateSellerRatings(seller._id);

      updatedSeller = await Seller.findById(seller._id);
      expect(updatedSeller.avgRating).toBe(4); // (5+4+3)/3 = 4 (all reviews still counted)
      expect(updatedSeller.reviewCount).toBe(3);
    });
  });
});

