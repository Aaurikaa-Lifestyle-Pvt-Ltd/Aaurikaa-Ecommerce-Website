const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Product = require('../../models/Product');
const { autoSaveProduct } = require('../../controllers/adminProductController');

jest.mock('../../utils/skuGenerator', () => ({
  generateSku: jest.fn(),
}));

describe('admin autoSaveProduct SKU sync (BUG-005)', () => {
  let mongoServer;
  let adminId;
  let categoryId;
  let sellerId;
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
    adminId = new mongoose.Types.ObjectId();
    categoryId = new mongoose.Types.ObjectId();
    sellerId = new mongoose.Types.ObjectId();

    draftProduct = await Product.create({
      name: 'Draft Product',
      sku: 'DRAFT-SKU-A',
      regularPrice: 100,
      status: 'draft',
      ownerUserId: adminId,
      category: categoryId,
      seller: sellerId,
      upsellSkus: ['DRAFT-SKU-A', 'OTHER-SKU'],
    });

    referrerProduct = await Product.create({
      name: 'Referrer',
      sku: 'REFERRER-SKU',
      regularPrice: 50,
      upsellSkus: ['DRAFT-SKU-A'],
      category: categoryId,
      seller: sellerId,
    });
  });

  it('runs synchronization when draft autosave changes base SKU', async () => {
    const req = {
      body: {
        id: String(draftProduct._id),
        sku: 'DRAFT-SKU-A2',
        upsellSkus: ['DRAFT-SKU-A', 'OTHER-SKU'],
      },
      user: { _id: adminId },
    };
    const res = mockRes();

    await autoSaveProduct(req, res);

    expect(res.json).toHaveBeenCalled();
    const saved = (await Product.findById(draftProduct._id)).toObject();
    const referrer = await Product.findById(referrerProduct._id);

    expect(saved.sku).toBe('DRAFT-SKU-A2');
    expect(saved.upsellSkus).toEqual(['DRAFT-SKU-A2', 'OTHER-SKU']);
    expect(referrer.upsellSkus).toEqual(['DRAFT-SKU-A2']);
  });
});
