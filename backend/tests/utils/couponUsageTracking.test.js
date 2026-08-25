const mongoose = require('mongoose');
const { validateCoupon, recordCouponUsage, releaseCouponUsage } = require('../../utils/pricingEngine');
const Coupon = require('../../models/Coupon');

describe('Coupon Usage Tracking', () => {
  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/ecommerce_test_db');
    }
  });

  afterAll(async () => {
    // Clean up test database
    await Coupon.deleteMany({});
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clean up before each test
    await Coupon.deleteMany({});
  });

  describe('validateCoupon with usage limits', () => {
    it('should validate coupon with global usage limit', async () => {
      // Create coupon with usage limit
      const testCoupon = new Coupon({
        code: 'LIMITED10',
        discountType: 'percentage',
        discountValue: 10,
        minOrder: 100,
        usageLimit: 5,
        usedCount: 3,
        validFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
        validTo: new Date(Date.now() + 24 * 60 * 60 * 1000),
        isActive: true
      });
      await testCoupon.save();

      const result = await validateCoupon('LIMITED10', 150);

      expect(result.valid).toBe(true);
      expect(result.coupon.usageLimit).toBe(5);
      expect(result.coupon.usedCount).toBe(3);
    });

    it('should reject coupon that has reached global usage limit', async () => {
      // Create coupon that has reached usage limit
      const testCoupon = new Coupon({
        code: 'EXHAUSTED',
        discountType: 'percentage',
        discountValue: 10,
        minOrder: 100,
        usageLimit: 5,
        usedCount: 5,
        validFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
        validTo: new Date(Date.now() + 24 * 60 * 60 * 1000),
        isActive: true
      });
      await testCoupon.save();

      const result = await validateCoupon('EXHAUSTED', 150);

      expect(result.valid).toBe(false);
      expect(result.message).toContain('usage limit');
    });

    it('should validate coupon with per-user usage limit', async () => {
      const userId = new mongoose.Types.ObjectId();
      
      // Create coupon with per-user limit
      const testCoupon = new Coupon({
        code: 'USERLIMIT',
        discountType: 'percentage',
        discountValue: 10,
        minOrder: 100,
        perUserLimit: 2,
        userUsageCount: [{
          userId: userId,
          count: 1,
          lastUsed: new Date()
        }],
        validFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
        validTo: new Date(Date.now() + 24 * 60 * 60 * 1000),
        isActive: true
      });
      await testCoupon.save();

      const result = await validateCoupon('USERLIMIT', 150, userId);

      expect(result.valid).toBe(true);
      expect(result.coupon.perUserLimit).toBe(2);
    });

    it('should reject coupon when user has reached per-user limit', async () => {
      const userId = new mongoose.Types.ObjectId();
      
      // Create coupon where user has reached limit
      const testCoupon = new Coupon({
        code: 'USEREXHAUSTED',
        discountType: 'percentage',
        discountValue: 10,
        minOrder: 100,
        perUserLimit: 2,
        userUsageCount: [{
          userId: userId,
          count: 2,
          lastUsed: new Date()
        }],
        validFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
        validTo: new Date(Date.now() + 24 * 60 * 60 * 1000),
        isActive: true
      });
      await testCoupon.save();

      const result = await validateCoupon('USEREXHAUSTED', 150, userId);

      expect(result.valid).toBe(false);
      expect(result.message).toContain('already used this coupon');
    });
  });

  describe('recordCouponUsage', () => {
    it('should record coupon usage successfully', async () => {
      // Create test coupon
      const testCoupon = new Coupon({
        code: 'TRACKTEST',
        discountType: 'percentage',
        discountValue: 10,
        minOrder: 100,
        validFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
        validTo: new Date(Date.now() + 24 * 60 * 60 * 1000),
        isActive: true
      });
      await testCoupon.save();

      const userId = new mongoose.Types.ObjectId();
      const orderId = new mongoose.Types.ObjectId();

      const result = await recordCouponUsage(
        'TRACKTEST',
        userId,
        orderId,
        20,
        200,
        {
          ipAddress: '192.168.1.1',
          userAgent: 'Test Browser'
        }
      );

      expect(result.success).toBe(true);

      // Verify coupon was updated
      const updatedCoupon = await Coupon.findOne({ code: 'TRACKTEST' });
      expect(updatedCoupon.usedCount).toBe(1);
      expect(updatedCoupon.usageHistory).toHaveLength(1);
      expect(updatedCoupon.usageHistory[0].userId.toString()).toBe(userId.toString());
      expect(updatedCoupon.usageHistory[0].orderId.toString()).toBe(orderId.toString());
      expect(updatedCoupon.usageHistory[0].discountAmount).toBe(20);
      expect(updatedCoupon.usageHistory[0].orderTotal).toBe(200);
      expect(updatedCoupon.usageHistory[0].ipAddress).toBe('192.168.1.1');
      expect(updatedCoupon.usageHistory[0].userAgent).toBe('Test Browser');
    });

    it('should update per-user usage count', async () => {
      const userId = new mongoose.Types.ObjectId();
      
      // Create test coupon with existing user usage
      const testCoupon = new Coupon({
        code: 'USERTRACK',
        discountType: 'percentage',
        discountValue: 10,
        minOrder: 100,
        userUsageCount: [{
          userId: userId,
          count: 1,
          lastUsed: new Date()
        }],
        validFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
        validTo: new Date(Date.now() + 24 * 60 * 60 * 1000),
        isActive: true
      });
      await testCoupon.save();

      const orderId = new mongoose.Types.ObjectId();

      const result = await recordCouponUsage(
        'USERTRACK',
        userId,
        orderId,
        15,
        150
      );

      expect(result.success).toBe(true);

      // Verify user usage count was updated
      const updatedCoupon = await Coupon.findOne({ code: 'USERTRACK' });
      const userUsage = updatedCoupon.userUsageCount.find(usage => 
        usage.userId.toString() === userId.toString()
      );
      expect(userUsage.count).toBe(2);
    });

    it('should handle non-existent coupon', async () => {
      const result = await recordCouponUsage(
        'NONEXISTENT',
        new mongoose.Types.ObjectId(),
        new mongoose.Types.ObjectId(),
        10,
        100
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Coupon not found');
    });

    it('does not increment usage twice for the same order', async () => {
      const testCoupon = new Coupon({
        code: 'IDEMPOTENT',
        discountType: 'percentage',
        discountValue: 10,
        minOrder: 100,
        validFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
        validTo: new Date(Date.now() + 24 * 60 * 60 * 1000),
        isActive: true
      });
      await testCoupon.save();

      const userId = new mongoose.Types.ObjectId();
      const orderId = new mongoose.Types.ObjectId();

      await recordCouponUsage('IDEMPOTENT', userId, orderId, 10, 100);
      const second = await recordCouponUsage('IDEMPOTENT', userId, orderId, 10, 100);

      expect(second.success).toBe(true);
      expect(second.alreadyApplied).toBe(true);

      const updated = await Coupon.findOne({ code: 'IDEMPOTENT' });
      expect(updated.usedCount).toBe(1);
      expect(updated.usageHistory).toHaveLength(1);
    });
  });

  describe('releaseCouponUsage', () => {
    it('restores quota and is idempotent per order', async () => {
      const userId = new mongoose.Types.ObjectId();
      const orderId = new mongoose.Types.ObjectId();
      const testCoupon = new Coupon({
        code: 'RELEASEME',
        discountType: 'fixed',
        discountValue: 50,
        minOrder: 100,
        validFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
        validTo: new Date(Date.now() + 24 * 60 * 60 * 1000),
        isActive: true
      });
      await testCoupon.save();

      await recordCouponUsage('RELEASEME', userId, orderId, 50, 200);
      const first = await releaseCouponUsage('RELEASEME', orderId, userId);
      const second = await releaseCouponUsage('RELEASEME', orderId, userId);

      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
      expect(second.alreadyApplied).toBe(true);

      const updated = await Coupon.findOne({ code: 'RELEASEME' });
      expect(updated.usedCount).toBe(0);
      expect(updated.usageHistory).toHaveLength(0);
    });
  });
});
