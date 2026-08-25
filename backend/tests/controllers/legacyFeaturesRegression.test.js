const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Product = require('../../models/Product');
const Category = require('../../models/Category');
const {
  updateProduct: adminUpdateProduct,
  autoSaveProduct: adminAutoSaveProduct,
} = require('../../controllers/adminProductController');
const {
  updateProduct: sellerUpdateProduct,
  autoSaveProduct: sellerAutoSaveProduct,
} = require('../../controllers/sellerProductController');

jest.mock('../../utils/skuGenerator', () => ({
  generateSku: jest.fn().mockResolvedValue('LEGACY-FEAT-SKU'),
  buildSkuProductSnapshot: jest.fn(),
}));

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

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const LEGACY_FEATURES = [
  { key: 'Weird Legacy Key', value: 'legacy-value' },
  { key: 'Brand Name', value: 'Acme' },
];

function compactFeatures(features) {
  return (features || []).map((f) => {
    const out = { key: f.key, value: f.value };
    if (f.code) out.code = f.code;
    if (Array.isArray(f.values) && f.values.length) out.values = [...f.values];
    return out;
  });
}

describe('legacy features[] regression (1.7 identity persistence)', () => {
  let mongoServer;
  let ownerId;
  let category;

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  beforeEach(async () => {
    await Promise.all([Product.deleteMany({}), Category.deleteMany({})]);
    ownerId = new mongoose.Types.ObjectId();
    category = await Category.create({ name: 'Legacy Feat Cat' });
  });

  it('admin update preserves legacy feature keys when features are re-submitted', async () => {
    const product = await Product.create({
      name: 'Legacy Feat Product',
      slug: 'legacy-feat-abc12',
      sku: 'LEGACY-ADMIN-FEAT',
      regularPrice: 50,
      status: 'draft',
      ownerUserId: ownerId,
      category: category._id,
      features: LEGACY_FEATURES,
      seo: { primaryKeyword: 'Legacy Feat Product' },
      shortDesc: 'Legacy Feat Product overview.',
    });

    const req = {
      params: { id: String(product._id) },
      body: {
        name: 'Legacy Feat Product',
        category: String(category._id),
        regularPrice: '55',
        status: 'draft',
        features: JSON.stringify(LEGACY_FEATURES),
        upsellSkus: '',
        crossSellSkus: '',
        boughtTogetherSkus: '',
      },
      user: { _id: ownerId },
      files: undefined,
    };
    const res = mockRes();

    await adminUpdateProduct(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    const persisted = await Product.findById(product._id).lean();
    expect(compactFeatures(persisted.features)).toEqual(LEGACY_FEATURES);
  });

  it('admin update does not rewrite Brand Name to Brand on write', async () => {
    const product = await Product.create({
      name: 'Brand Alias Product',
      slug: 'brand-alias-abc12',
      sku: 'LEGACY-ALIAS-FEAT',
      regularPrice: 40,
      status: 'draft',
      ownerUserId: ownerId,
      category: category._id,
      features: [{ key: 'Brand Name', value: 'OldCo' }],
    });

    const req = {
      params: { id: String(product._id) },
      body: {
        name: 'Brand Alias Product',
        category: String(category._id),
        regularPrice: '40',
        status: 'draft',
        features: JSON.stringify([{ key: 'Brand Name', value: 'NewCo' }]),
        upsellSkus: '',
        crossSellSkus: '',
        boughtTogetherSkus: '',
      },
      user: { _id: ownerId },
      files: undefined,
    };
    const res = mockRes();

    await adminUpdateProduct(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    const persisted = await Product.findById(product._id).lean();
    expect(compactFeatures(persisted.features)).toEqual([{ key: 'Brand Name', value: 'NewCo' }]);
  });

  it('admin update persists catalogue code and multi-value without renaming key', async () => {
    const product = await Product.create({
      name: 'Admin Identity Feat',
      slug: 'admin-identity-feat-abc12',
      sku: 'ADMIN-IDENTITY-FEAT',
      regularPrice: 40,
      status: 'draft',
      ownerUserId: ownerId,
      category: category._id,
      features: [],
    });

    const req = {
      params: { id: String(product._id) },
      body: {
        name: 'Admin Identity Feat',
        category: String(category._id),
        regularPrice: '40',
        status: 'draft',
        features: JSON.stringify([
          { code: 'general-information.brand', key: 'Brand', value: 'Acme' },
          {
            code: 'cosmetics-multi-select.skin-type',
            key: 'Skin Type',
            values: ['Oily', 'Dry'],
          },
        ]),
        upsellSkus: '',
        crossSellSkus: '',
        boughtTogetherSkus: '',
      },
      user: { _id: ownerId },
      files: undefined,
    };
    const res = mockRes();

    await adminUpdateProduct(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    const persisted = await Product.findById(product._id).lean();
    expect(compactFeatures(persisted.features)).toEqual([
      { key: 'Brand', value: 'Acme', code: 'general-information.brand' },
      {
        key: 'Skin Type',
        value: 'Oily',
        code: 'cosmetics-multi-select.skin-type',
        values: ['Oily', 'Dry'],
      },
    ]);
    expect(persisted.features.every((f) => f.catalogueCode === undefined)).toBe(true);
  });

  it('seller update persists catalogue identity from catalogueCode alias', async () => {
    const product = await Product.create({
      name: 'Seller Legacy Feat',
      slug: 'seller-legacy-feat-abc12',
      sku: 'LEGACY-SELLER-FEAT',
      regularPrice: 30,
      status: 'draft',
      ownerUserId: ownerId,
      seller: ownerId,
      sellerShop: ownerId,
      category: category._id,
      features: LEGACY_FEATURES,
      seo: { primaryKeyword: 'Seller Legacy Feat' },
      shortDesc: 'Seller Legacy Feat overview.',
    });

    const req = {
      params: { id: String(product._id) },
      body: {
        name: 'Seller Legacy Feat',
        category: String(category._id),
        regularPrice: '30',
        status: 'draft',
        features: JSON.stringify([
          {
            catalogueCode: 'general-information.brand',
            key: 'Brand',
            value: 'Acme',
          },
          { key: 'Weird Legacy Key', value: 'kept' },
        ]),
      },
      user: { _id: ownerId },
      files: undefined,
    };
    const res = mockRes();

    await sellerUpdateProduct(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    const persisted = await Product.findById(product._id).lean();
    expect(compactFeatures(persisted.features)).toEqual([
      { key: 'Brand', value: 'Acme', code: 'general-information.brand' },
      { key: 'Weird Legacy Key', value: 'kept' },
    ]);
    expect(persisted.features.every((f) => f.catalogueCode === undefined)).toBe(true);
  });

  it('admin autosave retains code and values for draft restore', async () => {
    const req = {
      body: {
        name: 'Admin Draft Feat',
        category: String(category._id),
        regularPrice: 10,
        sku: 'ADMIN-DRAFT-FEAT',
        features: [
          { code: 'general-information.model', key: 'Model', value: 'X1' },
          {
            code: 'cosmetics-multi-select.finish',
            key: 'Finish',
            values: ['Matte', 'Dewy'],
          },
        ],
      },
      user: { _id: ownerId },
    };
    const res = mockRes();

    await adminAutoSaveProduct(req, res);

    expect(res.json).toHaveBeenCalled();
    const saved = res.json.mock.calls[0][0].product;
    expect(compactFeatures(saved.features)).toEqual([
      { key: 'Model', value: 'X1', code: 'general-information.model' },
      {
        key: 'Finish',
        value: 'Matte',
        code: 'cosmetics-multi-select.finish',
        values: ['Matte', 'Dewy'],
      },
    ]);
  });

  it('seller autosave retains catalogue identity on draft create', async () => {
    const req = {
      body: {
        name: 'Seller Draft Feat',
        category: String(category._id),
        regularPrice: 10,
        sku: 'SELLER-DRAFT-FEAT',
        features: [
          { code: 'material.material', key: 'Material', value: 'Cotton' },
        ],
      },
      user: { _id: ownerId },
    };
    const res = mockRes();

    await sellerAutoSaveProduct(req, res);

    expect(res.json).toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    const saved = payload.product || payload.data;
    expect(compactFeatures(saved.features)).toEqual([
      { key: 'Material', value: 'Cotton', code: 'material.material' },
    ]);
  });
});
