const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Product = require('../../models/Product');
const Review = require('../../models/Review');
const WeightClass = require('../../models/WeightClass');
const { addProduct } = require('../../controllers/adminProductController');

jest.mock('../../utils/productPublishGuard', () => ({
  assertPublishable: jest.fn().mockResolvedValue(undefined),
  enforcePublishSlugOnTransition: jest.fn(async ({ currentSlug }) => currentSlug),
  isDraftToPublishedTransition: jest.fn(
    (previousStatus, newStatus) => previousStatus !== 'published' && newStatus === 'published'
  ),
  resolveEffectiveProductStatus: jest.fn((requested, existing) => requested || existing || 'published'),
}));

jest.mock('../../utils/skuGenerator', () => ({
  generateSku: jest.fn(),
}));

describe('admin addProduct draft publish SKU sync (BUG-005-R)', () => {
  let mongoServer;
  let adminId;
  let categoryId;
  let sellerId;
  let weightClassId;
  let draftProduct;
  let referrerProduct;

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
    await WeightClass.deleteMany({});

    adminId = new mongoose.Types.ObjectId();
    categoryId = new mongoose.Types.ObjectId();
    sellerId = new mongoose.Types.ObjectId();
    const slab = await WeightClass.create({
      name: 'SKU Sync Slab',
      minWeightG: 0,
      maxWeightG: 1000,
      active: true,
    });
    weightClassId = String(slab._id);

    draftProduct = await Product.create({
      name: 'Draft To Publish',
      sku: 'DRAFT-PUB-A',
      regularPrice: 100,
      status: 'draft',
      ownerUserId: adminId,
      category: categoryId,
      seller: sellerId,
      upsellSkus: ['DRAFT-PUB-A', 'OTHER-SKU'],
    });

    referrerProduct = await Product.create({
      name: 'Referrer',
      sku: 'REFERRER-PUB',
      regularPrice: 50,
      upsellSkus: ['DRAFT-PUB-A'],
      category: categoryId,
      seller: sellerId,
    });

    await Review.create({
      product: draftProduct._id,
      productSku: 'DRAFT-PUB-A',
      seller: sellerId,
      reviewer: {
        userId: new mongoose.Types.ObjectId(),
        role: 'shopper',
        roleModel: 'Shopper',
      },
      rating: 5,
    });
  });

  it('synchronizes promotions and reviews when publishing a draft with SKU change', async () => {
    const req = {
      body: {
        draftId: String(draftProduct._id),
        sku: 'DRAFT-PUB-A2',
        name: 'Draft To Publish',
        regularPrice: '100',
        status: 'published',
        weightClass: weightClassId,
        upsellSkus: 'DRAFT-PUB-A,OTHER-SKU',
        crossSellSkus: '',
        boughtTogetherSkus: '',
      },
      user: { _id: adminId },
      files: undefined,
    };
    const res = mockRes();

    await addProduct(req, res);

    expect(res.status).toHaveBeenCalledWith(200);

    const published = await Product.findById(draftProduct._id);
    const referrer = await Product.findById(referrerProduct._id);
    const review = await Review.findOne({ product: draftProduct._id });

    expect(published.sku).toBe('DRAFT-PUB-A2');
    expect(published.status).toBe('published');
    expect(published.upsellSkus).toEqual(['DRAFT-PUB-A2', 'OTHER-SKU']);
    expect(referrer.upsellSkus).toEqual(['DRAFT-PUB-A2']);
    expect(review.productSku).toBe('DRAFT-PUB-A2');
  });
});
