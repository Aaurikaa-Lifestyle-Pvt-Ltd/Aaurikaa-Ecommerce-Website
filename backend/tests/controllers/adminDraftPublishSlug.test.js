const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Product = require('../../models/Product');
const Category = require('../../models/Category');
const WeightClass = require('../../models/WeightClass');
const { addProduct, updateProduct } = require('../../controllers/adminProductController');
const { extractSlugBase } = require('../../utils/slugUtils');

jest.mock('../../utils/skuGenerator', () => ({
  generateSku: jest.fn().mockResolvedValue('ADMIN-SKU-1'),
  buildSkuProductSnapshot: jest.fn(),
}));

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('admin draft publish slug (D2)', () => {
  let mongoServer;
  let adminId;
  let categoryId;
  let weightClassId;

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
    await Promise.all([
      Product.deleteMany({}),
      Category.deleteMany({}),
      WeightClass.deleteMany({}),
    ]);
    adminId = new mongoose.Types.ObjectId();
    const category = await Category.create({ name: 'Admin Category' });
    categoryId = category._id;
    const slab = await WeightClass.create({
      name: 'Slug Test Slab',
      minWeightG: 0,
      maxWeightG: 1000,
      active: true,
    });
    weightClassId = String(slab._id);
  });

  const publishBody = (overrides = {}) => ({
    name: 'Admin Widget',
    sku: 'ADMIN-PUBLISH-SKU',
    regularPrice: '100',
    category: String(categoryId),
    status: 'published',
    weightClass: weightClassId,
    seo: { primaryKeyword: 'Admin Widget' },
    shortDesc: 'Admin Widget overview.',
    upsellSkus: '',
    crossSellSkus: '',
    boughtTogetherSkus: '',
    ...overrides,
  });

  it('regenerates placeholder slug when publishing a finalized draft via addProduct', async () => {
    const draft = await Product.create({
      name: 'Admin Widget',
      slug: 'untitled-draft-abc12',
      sku: 'ADMIN-DRAFT',
      regularPrice: 100,
      status: 'draft',
      ownerUserId: adminId,
      category: categoryId,
    });
    await Product.findByIdAndUpdate(draft._id, { $set: { slug: 'untitled-draft-abc12' } });

    const req = {
      body: publishBody({ draftId: String(draft._id) }),
      user: { _id: adminId },
      files: undefined,
    };
    const res = mockRes();

    await addProduct(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const published = await Product.findById(draft._id);
    expect(published.status).toBe('published');
    expect(extractSlugBase(published.slug)).toBe('admin-widget');
    expect(published.slug).not.toMatch(/^untitled-draft-/);
  });

  it('generates slug from title on direct publish via addProduct', async () => {
    const req = {
      body: publishBody(),
      user: { _id: adminId },
      files: undefined,
    };
    const res = mockRes();

    await addProduct(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const created = await Product.findOne({ sku: 'ADMIN-PUBLISH-SKU' });
    expect(created).toBeTruthy();
    expect(extractSlugBase(created.slug)).toBe('admin-widget');
  });

  it('regenerates placeholder slug when publishing a draft via updateProduct', async () => {
    const draft = await Product.create({
      name: 'Admin Widget',
      slug: 'untitled-draft-xyz99',
      sku: 'ADMIN-EDIT-DRAFT',
      regularPrice: 100,
      status: 'draft',
      ownerUserId: adminId,
      category: categoryId,
    });
    await Product.findByIdAndUpdate(draft._id, { $set: { slug: 'untitled-draft-xyz99' } });

    const req = {
      params: { id: String(draft._id) },
      body: publishBody(),
      user: { _id: adminId },
      files: undefined,
    };
    const res = mockRes();

    await updateProduct(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    const published = await Product.findById(draft._id);
    expect(published.status).toBe('published');
    expect(extractSlugBase(published.slug)).toBe('admin-widget');
  });

  it('rejects publish with empty title', async () => {
    const req = {
      body: publishBody({
        name: '',
        seo: { primaryKeyword: '' },
        shortDesc: '',
      }),
      user: { _id: adminId },
      files: undefined,
    };
    const res = mockRes();

    await addProduct(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(
      /title is required|SEO keyword|Primary SEO/i
    );
  });

  it('rejects publish with placeholder title', async () => {
    const req = {
      body: publishBody({
        name: 'Untitled Draft',
        seo: { primaryKeyword: '' },
        shortDesc: 'Untitled Draft overview.',
      }),
      user: { _id: adminId },
      files: undefined,
    };
    const res = mockRes();

    await addProduct(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(/placeholder title/i);
  });

  it('does not regenerate slug when editing an already published product', async () => {
    const published = await Product.create({
      name: 'Published Admin Product',
      slug: 'published-admin-product-abc12',
      sku: 'ADMIN-PUB',
      regularPrice: 100,
      status: 'published',
      ownerUserId: adminId,
      category: categoryId,
      approvalStatus: 'approved',
      weightClass: weightClassId,
    });
    await Product.findByIdAndUpdate(published._id, { $set: { slug: 'published-admin-product-abc12' } });

    const req = {
      params: { id: String(published._id) },
      body: {
        name: 'Renamed Admin Product',
        regularPrice: '100',
        category: String(categoryId),
        status: 'published',
        weightClass: weightClassId,
        seo: { primaryKeyword: 'Renamed Admin Product' },
        shortDesc: 'Renamed Admin Product overview.',
        upsellSkus: '',
        crossSellSkus: '',
        boughtTogetherSkus: '',
      },
      user: { _id: adminId },
      files: undefined,
    };
    const res = mockRes();

    await updateProduct(req, res);

    const updated = await Product.findById(published._id);
    expect(updated.slug).toBe('published-admin-product-abc12');
    expect(updated.name).toBe('Renamed Admin Product');
  });
});
