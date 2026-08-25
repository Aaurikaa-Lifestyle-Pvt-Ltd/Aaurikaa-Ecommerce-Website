const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Product = require('../../models/Product');
const Review = require('../../models/Review');
const {
  synchronizeSkuChange,
  SkuSyncValidationError,
  SkuSyncConflictError,
} = require('../../services/skuSynchronizationService');

describe('skuSynchronizationService', () => {
  let mongoServer;
  let productA;
  let productB;
  let sellerId;
  let categoryId;

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
      crossSellSkus: ['SKU-A'],
      boughtTogetherSkus: ['SKU-A'],
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
      rating: 5,
      comment: 'Great product',
    });
  });

  it('synchronizes promotion arrays, reviews, and product sku on base change', async () => {
    const result = await synchronizeSkuChange({
      productId: productA._id,
      oldSku: 'SKU-A',
      newSku: 'SKU-A2',
      changedBy: new mongoose.Types.ObjectId(),
      source: 'admin_update',
    });

    expect(result.success).toBe(true);
    expect(result.referencesUpdated.upsellSkus).toBe(1);
    expect(result.referencesUpdated.crossSellSkus).toBe(1);
    expect(result.referencesUpdated.boughtTogetherSkus).toBe(1);
    expect(result.referencesUpdated.reviews).toBe(1);
    expect(result.rollbackPerformed).toBe(false);

    const refreshedA = await Product.findById(productA._id);
    const refreshedB = await Product.findById(productB._id);
    const review = await Review.findOne({ product: productA._id });

    expect(refreshedA.sku).toBe('SKU-A2');
    expect(refreshedB.upsellSkus).toEqual(['SKU-A2']);
    expect(refreshedB.crossSellSkus).toEqual(['SKU-A2']);
    expect(refreshedB.boughtTogetherSkus).toEqual(['SKU-A2']);
    expect(review.productSku).toBe('SKU-A2');
  });

  it('rejects duplicate newSku before any writes', async () => {
    await expect(
      synchronizeSkuChange({
        productId: productA._id,
        oldSku: 'SKU-A',
        newSku: 'SKU-B',
        changedBy: new mongoose.Types.ObjectId(),
        source: 'admin_update',
      })
    ).rejects.toThrow(SkuSyncValidationError);

    const unchanged = await Product.findById(productA._id);
    const referrer = await Product.findById(productB._id);
    expect(unchanged.sku).toBe('SKU-A');
    expect(referrer.upsellSkus).toEqual(['SKU-A']);
  });

  it('rejects newSku that matches a variant SKU on the same product (BUG-002)', async () => {
    await Product.findByIdAndUpdate(productA._id, {
      variantSku: { 'size:s': 'VAR-SAME-PRODUCT' },
    });

    await expect(
      synchronizeSkuChange({
        productId: productA._id,
        oldSku: 'SKU-A',
        newSku: 'VAR-SAME-PRODUCT',
        changedBy: new mongoose.Types.ObjectId(),
        source: 'admin_update',
      })
    ).rejects.toThrow(SkuSyncValidationError);

    expect((await Product.findById(productA._id)).sku).toBe('SKU-A');
  });

  it('rejects newSku that matches a variant SKU on another product (BUG-002)', async () => {
    await Product.create({
      name: 'Variant Owner',
      sku: 'SKU-VAR-OWNER',
      regularPrice: 80,
      variantSku: { 'size:m': 'VAR-OTHER-PRODUCT' },
      category: categoryId,
      seller: sellerId,
    });

    await expect(
      synchronizeSkuChange({
        productId: productA._id,
        oldSku: 'SKU-A',
        newSku: 'VAR-OTHER-PRODUCT',
        changedBy: new mongoose.Types.ObjectId(),
        source: 'admin_update',
      })
    ).rejects.toThrow(SkuSyncValidationError);
  });

  it('rejects concurrent sku edits with conflict error', async () => {
    await Product.findByIdAndUpdate(productA._id, { sku: 'SKU-A-MUTATED' });

    await expect(
      synchronizeSkuChange({
        productId: productA._id,
        oldSku: 'SKU-A',
        newSku: 'SKU-A2',
        changedBy: new mongoose.Types.ObjectId(),
        source: 'admin_update',
      })
    ).rejects.toThrow(SkuSyncConflictError);
  });

  it('rolls back promotion updates when review update fails', async () => {
    const originalUpdateMany = Review.updateMany;
    Review.updateMany = jest.fn().mockRejectedValue(new Error('review write failed'));

    await expect(
      synchronizeSkuChange({
        productId: productA._id,
        oldSku: 'SKU-A',
        newSku: 'SKU-A2',
        changedBy: new mongoose.Types.ObjectId(),
        source: 'regenerate',
      })
    ).rejects.toMatchObject({ rollbackPerformed: true });

    const refreshedA = await Product.findById(productA._id);
    const refreshedB = await Product.findById(productB._id);

    expect(refreshedA.sku).toBe('SKU-A');
    expect(refreshedB.upsellSkus).toEqual(['SKU-A']);

    Review.updateMany = originalUpdateMany;
  });

  it('succeeds with zero reference counts when no refs exist', async () => {
    await Product.findByIdAndUpdate(productB._id, {
      upsellSkus: [],
      crossSellSkus: [],
      boughtTogetherSkus: [],
    });
    await Review.deleteMany({});

    const result = await synchronizeSkuChange({
      productId: productA._id,
      oldSku: 'SKU-A',
      newSku: 'SKU-A2',
      changedBy: new mongoose.Types.ObjectId(),
      source: 'admin_update',
    });

    expect(result.success).toBe(true);
    expect(result.referencesUpdated).toEqual({
      upsellSkus: 0,
      crossSellSkus: 0,
      boughtTogetherSkus: 0,
      reviews: 0,
    });
    expect((await Product.findById(productA._id)).sku).toBe('SKU-A2');
  });
});
