const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Product = require('../../models/Product');
const Review = require('../../models/Review');
const {
  synchronizeSkuChange,
  remapPromotionSkuReferences,
  SkuSyncValidationError,
} = require('../../services/skuSynchronizationService');

describe('skuSynchronizationService rollback remediation (BUG-001)', () => {
  let mongoServer;
  let sellerId;
  let categoryId;
  let sourceProduct;

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

    sourceProduct = await Product.create({
      name: 'Source Product',
      sku: 'SKU-A',
      regularPrice: 100,
      category: categoryId,
      seller: sellerId,
    });
  });

  async function runFailedSync(oldSku, newSku, referrerUpsellSkus) {
    const referrer = await Product.create({
      name: 'Referrer',
      sku: `REF-${oldSku}-${newSku}-${referrerUpsellSkus.join('-')}`,
      regularPrice: 50,
      upsellSkus: referrerUpsellSkus,
      category: categoryId,
      seller: sellerId,
    });

    const originalUpdateMany = Review.updateMany;
    Review.updateMany = jest.fn().mockRejectedValue(new Error('forced review failure'));

    await expect(
      synchronizeSkuChange({
        productId: sourceProduct._id,
        oldSku,
        newSku,
        changedBy: new mongoose.Types.ObjectId(),
        source: 'admin_update',
      })
    ).rejects.toMatchObject({ rollbackPerformed: true });

    Review.updateMany = originalUpdateMany;

    return Product.findById(referrer._id);
  }

  it('restores ["A","B"] after failed sync when A changes to A2', async () => {
    const referrer = await runFailedSync('SKU-A', 'SKU-A2', ['SKU-A', 'SKU-B']);
    expect(referrer.upsellSkus).toEqual(['SKU-A', 'SKU-B']);
    expect((await Product.findById(sourceProduct._id)).sku).toBe('SKU-A');
  });

  it('restores ["A","B","A"] after failed sync', async () => {
    const referrer = await runFailedSync('SKU-A', 'SKU-A2', ['SKU-A', 'SKU-B', 'SKU-A']);
    expect(referrer.upsellSkus).toEqual(['SKU-A', 'SKU-B', 'SKU-A']);
  });

  it('rejects rename when array already contains both oldSku and newSku (BUG-001-R)', async () => {
    const referrer = await Product.create({
      name: 'Ambiguous Referrer',
      sku: 'REF-AMB',
      regularPrice: 50,
      upsellSkus: ['SKU-A', 'SKU-A2'],
      category: categoryId,
      seller: sellerId,
    });

    await expect(
      synchronizeSkuChange({
        productId: sourceProduct._id,
        oldSku: 'SKU-A',
        newSku: 'SKU-A2',
        changedBy: new mongoose.Types.ObjectId(),
        source: 'admin_update',
      })
    ).rejects.toThrow(SkuSyncValidationError);

    expect((await Product.findById(sourceProduct._id)).sku).toBe('SKU-A');
    expect((await Product.findById(referrer._id)).upsellSkus).toEqual(['SKU-A', 'SKU-A2']);
  });

  it('rejects literal ["A","B"] rename A to B with no writes (BUG-001-R)', async () => {
    await Product.create({
      name: 'Literal Ambiguous Referrer',
      sku: 'REF-LITERAL',
      regularPrice: 50,
      upsellSkus: ['SKU-A', 'SKU-B'],
      category: categoryId,
      seller: sellerId,
    });

    await Product.create({
      name: 'Target New Sku Owner',
      sku: 'SKU-B',
      regularPrice: 60,
      category: categoryId,
      seller: sellerId,
    });

    await expect(
      synchronizeSkuChange({
        productId: sourceProduct._id,
        oldSku: 'SKU-A',
        newSku: 'SKU-B',
        changedBy: new mongoose.Types.ObjectId(),
        source: 'admin_update',
      })
    ).rejects.toThrow(SkuSyncValidationError);

    expect((await Product.findById(sourceProduct._id)).sku).toBe('SKU-A');
  });
});

describe('remapPromotionSkuReferences (BUG-003)', () => {
  it('replaces stale oldSku references in source product promotion arrays', () => {
    const remapped = remapPromotionSkuReferences(
      {
        upsellSkus: ['SKU-A', 'SKU-C'],
        crossSellSkus: ['SKU-A'],
        boughtTogetherSkus: ['SKU-B'],
      },
      'SKU-A',
      'SKU-A2'
    );

    expect(remapped).toEqual({
      upsellSkus: ['SKU-A2', 'SKU-C'],
      crossSellSkus: ['SKU-A2'],
      boughtTogetherSkus: ['SKU-B'],
    });
  });
});
