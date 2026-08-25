/**
 * Rating Aggregation Performance Tests
 * Tests for performance of rating aggregation with large datasets
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
    username: `testshopper${Date.now()}-${Math.random()}`,
    email: `testshopper${Date.now()}-${Math.random()}@test.com`,
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

const createMultipleShoppers = async (count) => {
  const shoppers = [];
  for (let i = 0; i < count; i++) {
    shoppers.push(await createTestShopper());
  }
  return shoppers;
};

describe('Rating Aggregation Performance', () => {
  beforeEach(async () => {
    await Review.deleteMany({});
    await Product.deleteMany({});
    await Seller.deleteMany({});
    await Shopper.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('TC-REV-030: Rating Aggregation Performance', () => {
    it('should aggregate ratings efficiently for large datasets', async () => {
      const product = await createTestProduct();
      const shoppers = await createMultipleShoppers(1000);

      // Create 1000 reviews
      const startTime = Date.now();
      for (let i = 0; i < 1000; i++) {
        await createReview(
          product,
          shoppers[i],
          'shopper',
          Math.floor(Math.random() * 5) + 1
        );
      }
      const createTime = Date.now() - startTime;

      // Calculate ratings
      const aggregationStartTime = Date.now();
      await ratingAggregationService.updateProductRatings(product._id);
      const aggregationTime = Date.now() - aggregationStartTime;

      // Verify performance
      expect(aggregationTime).toBeLessThan(5000); // Should complete in < 5 seconds

      // Verify correctness
      const updatedProduct = await Product.findById(product._id);
      expect(updatedProduct.reviewCount).toBe(1000);
      expect(updatedProduct.avgRating).toBeGreaterThan(0);
      expect(updatedProduct.avgRating).toBeLessThanOrEqual(5);

      console.log(`Created 1000 reviews in ${createTime}ms`);
      console.log(`Aggregated ratings in ${aggregationTime}ms`);
    }, 30000); // 30 second timeout for large dataset

    it('should handle seller rating aggregation with many products', async () => {
      const seller = await createTestSeller();
      const products = [];
      const shoppers = await createMultipleShoppers(100);

      // Create 50 products
      for (let i = 0; i < 50; i++) {
        products.push(await createTestProduct({ seller: seller._id }));
      }

      // Create 5 reviews per product (250 total reviews)
      const startTime = Date.now();
      for (let i = 0; i < 50; i++) {
        for (let j = 0; j < 5; j++) {
          await createReview(
            products[i],
            shoppers[j % 100],
            'shopper',
            Math.floor(Math.random() * 5) + 1
          );
        }
      }
      const createTime = Date.now() - startTime;

      // Calculate seller ratings
      const aggregationStartTime = Date.now();
      await ratingAggregationService.updateSellerRatings(seller._id);
      const aggregationTime = Date.now() - aggregationStartTime;

      // Verify performance
      expect(aggregationTime).toBeLessThan(3000); // Should complete in < 3 seconds

      // Verify correctness
      const updatedSeller = await Seller.findById(seller._id);
      expect(updatedSeller.reviewCount).toBe(250);
      expect(updatedSeller.avgRating).toBeGreaterThan(0);
      expect(updatedSeller.avgRating).toBeLessThanOrEqual(5);

      console.log(`Created 250 reviews across 50 products in ${createTime}ms`);
      console.log(`Aggregated seller ratings in ${aggregationTime}ms`);
    }, 20000); // 20 second timeout
  });
});

