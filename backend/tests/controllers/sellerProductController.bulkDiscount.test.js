const mongoose = require('mongoose');
const Product = require('../../models/Product');
const { addProduct, updateProduct } = require('../../controllers/sellerProductController');

describe('Seller Product Controller - Bulk Discount Integration', () => {
  let mockReq;
  let mockRes;
  let testSellerId;

  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test-seller-product-bulk');
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
    
    testSellerId = new mongoose.Types.ObjectId();
    
    // Mock request and response objects
    mockReq = {
      body: {},
      user: { _id: testSellerId },
      files: {}
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('addProduct with bulk discount', () => {
    test('should create product with valid bulk discount configuration', async () => {
      mockReq.body = {
        name: 'Test Product with Bulk Discount',
        sku: 'TEST-BULK-001',
        regularPrice: 100,
        category: new mongoose.Types.ObjectId(),
        bulkDiscount: JSON.stringify({
          enabled: true,
          tiers: [
            {
              minQuantity: 5,
              maxQuantity: 9,
              discountType: 'percentage',
              discountValue: 10
            }
          ]
        })
      };

      await addProduct(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      const responseData = mockRes.json.mock.calls[0][0];
      expect(responseData.success).toBe(true);
      expect(responseData.data.product.bulkDiscount.enabled).toBe(true);
      expect(responseData.data.product.bulkDiscount.tiers).toHaveLength(1);
      expect(responseData.data.product.bulkDiscount.tiers[0].minQuantity).toBe(5);
    });

    test('should create product with disabled bulk discount', async () => {
      mockReq.body = {
        name: 'Test Product without Bulk Discount',
        sku: 'TEST-NO-BULK-001',
        regularPrice: 50,
        category: new mongoose.Types.ObjectId(),
        bulkDiscount: JSON.stringify({
          enabled: false,
          tiers: []
        })
      };

      await addProduct(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      const responseData = mockRes.json.mock.calls[0][0];
      expect(responseData.success).toBe(true);
      expect(responseData.data.product.bulkDiscount.enabled).toBe(false);
      expect(responseData.data.product.bulkDiscount.tiers).toHaveLength(0);
    });

    test('should create product with no bulk discount data', async () => {
      mockReq.body = {
        name: 'Test Product No Bulk Data',
        sku: 'TEST-NO-BULK-DATA-001',
        regularPrice: 75,
        category: new mongoose.Types.ObjectId()
        // No bulkDiscount field
      };

      await addProduct(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      const responseData = mockRes.json.mock.calls[0][0];
      expect(responseData.success).toBe(true);
      expect(responseData.data.product.bulkDiscount.enabled).toBe(false);
      expect(responseData.data.product.bulkDiscount.tiers).toHaveLength(0);
    });

    test('should reject product with invalid bulk discount configuration', async () => {
      mockReq.body = {
        name: 'Test Product Invalid Bulk',
        sku: 'TEST-INVALID-BULK-001',
        regularPrice: 100,
        category: new mongoose.Types.ObjectId(),
        bulkDiscount: JSON.stringify({
          enabled: true,
          tiers: [
            {
              minQuantity: 10,
              maxQuantity: 5, // Invalid: max < min
              discountType: 'percentage',
              discountValue: 10
            }
          ]
        })
      };

      await addProduct(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      const responseData = mockRes.json.mock.calls[0][0];
      expect(responseData.success).toBe(false);
      expect(responseData.message).toBe('Invalid bulk discount configuration');
      expect(responseData.details.errors).toBeDefined();
    });

    test('should handle malformed bulk discount JSON', async () => {
      mockReq.body = {
        name: 'Test Product Malformed Bulk',
        sku: 'TEST-MALFORMED-BULK-001',
        regularPrice: 100,
        category: new mongoose.Types.ObjectId(),
        bulkDiscount: 'invalid json'
      };

      await addProduct(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      const responseData = mockRes.json.mock.calls[0][0];
      expect(responseData.success).toBe(true);
      // Should default to disabled bulk discount
      expect(responseData.data.product.bulkDiscount.enabled).toBe(false);
      expect(responseData.data.product.bulkDiscount.tiers).toHaveLength(0);
    });

    test('should create product with multiple bulk discount tiers', async () => {
      mockReq.body = {
        name: 'Test Product Multiple Tiers',
        sku: 'TEST-MULTI-TIER-001',
        regularPrice: 100,
        category: new mongoose.Types.ObjectId(),
        bulkDiscount: JSON.stringify({
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
        })
      };

      await addProduct(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      const responseData = mockRes.json.mock.calls[0][0];
      expect(responseData.success).toBe(true);
      expect(responseData.data.product.bulkDiscount.enabled).toBe(true);
      expect(responseData.data.product.bulkDiscount.tiers).toHaveLength(3);
    });
  });

  describe('updateProduct with bulk discount', () => {
    let existingProduct;

    beforeEach(async () => {
      // Create an existing product
      existingProduct = new Product({
        name: 'Existing Product',
        sku: 'EXISTING-001',
        regularPrice: 100,
        category: new mongoose.Types.ObjectId(),
        seller: testSellerId,
        bulkDiscount: {
          enabled: false,
          tiers: []
        }
      });
      await existingProduct.save();
    });

    test('should update product with valid bulk discount configuration', async () => {
      mockReq.params = { id: existingProduct._id };
      mockReq.body = {
        name: 'Updated Product with Bulk Discount',
        regularPrice: 100,
        bulkDiscount: JSON.stringify({
          enabled: true,
          tiers: [
            {
              minQuantity: 5,
              maxQuantity: 9,
              discountType: 'percentage',
              discountValue: 10
            }
          ]
        })
      };

      await updateProduct(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      const responseData = mockRes.json.mock.calls[0][0];
      expect(responseData.success).toBe(true);
      expect(responseData.data.product.bulkDiscount.enabled).toBe(true);
      expect(responseData.data.product.bulkDiscount.tiers).toHaveLength(1);
    });

    test('should update product to disable bulk discount', async () => {
      // First enable bulk discount
      existingProduct.bulkDiscount = {
        enabled: true,
        tiers: [
          {
            minQuantity: 5,
            discountType: 'percentage',
            discountValue: 10
          }
        ]
      };
      await existingProduct.save();

      mockReq.params = { id: existingProduct._id };
      mockReq.body = {
        name: 'Updated Product Disable Bulk',
        regularPrice: 100,
        bulkDiscount: JSON.stringify({
          enabled: false,
          tiers: []
        })
      };

      await updateProduct(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      const responseData = mockRes.json.mock.calls[0][0];
      expect(responseData.success).toBe(true);
      expect(responseData.data.product.bulkDiscount.enabled).toBe(false);
      expect(responseData.data.product.bulkDiscount.tiers).toHaveLength(0);
    });

    test('should reject update with invalid bulk discount configuration', async () => {
      mockReq.params = { id: existingProduct._id };
      mockReq.body = {
        name: 'Updated Product Invalid Bulk',
        regularPrice: 100,
        bulkDiscount: JSON.stringify({
          enabled: true,
          tiers: [
            {
              minQuantity: 10,
              maxQuantity: 5, // Invalid: max < min
              discountType: 'percentage',
              discountValue: 150 // Invalid: > 100%
            }
          ]
        })
      };

      await updateProduct(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      const responseData = mockRes.json.mock.calls[0][0];
      expect(responseData.success).toBe(false);
      expect(responseData.message).toBe('Invalid bulk discount configuration');
      expect(responseData.details.errors).toBeDefined();
    });

    test('should handle update without bulk discount data', async () => {
      mockReq.params = { id: existingProduct._id };
      mockReq.body = {
        name: 'Updated Product No Bulk Data',
        regularPrice: 100
        // No bulkDiscount field
      };

      await updateProduct(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      const responseData = mockRes.json.mock.calls[0][0];
      expect(responseData.success).toBe(true);
      // Should keep existing bulk discount configuration
      expect(responseData.data.product.bulkDiscount.enabled).toBe(false);
    });

    test('should update product with complex bulk discount tiers', async () => {
      mockReq.params = { id: existingProduct._id };
      mockReq.body = {
        name: 'Updated Product Complex Tiers',
        regularPrice: 100,
        bulkDiscount: JSON.stringify({
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
        })
      };

      await updateProduct(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      const responseData = mockRes.json.mock.calls[0][0];
      expect(responseData.success).toBe(true);
      expect(responseData.data.product.bulkDiscount.enabled).toBe(true);
      expect(responseData.data.product.bulkDiscount.tiers).toHaveLength(3);
      
      // Verify tier data
      const tiers = responseData.data.product.bulkDiscount.tiers;
      expect(tiers[0].discountType).toBe('percentage');
      expect(tiers[1].discountType).toBe('percentage');
      expect(tiers[2].discountType).toBe('fixed');
    });
  });
});
