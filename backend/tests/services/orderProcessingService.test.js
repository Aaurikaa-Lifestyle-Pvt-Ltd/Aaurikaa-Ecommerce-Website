const mongoose = require('mongoose');
const { createOrderWithBulkDiscounts } = require('../../services/orderProcessingService');
const Product = require('../../models/Product');
const Coupon = require('../../models/Coupon');

describe('Order Processing Service', () => {
  const testShippingAddress = () => ({
    name: 'Test User',
    stateId: new mongoose.Types.ObjectId(),
    countryId: new mongoose.Types.ObjectId(),
    zip: '400001',
  });

  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/ecommerce_test_db');
    }
  });

  afterAll(async () => {
    // Clean up test database
    await Product.deleteMany({});
    await Coupon.deleteMany({});
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clean up before each test
    await Product.deleteMany({});
    await Coupon.deleteMany({});
  });

  describe('createOrderWithBulkDiscounts', () => {
    it('should create order without coupon', async () => {
      // Create test product
      const testProduct = new Product({
        name: 'Test Product',
        sku: `TEST-${Date.now()}`,
        regularPrice: 100,
        salePrice: 100,
        stock: 10,
        category: new mongoose.Types.ObjectId(),
        subcategory: new mongoose.Types.ObjectId(),
        brand: new mongoose.Types.ObjectId(),
        description: 'Test product',
        mainImage: 'test.jpg',
        images: ['test.jpg'],
        isActive: true,
        taxRate: 18,
        weight: 500,
      });
      await testProduct.save();

      const orderData = {
        items: [
          {
            product: testProduct._id,
            quantity: 2
          }
        ],
        buyer: new mongoose.Types.ObjectId(),
        paymentMethod: 'cod',
        billingAddress: { name: 'Test User' },
        shippingAddress: testShippingAddress(),
      };

      const result = await createOrderWithBulkDiscounts(orderData);

      expect(result.success).toBe(true);
      expect(result.order.items).toHaveLength(1);
      // Subtotal 200 + GST + fallback shipping (no zone in empty DB)
      expect(result.order.totalAmount).toBe(295);
      expect(result.order.coupon).toBeNull();
    });

    it('should create order with valid coupon', async () => {
      // Create test product
      const testProduct = new Product({
        name: 'Test Product',
        sku: `TEST-${Date.now()}`,
        regularPrice: 100,
        salePrice: 100,
        stock: 10,
        category: new mongoose.Types.ObjectId(),
        subcategory: new mongoose.Types.ObjectId(),
        brand: new mongoose.Types.ObjectId(),
        description: 'Test product',
        mainImage: 'test.jpg',
        images: ['test.jpg'],
        isActive: true,
        taxRate: 18,
        weight: 500,
      });
      await testProduct.save();

      // Create test coupon
      const testCoupon = new Coupon({
        code: 'TEST10',
        discountType: 'percentage',
        discountValue: 10,
        minOrder: 100,
        validFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
        validTo: new Date(Date.now() + 24 * 60 * 60 * 1000),
        isActive: true
      });
      await testCoupon.save();

      const orderData = {
        items: [
          {
            product: testProduct._id,
            quantity: 2
          }
        ],
        coupon: 'TEST10',
        buyer: new mongoose.Types.ObjectId(),
        paymentMethod: 'cod',
        billingAddress: { name: 'Test User' },
        shippingAddress: testShippingAddress(),
      };

      const result = await createOrderWithBulkDiscounts(orderData);

      expect(result.success).toBe(true);
      expect(result.order.items).toHaveLength(1);
      expect(result.order.totalAmount).toBe(271.4);
      expect(result.order.coupon.code).toBe('TEST10');
      expect(result.order.coupon.discountAmount).toBe(20); // 10% of 200
      expect(result.order.coupon.couponData.discountType).toBe('percentage');
    });

    it('should reject order with invalid coupon', async () => {
      // Create test product
      const testProduct = new Product({
        name: 'Test Product',
        sku: `TEST-${Date.now()}`,
        regularPrice: 100,
        salePrice: 100,
        stock: 10,
        category: new mongoose.Types.ObjectId(),
        subcategory: new mongoose.Types.ObjectId(),
        brand: new mongoose.Types.ObjectId(),
        description: 'Test product',
        mainImage: 'test.jpg',
        images: ['test.jpg'],
        isActive: true,
        taxRate: 18,
        weight: 500,
      });
      await testProduct.save();

      const orderData = {
        items: [
          {
            product: testProduct._id,
            quantity: 2
          }
        ],
        coupon: 'INVALID',
        buyer: new mongoose.Types.ObjectId(),
        paymentMethod: 'cod',
        billingAddress: { name: 'Test User' },
        shippingAddress: testShippingAddress(),
      };

      const result = await createOrderWithBulkDiscounts(orderData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Coupon validation failed');
    });

    it('should reject order with coupon that has insufficient minimum order', async () => {
      // Create test product
      const testProduct = new Product({
        name: 'Test Product',
        sku: `TEST-${Date.now()}`,
        regularPrice: 50,
        salePrice: 50,
        stock: 10,
        category: new mongoose.Types.ObjectId(),
        subcategory: new mongoose.Types.ObjectId(),
        brand: new mongoose.Types.ObjectId(),
        description: 'Test product',
        mainImage: 'test.jpg',
        images: ['test.jpg'],
        isActive: true,
        taxRate: 18,
        weight: 500,
      });
      await testProduct.save();

      // Create test coupon with high minimum order
      const testCoupon = new Coupon({
        code: 'HIGHMIN',
        discountType: 'percentage',
        discountValue: 10,
        minOrder: 500,
        validFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
        validTo: new Date(Date.now() + 24 * 60 * 60 * 1000),
        isActive: true
      });
      await testCoupon.save();

      const orderData = {
        items: [
          {
            product: testProduct._id,
            quantity: 1
          }
        ],
        coupon: 'HIGHMIN',
        buyer: new mongoose.Types.ObjectId(),
        paymentMethod: 'cod',
        billingAddress: { name: 'Test User' },
        shippingAddress: testShippingAddress(),
      };

      const result = await createOrderWithBulkDiscounts(orderData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Coupon validation failed');
      expect(result.error).toContain('Minimum order amount');
    });

    it('should handle fixed amount coupon', async () => {
      // Create test product
      const testProduct = new Product({
        name: 'Test Product',
        sku: `TEST-${Date.now()}`,
        regularPrice: 100,
        salePrice: 100,
        stock: 10,
        category: new mongoose.Types.ObjectId(),
        subcategory: new mongoose.Types.ObjectId(),
        brand: new mongoose.Types.ObjectId(),
        description: 'Test product',
        mainImage: 'test.jpg',
        images: ['test.jpg'],
        isActive: true,
        taxRate: 18,
        weight: 500,
      });
      await testProduct.save();

      // Create test coupon with fixed discount
      const testCoupon = new Coupon({
        code: 'SAVE50',
        discountType: 'fixed',
        discountValue: 50,
        minOrder: 100,
        validFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
        validTo: new Date(Date.now() + 24 * 60 * 60 * 1000),
        isActive: true
      });
      await testCoupon.save();

      const orderData = {
        items: [
          {
            product: testProduct._id,
            quantity: 2
          }
        ],
        coupon: 'SAVE50',
        buyer: new mongoose.Types.ObjectId(),
        paymentMethod: 'cod',
        billingAddress: { name: 'Test User' },
        shippingAddress: testShippingAddress(),
      };

      const result = await createOrderWithBulkDiscounts(orderData);

      expect(result.success).toBe(true);
      expect(result.order.totalAmount).toBe(236);
      expect(result.order.coupon.discountAmount).toBe(50);
      expect(result.order.coupon.couponData.discountType).toBe('fixed');
    });
  });
});