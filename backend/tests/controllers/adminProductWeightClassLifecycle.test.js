const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Product = require('../../models/Product');
const Category = require('../../models/Category');
const WeightClass = require('../../models/WeightClass');
const { addProduct, updateProduct } = require('../../controllers/adminProductController');
const { WEIGHT_CLASS_REQUIRED_MESSAGE } = require('../../utils/catalogShippingValidation');

jest.mock('../../utils/skuGenerator', () => ({
  generateSku: jest.fn().mockResolvedValue('ADMIN-WC-SKU'),
  buildSkuProductSnapshot: jest.fn(),
}));

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('admin product weightClass lifecycle (draft vs publish)', () => {
  let mongoServer;
  let adminId;
  let categoryId;
  let activeSlab;

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
    const category = await Category.create({ name: 'Jewellery' });
    categoryId = category._id;
    activeSlab = await WeightClass.create({
      name: 'Light Jewellery',
      minWeightG: 0,
      maxWeightG: 500,
      active: true,
    });
  });

  const draftBody = (overrides = {}) => ({
    name: 'Draft Ring',
    sku: 'DRAFT-WC-1',
    regularPrice: '100',
    category: String(categoryId),
    status: 'draft',
    seo: { primaryKeyword: 'Draft Ring' },
    shortDesc: 'Draft ring overview.',
    upsellSkus: '',
    crossSellSkus: '',
    boughtTogetherSkus: '',
    ...overrides,
  });

  const publishBody = (overrides = {}) =>
    draftBody({
      sku: 'PUB-WC-1',
      status: 'published',
      ...overrides,
    });

  it('creates a draft without weightClass', async () => {
    const req = {
      body: draftBody({ weightClass: '' }),
      user: { _id: adminId },
      files: undefined,
    };
    const res = mockRes();

    await addProduct(req, res);

    expect({
      status: res.status.mock.calls[0]?.[0],
      body: res.json.mock.calls[0]?.[0],
    }).toEqual(expect.objectContaining({ status: 201 }));
    const created = await Product.findOne({ sku: 'DRAFT-WC-1' });
    expect(created).toBeTruthy();
    expect(created.status).toBe('draft');
    expect(created.weightClass).toBeNull();
  });

  it('updates a draft without weightClass', async () => {
    const draft = await Product.create({
      name: 'Draft Ring',
      sku: 'DRAFT-WC-UPD',
      regularPrice: 100,
      status: 'draft',
      ownerUserId: adminId,
      category: categoryId,
    });

    const req = {
      params: { id: String(draft._id) },
      body: draftBody({
        sku: 'DRAFT-WC-UPD',
        weightClass: '',
        name: 'Draft Ring Updated',
        seo: { primaryKeyword: 'Draft Ring Updated' },
      }),
      user: { _id: adminId },
      files: undefined,
    };
    const res = mockRes();

    await updateProduct(req, res);

    expect({
      status: res.status.mock.calls[0]?.[0],
      body: res.json.mock.calls[0]?.[0],
    }).not.toEqual(expect.objectContaining({ status: 400 }));
    const updated = await Product.findById(draft._id);
    expect(updated.status).toBe('draft');
    expect(updated.name).toBe('Draft Ring Updated');
    expect(updated.weightClass).toBeNull();
  });

  it('rejects publish without weightClass with Shipping Slab required', async () => {
    const draft = await Product.create({
      name: 'Draft Ring',
      sku: 'DRAFT-WC-NOPUB',
      regularPrice: 100,
      status: 'draft',
      ownerUserId: adminId,
      category: categoryId,
    });

    const req = {
      params: { id: String(draft._id) },
      body: publishBody({
        sku: 'DRAFT-WC-NOPUB',
        weightClass: '',
      }),
      user: { _id: adminId },
      files: undefined,
    };
    const res = mockRes();

    await updateProduct(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toBe(WEIGHT_CLASS_REQUIRED_MESSAGE);
    const stillDraft = await Product.findById(draft._id);
    expect(stillDraft.status).toBe('draft');
  });

  it('publishes with valid weightClass and sets approvalStatus approved', async () => {
    const draft = await Product.create({
      name: 'Draft Ring',
      sku: 'DRAFT-WC-PUB',
      regularPrice: 100,
      status: 'draft',
      ownerUserId: adminId,
      category: categoryId,
    });

    const req = {
      params: { id: String(draft._id) },
      body: publishBody({
        sku: 'DRAFT-WC-PUB',
        weightClass: String(activeSlab._id),
      }),
      user: { _id: adminId },
      files: undefined,
    };
    const res = mockRes();

    await updateProduct(req, res);

    expect({
      status: res.status.mock.calls[0]?.[0],
      body: res.json.mock.calls[0]?.[0],
    }).not.toEqual(expect.objectContaining({ status: 400 }));
    const published = await Product.findById(draft._id);
    expect(published.status).toBe('published');
    expect(published.approvalStatus).toBe('approved');
    expect(String(published.weightClass)).toBe(String(activeSlab._id));
  });

  it('keeps published + approved when editing an already-published product', async () => {
    const published = await Product.create({
      name: 'Live Ring',
      sku: 'LIVE-WC-1',
      regularPrice: 100,
      status: 'published',
      approvalStatus: 'approved',
      ownerUserId: adminId,
      category: categoryId,
      weightClass: activeSlab._id,
      seo: { primaryKeyword: 'Live Ring' },
      shortDesc: 'Live ring overview.',
    });

    const req = {
      params: { id: String(published._id) },
      body: {
        name: 'Live Ring Renamed',
        sku: 'LIVE-WC-1',
        regularPrice: '120',
        category: String(categoryId),
        status: 'published',
        weightClass: String(activeSlab._id),
        seo: { primaryKeyword: 'Live Ring Renamed' },
        shortDesc: 'Live Ring Renamed overview.',
        upsellSkus: '',
        crossSellSkus: '',
        boughtTogetherSkus: '',
      },
      user: { _id: adminId },
      files: undefined,
    };
    const res = mockRes();

    await updateProduct(req, res);

    expect({
      status: res.status.mock.calls[0]?.[0],
      body: res.json.mock.calls[0]?.[0],
    }).not.toEqual(expect.objectContaining({ status: 400 }));
    const updated = await Product.findById(published._id);
    expect(updated.status).toBe('published');
    expect(updated.approvalStatus).toBe('approved');
    expect(updated.name).toBe('Live Ring Renamed');
    expect(String(updated.weightClass)).toBe(String(activeSlab._id));
  });

  it('saves published product without shortDesc and remains published (admin AAURIKAA form)', async () => {
    const published = await Product.create({
      name: 'Live Ring',
      sku: 'LIVE-NOSHORT-1',
      regularPrice: 100,
      status: 'published',
      approvalStatus: 'approved',
      ownerUserId: adminId,
      category: categoryId,
      weightClass: activeSlab._id,
      seo: { primaryKeyword: 'Live Ring' },
      shortDesc: '',
    });

    const req = {
      params: { id: String(published._id) },
      body: {
        name: 'Live Ring',
        sku: 'LIVE-NOSHORT-1',
        regularPrice: '110',
        category: String(categoryId),
        status: 'published',
        weightClass: String(activeSlab._id),
        seo: { primaryKeyword: 'Live Ring' },
        longDesc: 'Detailed jewellery description only.',
        upsellSkus: '',
        crossSellSkus: '',
        boughtTogetherSkus: '',
      },
      user: { _id: adminId },
      files: undefined,
    };
    const res = mockRes();

    await updateProduct(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    const updated = await Product.findById(published._id);
    expect(updated.status).toBe('published');
    expect(updated.approvalStatus).toBe('approved');
    expect(updated.seo.primaryKeyword).toBe('Live Ring');
    expect(Number(updated.regularPrice)).toBe(110);
  });

  it('unpublishes published product to draft', async () => {
    const published = await Product.create({
      name: 'Live Ring',
      sku: 'LIVE-UNPUB-1',
      regularPrice: 100,
      status: 'published',
      approvalStatus: 'approved',
      ownerUserId: adminId,
      category: categoryId,
      weightClass: activeSlab._id,
      seo: { primaryKeyword: 'Live Ring' },
    });

    const req = {
      params: { id: String(published._id) },
      body: {
        name: 'Live Ring',
        sku: 'LIVE-UNPUB-1',
        regularPrice: '100',
        category: String(categoryId),
        status: 'draft',
        weightClass: String(activeSlab._id),
        seo: { primaryKeyword: 'Live Ring' },
        upsellSkus: '',
        crossSellSkus: '',
        boughtTogetherSkus: '',
      },
      user: { _id: adminId },
      files: undefined,
    };
    const res = mockRes();

    await updateProduct(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    const updated = await Product.findById(published._id);
    expect(updated.status).toBe('draft');
  });
});
