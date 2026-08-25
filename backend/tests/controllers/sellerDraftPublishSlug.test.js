const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Product = require('../../models/Product');
const { addProduct, updateProduct } = require('../../controllers/sellerProductController');
const { extractSlugBase } = require('../../utils/slugUtils');

jest.mock('../../utils/skuGenerator', () => ({
  generateSku: jest.fn().mockResolvedValue('SELLER-SKU-1'),
}));

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('seller draft publish slug (D2)', () => {
  let mongoServer;
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
    sellerId = new mongoose.Types.ObjectId();
    categoryId = new mongoose.Types.ObjectId();
  });

  const publishBody = (overrides = {}) => ({
    name: 'Blue Widget',
    sku: 'SELLER-PUBLISH-SKU',
    regularPrice: '100',
    category: String(categoryId),
    status: 'published',
    seo: { primaryKeyword: 'Blue Widget' },
    shortDesc: 'Blue Widget for everyday use.',
    ...overrides,
  });

  it('regenerates placeholder slug when publishing a finalized draft via addProduct', async () => {
    const draft = await Product.create({
      name: 'Blue Widget',
      slug: 'untitled-draft-abc12',
      sku: 'DRAFT-SKU',
      regularPrice: 100,
      status: 'draft',
      ownerUserId: sellerId,
      seller: sellerId,
      sellerShop: sellerId,
      category: categoryId,
      seo: { primaryKeyword: 'Blue Widget' },
      shortDesc: 'Blue Widget for everyday use.',
    });
    await Product.findByIdAndUpdate(draft._id, { $set: { slug: 'untitled-draft-abc12' } });

    const req = {
      body: publishBody({ draftId: String(draft._id) }),
      user: { _id: sellerId },
      files: undefined,
    };
    const res = mockRes();

    await addProduct(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    const published = await Product.findById(draft._id);
    expect(published.status).toBe('published');
    expect(extractSlugBase(published.slug)).toBe('blue-widget');
    expect(published.slug).not.toMatch(/^untitled-draft-/);
  });

  it('generates slug from title on direct publish via addProduct', async () => {
    const req = {
      body: publishBody(),
      user: { _id: sellerId },
      files: undefined,
    };
    const res = mockRes();

    await addProduct(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    const created = await Product.findOne({ sku: 'SELLER-PUBLISH-SKU' });
    expect(created).toBeTruthy();
    expect(extractSlugBase(created.slug)).toBe('blue-widget');
  });

  it('regenerates placeholder slug when publishing a draft via updateProduct', async () => {
    const draft = await Product.create({
      name: 'Blue Widget',
      slug: 'untitled-draft-xyz99',
      sku: 'EDIT-DRAFT-SKU',
      regularPrice: 100,
      status: 'draft',
      ownerUserId: sellerId,
      seller: sellerId,
      sellerShop: sellerId,
      category: categoryId,
      seo: { primaryKeyword: 'Blue Widget' },
      shortDesc: 'Blue Widget for everyday use.',
    });
    await Product.findByIdAndUpdate(draft._id, { $set: { slug: 'untitled-draft-xyz99' } });

    const req = {
      params: { id: String(draft._id) },
      body: publishBody(),
      user: { _id: sellerId },
      files: undefined,
    };
    const res = mockRes();

    await updateProduct(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    const published = await Product.findById(draft._id);
    expect(published.status).toBe('published');
    expect(extractSlugBase(published.slug)).toBe('blue-widget');
  });

  it('rejects publish with empty title', async () => {
    const req = {
      body: publishBody({ name: '   ' }),
      user: { _id: sellerId },
      files: undefined,
    };
    const res = mockRes();

    await addProduct(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(/title is required/i);
  });

  it('rejects publish with placeholder title', async () => {
    const req = {
      body: publishBody({ name: 'Untitled Draft' }),
      user: { _id: sellerId },
      files: undefined,
    };
    const res = mockRes();

    await addProduct(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(/placeholder title/i);
  });

  it('does not regenerate slug when editing an already published product', async () => {
    const published = await Product.create({
      name: 'Original Title',
      slug: 'original-title-abc12',
      sku: 'PUB-SKU',
      regularPrice: 100,
      status: 'published',
      ownerUserId: sellerId,
      seller: sellerId,
      sellerShop: sellerId,
      category: categoryId,
      seo: { primaryKeyword: 'Renamed Title' },
      shortDesc: 'Renamed Title overview.',
    });
    await Product.findByIdAndUpdate(published._id, { $set: { slug: 'original-title-abc12' } });

    const req = {
      params: { id: String(published._id) },
      body: {
        name: 'Renamed Title',
        regularPrice: '100',
        category: String(categoryId),
        status: 'published',
        seo: { primaryKeyword: 'Renamed Title' },
        shortDesc: 'Renamed Title overview.',
      },
      user: { _id: sellerId },
      files: undefined,
    };
    const res = mockRes();

    await updateProduct(req, res);

    const updated = await Product.findById(published._id);
    expect(updated.slug).toBe('original-title-abc12');
    expect(updated.name).toBe('Renamed Title');
  });
});
