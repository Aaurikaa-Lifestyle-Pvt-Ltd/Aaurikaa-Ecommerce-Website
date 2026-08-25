const mongoose = require('mongoose');
const Product = require('../../models/Product');

describe('Product Schema - Bulk Discount Fields', () => {
  beforeAll(async () => {
    // Connect to test database if not already connected
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test-bulk-discount');
    }
  });

  afterAll(async () => {
    // Clean up and disconnect
    await Product.deleteMany({});
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  });

  beforeEach(async () => {
    // Clean up before each test
    await Product.deleteMany({});
  });

  describe('Bulk Discount Schema Structure', () => {
    test('should have bulkDiscount field with correct structure', () => {
      const product = new Product({
        name: 'Test Product',
        sku: 'TEST-001',
        regularPrice: 100,
        bulkDiscount: {
          enabled: true,
          tiers: []
        }
      });

      expect(product.bulkDiscount).toBeDefined();
      expect(product.bulkDiscount.enabled).toBe(true);
      expect(product.bulkDiscount.tiers).toEqual([]);
    });

    test('should default bulkDiscount.enabled to false', () => {
      const product = new Product({
        name: 'Test Product',
        sku: 'TEST-002',
        regularPrice: 100
      });

      expect(product.bulkDiscount.enabled).toBe(false);
    });
  });

  describe('Bulk Discount Tiers Validation', () => {
    test('should accept valid percentage discount tier', async () => {
      const product = new Product({
        name: 'Test Product',
        sku: 'TEST-003',
        regularPrice: 100,
        bulkDiscount: {
          enabled: true,
          tiers: [{
            minQuantity: 5,
            maxQuantity: 10,
            discountType: 'percentage',
            discountValue: 10
          }]
        }
      });

      await expect(product.save()).resolves.toBeDefined();
      expect(product.bulkDiscount.tiers[0].price).toBe(90); // 100 * (1 - 0.1)
    });

    test('should accept valid fixed discount tier', async () => {
      const product = new Product({
        name: 'Test Product',
        sku: 'TEST-004',
        regularPrice: 100,
        bulkDiscount: {
          enabled: true,
          tiers: [{
            minQuantity: 5,
            discountType: 'fixed',
            discountValue: 20
          }]
        }
      });

      await expect(product.save()).resolves.toBeDefined();
      expect(product.bulkDiscount.tiers[0].price).toBe(80); // 100 - 20
    });

    test('should reject tier with minQuantity >= maxQuantity', async () => {
      const product = new Product({
        name: 'Test Product',
        sku: 'TEST-005',
        regularPrice: 100,
        bulkDiscount: {
          enabled: true,
          tiers: [{
            minQuantity: 10,
            maxQuantity: 5,
            discountType: 'percentage',
            discountValue: 10
          }]
        }
      });

      await expect(product.save()).rejects.toThrow('minQuantity must be less than maxQuantity');
    });

    test('should reject percentage discount > 100%', async () => {
      const product = new Product({
        name: 'Test Product',
        sku: 'TEST-006',
        regularPrice: 100,
        bulkDiscount: {
          enabled: true,
          tiers: [{
            minQuantity: 5,
            discountType: 'percentage',
            discountValue: 150
          }]
        }
      });

      await expect(product.save()).rejects.toThrow('Percentage discount cannot exceed 100%');
    });

    test('should reject fixed discount >= regular price', async () => {
      const product = new Product({
        name: 'Test Product',
        sku: 'TEST-007',
        regularPrice: 100,
        bulkDiscount: {
          enabled: true,
          tiers: [{
            minQuantity: 5,
            discountType: 'fixed',
            discountValue: 100
          }]
        }
      });

      await expect(product.save()).rejects.toThrow('Fixed discount cannot exceed regular price');
    });

    test('should reject overlapping quantity ranges', async () => {
      const product = new Product({
        name: 'Test Product',
        sku: 'TEST-008',
        regularPrice: 100,
        bulkDiscount: {
          enabled: true,
          tiers: [
            {
              minQuantity: 5,
              maxQuantity: 10,
              discountType: 'percentage',
              discountValue: 10
            },
            {
              minQuantity: 8,
              maxQuantity: 15,
              discountType: 'percentage',
              discountValue: 15
            }
          ]
        }
      });

      await expect(product.save()).rejects.toThrow('Quantity ranges cannot overlap');
    });

    test('should require tiers when bulk discount is enabled', async () => {
      const product = new Product({
        name: 'Test Product',
        sku: 'TEST-009',
        regularPrice: 100,
        bulkDiscount: {
          enabled: true,
          tiers: []
        }
      });

      await expect(product.save()).rejects.toThrow('Bulk discount tiers are required when bulk discount is enabled');
    });
  });

  describe('Bulk Discount Calculation Methods', () => {
    let product;

    beforeEach(async () => {
      product = new Product({
        name: 'Test Product',
        sku: 'TEST-010',
        regularPrice: 100,
        bulkDiscount: {
          enabled: true,
          tiers: [
            {
              minQuantity: 5,
              maxQuantity: 9,
              discountType: 'percentage',
              discountValue: 10
            },
            {
              minQuantity: 10,
              maxQuantity: 19,
              discountType: 'percentage',
              discountValue: 20
            },
            {
              minQuantity: 20,
              discountType: 'fixed',
              discountValue: 30
            }
          ]
        }
      });
      await product.save();
    });

    test('calculateBulkPrice should return regular price for quantity below minimum', () => {
      expect(product.calculateBulkPrice(3)).toBe(100);
    });

    test('calculateBulkPrice should return discounted price for valid tier', () => {
      expect(product.calculateBulkPrice(7)).toBe(90); // 100 * (1 - 0.1)
      expect(product.calculateBulkPrice(15)).toBe(80); // 100 * (1 - 0.2)
      expect(product.calculateBulkPrice(25)).toBe(70); // 100 - 30
    });

    test('calculateBulkPrice should return regular price when bulk discount disabled', async () => {
      product.bulkDiscount.enabled = false;
      await product.save();
      expect(product.calculateBulkPrice(10)).toBe(100);
    });

    test('getBulkDiscountInfo should return null for quantity below minimum', () => {
      expect(product.getBulkDiscountInfo(3)).toBeNull();
    });

    test('getBulkDiscountInfo should return discount info for valid tier', () => {
      const info = product.getBulkDiscountInfo(7);
      expect(info).toBeDefined();
      expect(info.originalPrice).toBe(100);
      expect(info.discountedPrice).toBe(90);
      expect(info.savings).toBe(10);
      expect(info.savingsPercentage).toBe(10);
    });

    test('getBulkDiscountInfo should return null when bulk discount disabled', async () => {
      product.bulkDiscount.enabled = false;
      await product.save();
      expect(product.getBulkDiscountInfo(10)).toBeNull();
    });
  });

  describe('Tier Sorting', () => {
    test('should sort tiers by minQuantity on save', async () => {
      const product = new Product({
        name: 'Test Product',
        sku: 'TEST-011',
        regularPrice: 100,
        bulkDiscount: {
          enabled: true,
          tiers: [
            {
              minQuantity: 20,
              discountType: 'fixed',
              discountValue: 30
            },
            {
              minQuantity: 5,
              maxQuantity: 9,
              discountType: 'percentage',
              discountValue: 10
            },
            {
              minQuantity: 10,
              maxQuantity: 19,
              discountType: 'percentage',
              discountValue: 20
            }
          ]
        }
      });

      await product.save();
      expect(product.bulkDiscount.tiers[0].minQuantity).toBe(5);
      expect(product.bulkDiscount.tiers[1].minQuantity).toBe(10);
      expect(product.bulkDiscount.tiers[2].minQuantity).toBe(20);
    });
  });
});
