const mongoose = require('mongoose');
const Product = require('../../models/Product');
const Order = require('../../models/Order');
const Coupon = require('../../models/coupon');
const {
  onOrderCreated,
  onPaymentSucceeded,
  onPaymentFailed,
  onOrderCancelled,
} = require('../../services/orderCommerceIntegrityService');
const { validateCoupon } = require('../../utils/pricingEngine');

describe('SEC-005 coupon consumption timing', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/ecommerce_test_db');
    }
  });

  afterEach(async () => {
    await Product.deleteMany({ sku: { $regex: /^SEC005-/ } });
    await Coupon.deleteMany({ code: { $regex: /^SEC005/ } });
    await Order.deleteMany({ 'coupon.code': { $regex: /^SEC005/ } });
  });

  async function seed({ usageLimit = 1 } = {}) {
    const product = await Product.create({
      name: 'Coupon Product',
      sku: `SEC005-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      regularPrice: 200,
      salePrice: 200,
      stock: 10,
    });
    const coupon = await Coupon.create({
      code: `SEC005${Date.now().toString().slice(-6)}`,
      discountType: 'fixed',
      discountValue: 20,
      minOrder: 100,
      usageLimit,
      usedCount: 0,
      isActive: true,
      validFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
      validTo: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    return { product, coupon };
  }

  function buildOrder(product, coupon, extras = {}) {
    return new Order({
      buyer: extras.buyer || new mongoose.Types.ObjectId(),
      items: [
        {
          product: product._id,
          quantity: 1,
          price: 200,
          originalPrice: 200,
        },
      ],
      totalAmount: 180,
      shippingCharge: 0,
      paymentMethod: extras.paymentMethod || 'phonepe',
      paymentStatus: 'pending',
      status: extras.status || 'pending',
      coupon: {
        code: coupon.code,
        discountAmount: 20,
      },
      couponLifecycle: { state: 'applied' },
      inventoryLifecycle: { state: 'none' },
    });
  }

  it('does not consume coupon usage for an unpaid prepaid order', async () => {
    const { product, coupon } = await seed();
    const order = buildOrder(product, coupon);
    await order.save();

    await onOrderCreated(order, { isCod: false });
    await order.save();

    const updated = await Coupon.findById(coupon._id);
    expect(updated.usedCount).toBe(0);
    expect(updated.usageHistory).toHaveLength(0);
    expect(order.couponLifecycle.state).toBe('applied');
  });

  it('consumes coupon exactly once on successful payment', async () => {
    const { product, coupon } = await seed();
    const order = buildOrder(product, coupon);
    await order.save();
    await onOrderCreated(order, { isCod: false });
    await order.save();

    await onPaymentSucceeded(order);
    await order.save();

    const updated = await Coupon.findById(coupon._id);
    expect(updated.usedCount).toBe(1);
    expect(updated.usageHistory).toHaveLength(1);
    expect(updated.usageHistory[0].orderId.toString()).toBe(order._id.toString());
    expect(order.couponLifecycle.state).toBe('consumed');
  });

  it('does not consume twice on duplicate payment confirmation', async () => {
    const { product, coupon } = await seed();
    const order = buildOrder(product, coupon);
    await order.save();
    await onOrderCreated(order, { isCod: false });
    await order.save();

    await onPaymentSucceeded(order);
    await order.save();
    await onPaymentSucceeded(order);
    await order.save();

    const updated = await Coupon.findById(coupon._id);
    expect(updated.usedCount).toBe(1);
    expect(updated.usageHistory).toHaveLength(1);
  });

  it('does not permanently consume quota when prepaid payment fails', async () => {
    const { product, coupon } = await seed();
    const order = buildOrder(product, coupon);
    await order.save();
    await onOrderCreated(order, { isCod: false });
    await order.save();

    await onPaymentFailed(order);
    await order.save();

    const updated = await Coupon.findById(coupon._id);
    expect(updated.usedCount).toBe(0);
    expect(updated.usageHistory).toHaveLength(0);
  });

  it('releases quota when a COD order that consumed the coupon is cancelled', async () => {
    const { product, coupon } = await seed();
    const order = buildOrder(product, coupon, { paymentMethod: 'cod', status: 'processing' });
    await order.save();

    await onOrderCreated(order, { isCod: true });
    await order.save();
    expect((await Coupon.findById(coupon._id)).usedCount).toBe(1);

    await onOrderCancelled(order);
    await order.save();

    const updated = await Coupon.findById(coupon._id);
    expect(updated.usedCount).toBe(0);
    expect(updated.usageHistory).toHaveLength(0);
    expect(order.couponLifecycle.state).toBe('released');
  });

  it('still enforces existing coupon usage limits', async () => {
    const { coupon } = await seed({ usageLimit: 1 });
    coupon.usedCount = 1;
    await coupon.save();

    const result = await validateCoupon(coupon.code, 200);
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/usage limit/i);
  });
});
