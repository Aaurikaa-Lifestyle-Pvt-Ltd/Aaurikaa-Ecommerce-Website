const mongoose = require('mongoose');
const { processOrderWithBulkDiscounts } = require('../../services/orderProcessingService');
const Product = require('../../models/Product');

describe('SEC-001 variant price authority', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/ecommerce_test_db');
    }
  });

  afterAll(async () => {
    await Product.deleteMany({ sku: { $regex: /^SEC001-/ } });
  });

  beforeEach(async () => {
    await Product.deleteMany({ sku: { $regex: /^SEC001-/ } });
  });

  it('ignores client variantPriceSnapshot and recalculates from Product.variantPricing', async () => {
    const product = await Product.create({
      name: 'Gold Ring',
      sku: `SEC001-${Date.now()}`,
      regularPrice: 1999,
      salePrice: 1999,
      stock: 5,
      variants: [{ type: 'Color', values: ['Gold'] }],
      variantPricing: {
        'color:gold': { price: 1999, salePrice: 1999 },
      },
      variantStock: {
        'color:gold': 5,
      },
      variantSku: {
        'color:gold': 'RING-GOLD',
      },
    });

    const processed = await processOrderWithBulkDiscounts([
      {
        product: product._id,
        quantity: 1,
        variantKey: 'color:gold',
        variantCombination: { Color: 'Gold' },
        variantPriceSnapshot: 99,
        price: 99,
      },
    ]);

    expect(processed.success).toBe(true);
    expect(processed.items[0].price).toBe(1999);
    expect(processed.items[0].originalPrice).toBe(1999);
    expect(processed.items[0].variantPriceSnapshot).toBe(1999);
    expect(processed.totalAmount).toBe(1999);
    expect(processed.bulkDiscountSummary.totalOriginalAmount).toBe(1999);
  });
});
