const mongoose = require('mongoose');
const Product = require('../../models/Product');
const {
  createOrUpdateBulkPricing,
  getBulkPricing,
  deleteBulkPricing,
  validateBulkPricing,
  getBulkPricingAnalytics,
  getProductsWithBulkPricing,
  testBulkPricingCalculation
} = require('../../controllers/bulkPricingController');

describe('Bulk Pricing Controller', () => {
  let testProduct;
  let mockReq;
  let mockRes;

  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test-bulk-pricing');
    }
  });

  afterAll(async () => {
    await Product.deleteMany({});
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  });

  beforeEach(async () => {
    await Product.deleteMany({});
    
    // Create test product
    testProduct = new Product({
      name: 'Test Product',
      sku: 'TEST-BULK-001',
      regularPrice: 100,
      bulkDiscount: {
        enabled: false,
        tiers: []
      }
    });
    await testProduct.save();

    // Mock request and response objects
    mockReq = {
      params: {},
      body: {},
      query: {}
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('createOrUpdateBulkPricing', () => {
    test('should create bulk pricing for a product', async () => {
      mockReq.params.productId = testProduct._id.toString();
      mockReq.body.bulkDiscount = {
        enabled: true,
        tiers: [
          {
            minQuantity: 5,
            maxQuantity: 9,
            discountType: 'percentage',
            discountValue: 10
          }
        ]
      };

      await createOrUpdateBulkPricing(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Bulk pricing updated successfully'
        })
      );
    });

    test('should return 404 for non-existent product', async () => {
      mockReq.params.productId = new mongoose.Types.ObjectId().toString();
      mockReq.body.bulkDiscount = {
        enabled: true,
        tiers: [
          {
            minQuantity: 5,
            discountType: 'percentage',
            discountValue: 10
          }
        ]
      };

      await createOrUpdateBulkPricing(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Product not found'
        })
      );
    });

    test('should return 400 for invalid bulk discount configuration', async () => {
      mockReq.params.productId = testProduct._id.toString();
      mockReq.body.bulkDiscount = {
        enabled: true,
        tiers: [
          {
            minQuantity: 10,
            maxQuantity: 5, // Invalid: max < min
            discountType: 'percentage',
            discountValue: 10
          }
        ]
      };

      await createOrUpdateBulkPricing(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Invalid bulk discount configuration'
        })
      );
    });
  });

  describe('getBulkPricing', () => {
    test('should get bulk pricing for a product', async () => {
      // First create bulk pricing
      testProduct.bulkDiscount = {
        enabled: true,
        tiers: [
          {
            minQuantity: 5,
            maxQuantity: 9,
            discountType: 'percentage',
            discountValue: 10
          }
        ]
      };
      await testProduct.save();

      mockReq.params.productId = testProduct._id.toString();

      await getBulkPricing(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      const responseData = mockRes.json.mock.calls[0][0];
      expect(responseData.success).toBe(true);
      expect(responseData.product._id.toString()).toBe(testProduct._id.toString());
      expect(responseData.product.name).toBe('Test Product');
      expect(responseData.product.regularPrice).toBe(100);
      expect(responseData.product.bulkDiscount.enabled).toBe(true);
      expect(responseData.product.bulkDiscount.tiers).toHaveLength(1);
      expect(responseData.product.bulkDiscount.tiers[0].minQuantity).toBe(5);
      expect(responseData.product.bulkDiscount.tiers[0].maxQuantity).toBe(9);
      expect(responseData.product.bulkDiscount.tiers[0].discountType).toBe('percentage');
      expect(responseData.product.bulkDiscount.tiers[0].discountValue).toBe(10);
    });

    test('should return 404 for non-existent product', async () => {
      mockReq.params.productId = new mongoose.Types.ObjectId().toString();

      await getBulkPricing(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Product not found'
        })
      );
    });
  });

  describe('deleteBulkPricing', () => {
    test('should delete bulk pricing for a product', async () => {
      // First create bulk pricing
      testProduct.bulkDiscount = {
        enabled: true,
        tiers: [
          {
            minQuantity: 5,
            maxQuantity: 9,
            discountType: 'percentage',
            discountValue: 10
          }
        ]
      };
      await testProduct.save();

      mockReq.params.productId = testProduct._id.toString();

      await deleteBulkPricing(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Bulk pricing deleted successfully'
        })
      );
    });

    test('should return 404 for non-existent product', async () => {
      mockReq.params.productId = new mongoose.Types.ObjectId().toString();

      await deleteBulkPricing(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Product not found'
        })
      );
    });
  });

  describe('validateBulkPricing', () => {
    test('should validate bulk pricing configuration', async () => {
      mockReq.body.bulkDiscount = {
        enabled: true,
        tiers: [
          {
            minQuantity: 5,
            maxQuantity: 9,
            discountType: 'percentage',
            discountValue: 10
          }
        ]
      };
      mockReq.body.regularPrice = 100;

      await validateBulkPricing(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          validation: expect.objectContaining({
            isValid: true
          })
        })
      );
    });

    test('should return validation errors for invalid configuration', async () => {
      mockReq.body.bulkDiscount = {
        enabled: true,
        tiers: [
          {
            minQuantity: 10,
            maxQuantity: 5, // Invalid: max < min
            discountType: 'percentage',
            discountValue: 150 // Invalid: > 100%
          }
        ]
      };
      mockReq.body.regularPrice = 100;

      await validateBulkPricing(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          validation: expect.objectContaining({
            isValid: false
          })
        })
      );
    });

    test('should return 400 for invalid regular price', async () => {
      mockReq.body.bulkDiscount = {};
      mockReq.body.regularPrice = -10;

      await validateBulkPricing(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Invalid regular price'
        })
      );
    });
  });

  describe('getBulkPricingAnalytics', () => {
    test('should get bulk pricing analytics for a product with bulk pricing', async () => {
      // First create bulk pricing
      testProduct.bulkDiscount = {
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
            discountType: 'fixed',
            discountValue: 20
          }
        ]
      };
      await testProduct.save();

      mockReq.params.productId = testProduct._id.toString();

      await getBulkPricingAnalytics(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          analytics: expect.objectContaining({
            hasBulkPricing: true,
            bulkPricing: expect.objectContaining({
              totalTiers: 2
            })
          })
        })
      );
    });

    test('should return analytics for product without bulk pricing', async () => {
      mockReq.params.productId = testProduct._id.toString();

      await getBulkPricingAnalytics(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          analytics: expect.objectContaining({
            hasBulkPricing: false
          })
        })
      );
    });

    test('should return 404 for non-existent product', async () => {
      mockReq.params.productId = new mongoose.Types.ObjectId().toString();

      await getBulkPricingAnalytics(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Product not found'
        })
      );
    });
  });

  describe('getProductsWithBulkPricing', () => {
    test('should get products with bulk pricing', async () => {
      // Create products with and without bulk pricing
      const productWithBulk = new Product({
        name: 'Product with Bulk',
        sku: 'BULK-001',
        regularPrice: 100,
        bulkDiscount: {
          enabled: true,
          tiers: [
            {
              minQuantity: 5,
              discountType: 'percentage',
              discountValue: 10
            }
          ]
        }
      });
      await productWithBulk.save();

      const productWithoutBulk = new Product({
        name: 'Product without Bulk',
        sku: 'NO-BULK-001',
        regularPrice: 50,
        bulkDiscount: {
          enabled: false,
          tiers: []
        }
      });
      await productWithoutBulk.save();

      mockReq.query = { enabled: 'true' };

      await getProductsWithBulkPricing(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          products: expect.arrayContaining([
            expect.objectContaining({
              name: 'Product with Bulk'
            })
          ]),
          pagination: expect.objectContaining({
            totalProducts: 1
          })
        })
      );
    });

    test('should handle pagination', async () => {
      mockReq.query = { page: '1', limit: '5' };

      await getProductsWithBulkPricing(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          pagination: expect.objectContaining({
            currentPage: 1
          })
        })
      );
    });
  });

  describe('testBulkPricingCalculation', () => {
    test('should test bulk pricing calculation', async () => {
      // First create bulk pricing
      testProduct.bulkDiscount = {
        enabled: true,
        tiers: [
          {
            minQuantity: 5,
            maxQuantity: 9,
            discountType: 'percentage',
            discountValue: 10
          }
        ]
      };
      await testProduct.save();

      mockReq.params.productId = testProduct._id.toString();
      mockReq.body.quantity = 7;

      await testBulkPricingCalculation(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          calculation: expect.objectContaining({
            quantity: 7,
            result: expect.objectContaining({
              success: true,
              discountedPrice: 90 // 100 * (1 - 0.1)
            })
          })
        })
      );
    });

    test('should return 400 for invalid quantity', async () => {
      mockReq.params.productId = testProduct._id.toString();
      mockReq.body.quantity = -5;

      await testBulkPricingCalculation(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Invalid quantity'
        })
      );
    });

    test('should return 404 for non-existent product', async () => {
      mockReq.params.productId = new mongoose.Types.ObjectId().toString();
      mockReq.body.quantity = 5;

      await testBulkPricingCalculation(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Product not found'
        })
      );
    });
  });
});