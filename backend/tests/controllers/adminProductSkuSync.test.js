const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Product = require('../../models/Product');
const Review = require('../../models/Review');
const SkuRule = require('../../models/SkuRule');
const { regenerateSku } = require('../../controllers/adminProductController');

jest.mock('../../utils/skuGenerator', () => {
  const actual = jest.requireActual('../../utils/skuGenerator');
  return {
    ...actual,
    generateSku: jest.fn(),
  };
});

const { generateSku } = require('../../utils/skuGenerator');

describe('adminProductController SKU sync integration', () => {
  let mongoServer;
  let productA;
  let productB;
  let sellerId;
  let categoryId;

  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await Product.deleteMany({});
    await Review.deleteMany({});
    await SkuRule.deleteMany({});
    generateSku.mockReset();

    await SkuRule.create({
      name: 'Sync Test Rule',
      isActive: true,
      separator: '-',
      allowedCharacters: 'A-Z0-9-',
      segments: [{ type: 'product_name', length: 6, order: 1, enabled: true }],
    });

    sellerId = new mongoose.Types.ObjectId();
    categoryId = new mongoose.Types.ObjectId();

    productA = await Product.create({
      name: 'Product A',
      sku: 'SKU-A',
      regularPrice: 100,
      category: categoryId,
      seller: sellerId,
    });

    productB = await Product.create({
      name: 'Product B',
      sku: 'SKU-B',
      regularPrice: 120,
      upsellSkus: ['SKU-A'],
      category: categoryId,
      seller: sellerId,
    });

    await Review.create({
      product: productA._id,
      productSku: 'SKU-A',
      seller: sellerId,
      reviewer: {
        userId: new mongoose.Types.ObjectId(),
        role: 'shopper',
        roleModel: 'Shopper',
      },
      rating: 4,
    });
  });

  it('regenerateSku base triggers promotion and review synchronization', async () => {
    generateSku.mockResolvedValue('SKU-A-NEW');

    const req = {
      params: { id: String(productA._id) },
      body: { target: 'base' },
      user: { _id: new mongoose.Types.ObjectId() },
    };
    const res = mockRes();

    await regenerateSku(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.product.sku).toBe('SKU-A-NEW');
    expect(payload.skuSync.success).toBe(true);

    const refreshedB = await Product.findById(productB._id);
    const review = await Review.findOne({ product: productA._id });
    expect(refreshedB.upsellSkus).toEqual(['SKU-A-NEW']);
    expect(review.productSku).toBe('SKU-A-NEW');
  });

  it('regenerateSku variants does not run base sku synchronization', async () => {
    generateSku.mockResolvedValue('VAR-NEW-1');

    await Product.findByIdAndUpdate(productA._id, {
      variants: [{ type: 'Size', values: ['S'] }],
      variantSku: { 'size:s': 'VAR-OLD-1' },
    });

    const req = {
      params: { id: String(productA._id) },
      body: { target: 'variants' },
      user: { _id: new mongoose.Types.ObjectId() },
    };
    const res = mockRes();

    await regenerateSku(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const refreshedA = await Product.findById(productA._id);
    const refreshedB = await Product.findById(productB._id);
    const review = await Review.findOne({ product: productA._id });

    expect(refreshedA.sku).toBe('SKU-A');
    expect(refreshedA.variantSku['size:s']).toBe('VAR-NEW-1');
    expect(refreshedB.upsellSkus).toEqual(['SKU-A']);
    expect(review.productSku).toBe('SKU-A');
  });
});
