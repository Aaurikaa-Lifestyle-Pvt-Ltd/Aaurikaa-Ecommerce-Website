const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Product = require('../../models/Product');
const Category = require('../../models/Category');
// Register for updateProduct populate("weightClass") after successful publish.
require('../../models/WeightClass');
const { addProduct, updateProduct } = require('../../controllers/adminProductController');
const {
  KEYWORD_REQUIRED_MESSAGE,
  KEYWORD_TITLE_MESSAGE,
} = require('../../utils/primaryKeywordValidation');

jest.mock('../../utils/catalogShippingValidation', () => ({
  validateProductWeightClass: jest.fn().mockResolvedValue({ valid: true, value: null }),
}));

jest.mock('../../utils/returnPolicyResolver', () => ({
  normalizeProductReturnPolicyFields: jest.fn(() => ({
    valid: true,
    returnPolicyMode: 'inherit',
    returnAllowed: true,
    returnWindowDays: 7,
    returnConditions: '',
  })),
}));

jest.mock('../../utils/skuGenerator', () => ({
  generateSku: jest.fn().mockResolvedValue('ADMIN-KW-SKU-1'),
  buildSkuProductSnapshot: jest.fn(),
}));

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const validKeywordBody = {
  name: 'Cotton Yoga Mat 6mm',
  shortDesc: 'Cotton Yoga Mat with extra grip.',
  seo: { primaryKeyword: 'Cotton Yoga Mat' },
  regularPrice: '100',
  sku: 'KW-CREATE-SKU',
  upsellSkus: '',
  crossSellSkus: '',
  boughtTogetherSkus: '',
};

describe('admin product primary keyword effective status (1.8)', () => {
  let mongoServer;
  let adminId;
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
    await Promise.all([Product.deleteMany({}), Category.deleteMany({})]);
    adminId = new mongoose.Types.ObjectId();
    const category = await Category.create({ name: 'Keyword Test Category' });
    categoryId = category._id;
  });

  it('allows create as published with mismatched primaryKeyword and no shortDesc (admin SEO decoupling)', async () => {
    const req = {
      body: {
        name: 'Celeste Pearl Stud Earrings',
        seo: { primaryKeyword: 'Pearl Stud' },
        regularPrice: '100',
        sku: 'KW-OMIT-OK',
        category: String(categoryId),
        status: 'published',
        upsellSkus: '',
        crossSellSkus: '',
        boughtTogetherSkus: '',
      },
      user: { _id: adminId },
      files: undefined,
    };
    const res = mockRes();
    await addProduct(req, res);
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.status).toHaveBeenCalledWith(201);
    const created = await Product.findOne({ sku: 'KW-OMIT-OK' });
    expect(created).toBeTruthy();
    expect(created.status).toBe('published');
    expect(created.seo.primaryKeyword).toBe('Pearl Stud');
    expect(created.shortDesc == null || created.shortDesc === '').toBe(true);
  });

  it('allows create as draft without T1/D1', async () => {
    const req = {
      body: {
        name: 'Untitled-ish Product',
        status: 'draft',
        regularPrice: '100',
        sku: 'KW-DRAFT-OK',
        category: String(categoryId),
        upsellSkus: '',
        crossSellSkus: '',
        boughtTogetherSkus: '',
      },
      user: { _id: adminId },
      files: undefined,
    };
    const res = mockRes();
    await addProduct(req, res);
    expect(res.status).not.toHaveBeenCalledWith(400);
    const created = await Product.findOne({ sku: 'KW-DRAFT-OK' });
    expect(created).toBeTruthy();
    expect(created.status).toBe('draft');
  });

  it('allows published-product save when T1 fails (admin SEO decoupling)', async () => {
    const product = await Product.create({
      name: 'Cotton Yoga Mat 6mm',
      slug: 'cotton-yoga-mat-abc12',
      sku: 'KW-PUB-1',
      regularPrice: 100,
      status: 'published',
      ownerUserId: adminId,
      category: categoryId,
      shortDesc: 'Cotton Yoga Mat with extra grip.',
      seo: { primaryKeyword: 'Cotton Yoga Mat' },
    });

    const req = {
      params: { id: String(product._id) },
      body: {
        name: 'Renamed Title',
        shortDesc: 'Cotton Yoga Mat with extra grip.',
        seo: { primaryKeyword: 'Cotton Yoga Mat' },
        regularPrice: '100',
        category: String(categoryId),
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
    expect(res.json.mock.calls[0]?.[0]?.message).not.toBe(KEYWORD_TITLE_MESSAGE);
    const updated = await Product.findById(product._id);
    expect(updated.status).toBe('published');
    expect(updated.name).toBe('Renamed Title');
    expect(updated.seo.primaryKeyword).toBe('Cotton Yoga Mat');
  });

  it('allows draft update without T1/D1 when status stays draft (omitted)', async () => {
    const product = await Product.create({
      name: 'Draft Name',
      slug: 'draft-name-abc12',
      sku: 'KW-DRAFT-UPD',
      regularPrice: 100,
      status: 'draft',
      ownerUserId: adminId,
      category: categoryId,
    });

    const req = {
      params: { id: String(product._id) },
      body: {
        name: 'Still A Draft',
        regularPrice: '100',
        category: String(categoryId),
        upsellSkus: '',
        crossSellSkus: '',
        boughtTogetherSkus: '',
      },
      user: { _id: adminId },
      files: undefined,
    };
    const res = mockRes();
    await updateProduct(req, res);
    expect(res.json.mock.calls[0][0].message).not.toBe(KEYWORD_REQUIRED_MESSAGE);
    expect(res.json.mock.calls[0][0].message).not.toBe(KEYWORD_TITLE_MESSAGE);
    const updated = await Product.findById(product._id);
    expect(updated.status).toBe('draft');
    expect(updated.name).toBe('Still A Draft');
  });

  it('admin draft→published without keyword succeeds and does not auto-fill primaryKeyword', async () => {
    const product = await Product.create({
      name: 'Draft Name',
      slug: 'draft-pub-abc12',
      sku: 'KW-DRAFT-PUB',
      regularPrice: 100,
      status: 'draft',
      ownerUserId: adminId,
      category: categoryId,
    });

    const req = {
      params: { id: String(product._id) },
      body: {
        name: 'Draft Name',
        status: 'published',
        regularPrice: '100',
        category: String(categoryId),
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
    const updated = await Product.findById(product._id);
    expect(updated.status).toBe('published');
    expect(String(updated.seo?.primaryKeyword || '').trim()).toBe('');
  });

  it('admin can publish when existing primaryKeyword does not prefix the product name', async () => {
    const product = await Product.create({
      name: 'Celeste Pearl Stud Earrings',
      slug: 'celeste-pearl-abc12',
      sku: 'KW-MISMATCH-PUB',
      regularPrice: 100,
      status: 'draft',
      ownerUserId: adminId,
      category: categoryId,
      seo: { primaryKeyword: 'Pearl Stud' },
    });

    const req = {
      params: { id: String(product._id) },
      body: {
        name: 'Celeste Pearl Stud Earrings',
        status: 'published',
        regularPrice: '100',
        category: String(categoryId),
        seo: { primaryKeyword: 'Pearl Stud' },
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
    expect(res.json.mock.calls[0]?.[0]?.message).not.toBe(KEYWORD_TITLE_MESSAGE);
    expect(res.json.mock.calls[0]?.[0]?.message).not.toBe(KEYWORD_REQUIRED_MESSAGE);
    const updated = await Product.findById(product._id);
    expect(updated.status).toBe('published');
    expect(updated.seo.primaryKeyword).toBe('Pearl Stud');
  });

  it('admin can save published product without primaryKeyword and without shortDesc', async () => {
    const product = await Product.create({
      name: 'Celeste Pearl Stud Earrings',
      slug: 'celeste-save-abc12',
      sku: 'KW-SAVE-NOKW',
      regularPrice: 100,
      status: 'published',
      ownerUserId: adminId,
      category: categoryId,
    });

    const req = {
      params: { id: String(product._id) },
      body: {
        name: 'Celeste Pearl Stud Earrings',
        regularPrice: '150',
        category: String(categoryId),
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
    const updated = await Product.findById(product._id);
    expect(updated.status).toBe('published');
    expect(updated.regularPrice).toBe(150);
    expect(String(updated.seo?.primaryKeyword || '').trim()).toBe('');
  });

  it('allows published update without shortDesc when keyword matches title (AAURIKAA admin)', async () => {
    const product = await Product.create({
      name: 'Gold Hoop Earrings',
      slug: 'gold-hoop-earrings-abc12',
      sku: 'KW-PUB-NOSHORT',
      regularPrice: 100,
      status: 'published',
      ownerUserId: adminId,
      category: categoryId,
      seo: { primaryKeyword: 'Gold Hoop Earrings' },
    });

    const req = {
      params: { id: String(product._id) },
      body: {
        name: 'Gold Hoop Earrings',
        seo: { primaryKeyword: 'Gold Hoop Earrings' },
        regularPrice: '120',
        category: String(categoryId),
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
    const updated = await Product.findById(product._id);
    expect(updated.status).toBe('published');
    expect(updated.seo.primaryKeyword).toBe('Gold Hoop Earrings');
    expect(updated.regularPrice).toBe(120);
  });

  it('allows a duplicate primary keyword on create when T1/D1 pass', async () => {
    await Product.create({
      name: 'Cotton Yoga Mat A',
      slug: 'cotton-a-abc12',
      sku: 'KW-DUP-A',
      regularPrice: 10,
      status: 'published',
      ownerUserId: adminId,
      category: categoryId,
      shortDesc: 'Cotton Yoga Mat studio.',
      seo: { primaryKeyword: 'Cotton Yoga Mat' },
    });

    const req = {
      body: {
        ...validKeywordBody,
        sku: 'KW-DUP-B',
        category: String(categoryId),
        status: 'published',
      },
      user: { _id: adminId },
      files: undefined,
    };
    const res = mockRes();
    await addProduct(req, res);
    expect(res.status).not.toHaveBeenCalledWith(400);
    const created = await Product.findOne({ sku: 'KW-DUP-B' });
    expect(created).toBeTruthy();
    expect(created.seo.primaryKeyword).toBe('Cotton Yoga Mat');
  });

  it('persists flat primaryKeyword FormData key onto seo.primaryKeyword on create', async () => {
    const req = {
      body: {
        name: 'Cotton Yoga Mat 6mm',
        shortDesc: 'Cotton Yoga Mat with extra grip.',
        primaryKeyword: 'Cotton Yoga Mat',
        regularPrice: '100',
        sku: 'KW-FLAT-CREATE',
        category: String(categoryId),
        status: 'published',
        upsellSkus: '',
        crossSellSkus: '',
        boughtTogetherSkus: '',
      },
      user: { _id: adminId },
      files: undefined,
    };
    const res = mockRes();
    await addProduct(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    const created = await Product.findOne({ sku: 'KW-FLAT-CREATE' });
    expect(created.seo.primaryKeyword).toBe('Cotton Yoga Mat');
    expect(created.toObject().primaryKeyword).toBeUndefined();
  });

  it('persists dotted seo.primaryKeyword FormData key on update', async () => {
    const product = await Product.create({
      name: 'Cotton Yoga Mat 6mm',
      slug: 'cotton-flat-upd-abc12',
      sku: 'KW-FLAT-UPD',
      regularPrice: 100,
      status: 'draft',
      ownerUserId: adminId,
      category: categoryId,
      shortDesc: 'Cotton Yoga Mat overview.',
    });

    const req = {
      params: { id: String(product._id) },
      body: {
        name: 'Cotton Yoga Mat 6mm',
        shortDesc: 'Cotton Yoga Mat overview.',
        'seo.primaryKeyword': 'Cotton Yoga Mat',
        regularPrice: '100',
        category: String(categoryId),
        status: 'draft',
        upsellSkus: '',
        crossSellSkus: '',
        boughtTogetherSkus: '',
      },
      user: { _id: adminId },
      files: undefined,
    };
    const res = mockRes();
    await updateProduct(req, res);
    const updated = await Product.findById(product._id);
    expect(updated.seo.primaryKeyword).toBe('Cotton Yoga Mat');
  });
});
