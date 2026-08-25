const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Product = require('../../models/Product');
const { autoSaveProduct: sellerAutoSaveProduct } = require('../../controllers/sellerProductController');
const { autoSaveProduct: adminAutoSaveProduct } = require('../../controllers/adminProductController');

jest.mock('../../utils/skuGenerator', () => ({
  generateSku: jest.fn().mockResolvedValue('AUTO-SKU'),
}));

describe('autoSaveProduct non-draft guard', () => {
  let mongoServer;
  let ownerId;
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
    ownerId = new mongoose.Types.ObjectId();
    categoryId = new mongoose.Types.ObjectId();
  });

  describe('seller autoSaveProduct', () => {
    it('returns 409 and does not modify a published product', async () => {
      const published = await Product.create({
        name: 'Published Product',
        sku: 'PUB-SKU-1',
        regularPrice: 100,
        status: 'published',
        ownerUserId: ownerId,
        seller: ownerId,
        sellerShop: ownerId,
        category: categoryId,
        variants: [{ type: 'Size', values: ['M'] }],
        mainImage: 'https://example.com/main.jpg',
        variantPricing: { 'size:m': { price: 99 } },
      });

      const req = {
        body: {
          id: String(published._id),
          name: 'Wiped Name',
          variants: [],
          mainImage: null,
        },
        user: { _id: ownerId },
      };
      const res = mockRes();

      await sellerAutoSaveProduct(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      const unchanged = await Product.findById(published._id);
      expect(unchanged.name).toBe('Published Product');
      expect(unchanged.variants).toHaveLength(1);
      expect(unchanged.mainImage).toBe('https://example.com/main.jpg');
      expect(unchanged.variantPricing['size:m'].price).toBe(99);
    });

    it('continues to auto-save draft products normally', async () => {
      const draft = await Product.create({
        name: 'Draft Product',
        sku: 'DRAFT-SKU-1',
        regularPrice: 50,
        status: 'draft',
        ownerUserId: ownerId,
        seller: ownerId,
        sellerShop: ownerId,
        category: categoryId,
      });

      const req = {
        body: {
          id: String(draft._id),
          name: 'Updated Draft Name',
        },
        user: { _id: ownerId },
      };
      const res = mockRes();

      await sellerAutoSaveProduct(req, res);

      expect(res.status).not.toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalled();
      const updated = await Product.findById(draft._id);
      expect(updated.name).toBe('Updated Draft Name');
      expect(updated.status).toBe('draft');
    });
  });

  describe('admin autoSaveProduct', () => {
    it('returns 409 and does not modify a published product', async () => {
      const published = await Product.create({
        name: 'Admin Published',
        sku: 'ADMIN-PUB-1',
        regularPrice: 200,
        status: 'published',
        ownerUserId: ownerId,
        category: categoryId,
        variants: [{ type: 'Color', values: ['Red'] }],
        mainImage: 'https://example.com/admin-main.jpg',
      });

      const beforeCount = await Product.countDocuments();

      const req = {
        body: {
          id: String(published._id),
          name: 'Corrupted Name',
          variants: [],
          mainImage: null,
        },
        user: { _id: ownerId },
      };
      const res = mockRes();

      await adminAutoSaveProduct(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      const afterCount = await Product.countDocuments();
      expect(afterCount).toBe(beforeCount);

      const unchanged = await Product.findById(published._id);
      expect(unchanged.name).toBe('Admin Published');
      expect(unchanged.variants).toHaveLength(1);
      expect(unchanged.mainImage).toBe('https://example.com/admin-main.jpg');
    });

    it('continues to auto-save draft products normally', async () => {
      const draft = await Product.create({
        name: 'Admin Draft',
        sku: 'ADMIN-DRAFT-1',
        regularPrice: 75,
        status: 'draft',
        ownerUserId: ownerId,
        category: categoryId,
      });

      const req = {
        body: {
          id: String(draft._id),
          name: 'Admin Draft Updated',
        },
        user: { _id: ownerId },
      };
      const res = mockRes();

      await adminAutoSaveProduct(req, res);

      expect(res.status).not.toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalled();
      const updated = await Product.findById(draft._id);
      expect(updated.name).toBe('Admin Draft Updated');
      expect(updated.status).toBe('draft');
    });
  });
});
