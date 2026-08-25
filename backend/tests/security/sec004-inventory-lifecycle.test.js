const mongoose = require('mongoose');
const Product = require('../../models/Product');
const Order = require('../../models/Order');
const {
  reserveStockForOrder,
  commitStockForOrder,
  releaseStockForOrder,
  INVENTORY_STATES,
} = require('../../services/inventoryLifecycleService');
const {
  onOrderCreated,
  onPaymentSucceeded,
  onPaymentFailed,
  onOrderCancelled,
} = require('../../services/orderCommerceIntegrityService');

function buildOrder(product, extras = {}) {
  return new Order({
    buyer: new mongoose.Types.ObjectId(),
    items: [
      {
        product: product._id,
        quantity: 1,
        price: 100,
        originalPrice: 100,
      },
    ],
    totalAmount: 100,
    shippingCharge: 0,
    paymentMethod: extras.paymentMethod || 'phonepe',
    paymentStatus: 'pending',
    status: extras.status || 'pending',
    inventoryLifecycle: { state: 'none' },
  });
}

describe('SEC-004 inventory lifecycle', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/ecommerce_test_db');
    }
  });

  afterEach(async () => {
    await Product.deleteMany({ sku: { $regex: /^SEC004-/ } });
    await Order.deleteMany({ 'items.price': 100, shippingCharge: 0, totalAmount: 100 });
  });

  async function createProduct(stock = 1) {
    return Product.create({
      name: 'Limited SKU',
      sku: `SEC004-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      regularPrice: 100,
      salePrice: 100,
      stock,
    });
  }

  it('decrements stock on successful purchase (COD commit)', async () => {
    const product = await createProduct(3);
    const order = buildOrder(product, { paymentMethod: 'cod', status: 'processing' });
    await order.save();

    const result = await onOrderCreated(order, { isCod: true });
    await order.save();

    expect(result.success).toBe(true);
    const updated = await Product.findById(product._id);
    expect(updated.stock).toBe(2);
    expect(order.inventoryLifecycle.state).toBe(INVENTORY_STATES.COMMITTED);
  });

  it('does not permanently consume stock on failed payment', async () => {
    const product = await createProduct(1);
    const order = buildOrder(product);
    await order.save();

    await onOrderCreated(order, { isCod: false });
    await order.save();
    expect((await Product.findById(product._id)).stock).toBe(0);

    await onPaymentFailed(order);
    await order.save();

    expect((await Product.findById(product._id)).stock).toBe(1);
    expect(order.inventoryLifecycle.state).toBe(INVENTORY_STATES.RELEASED);
  });

  it('restores stock on valid cancellation', async () => {
    const product = await createProduct(2);
    const order = buildOrder(product);
    await order.save();
    await onOrderCreated(order, { isCod: false });
    await order.save();

    await onOrderCancelled(order);
    await order.save();

    expect((await Product.findById(product._id)).stock).toBe(2);
    expect(order.inventoryLifecycle.state).toBe(INVENTORY_STATES.RELEASED);
  });

  it('does not restore stock twice on repeated cancellation', async () => {
    const product = await createProduct(1);
    const order = buildOrder(product);
    await order.save();
    await onOrderCreated(order, { isCod: false });
    await order.save();

    await onOrderCancelled(order);
    await order.save();
    await onOrderCancelled(order);
    await order.save();

    expect((await Product.findById(product._id)).stock).toBe(1);
  });

  it('does not decrement twice on repeated payment confirmation', async () => {
    const product = await createProduct(2);
    const order = buildOrder(product);
    await order.save();
    await onOrderCreated(order, { isCod: false });
    await order.save();

    await onPaymentSucceeded(order);
    await order.save();
    await onPaymentSucceeded(order);
    await order.save();

    expect((await Product.findById(product._id)).stock).toBe(1);
    expect(order.inventoryLifecycle.state).toBe(INVENTORY_STATES.COMMITTED);
  });

  it('allows only one concurrent claim of the final stock unit', async () => {
    const product = await createProduct(1);
    const orderA = buildOrder(product);
    const orderB = buildOrder(product);
    await orderA.save();
    await orderB.save();

    const [a, b] = await Promise.all([
      reserveStockForOrder(orderA),
      reserveStockForOrder(orderB),
    ]);

    const successes = [a, b].filter((r) => r.success);
    const failures = [a, b].filter((r) => !r.success);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect((await Product.findById(product._id)).stock).toBe(0);
  });

  it('commits without a second decrement after reserve', async () => {
    const product = await createProduct(4);
    const order = buildOrder(product);
    await order.save();

    await reserveStockForOrder(order);
    expect((await Product.findById(product._id)).stock).toBe(3);

    await commitStockForOrder(order);
    expect((await Product.findById(product._id)).stock).toBe(3);
    expect(order.inventoryLifecycle.state).toBe(INVENTORY_STATES.COMMITTED);
  });
});
