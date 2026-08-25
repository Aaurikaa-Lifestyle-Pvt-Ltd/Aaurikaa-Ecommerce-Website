const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Product = require('../../models/Product');
const Category = require('../../models/Category');
const Subcategory = require('../../models/Subcategory');
const { updateProduct } = require('../../controllers/adminProductController');
const {
  SECONDARY_DUPLICATE_MESSAGE,
  SECONDARY_SAME_AS_PRIMARY_MESSAGE,
} = require('../../utils/productCategoryValidation');

jest.mock('../../utils/skuGenerator', () => ({
  generateSku: jest.fn().mockResolvedValue('ADMIN-CAT-SKU-1'),
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

describe('admin primary category authority + secondary validation (1.6)', () => {
  let mongoServer;
  let adminId;
  let categoryA;
  let categoryB;
  let subA;
  let subB;
  let productId;

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
    await Promise.all([
      Product.deleteMany({}),
      Category.deleteMany({}),
      Subcategory.deleteMany({}),
    ]);
    adminId = new mongoose.Types.ObjectId();
    categoryA = await Category.create({ name: 'Admin Cat A' });
    categoryB = await Category.create({ name: 'Admin Cat B' });
    subA = await Subcategory.create({ name: 'Admin Sub A', category: categoryA._id });
    subB = await Subcategory.create({ name: 'Admin Sub B', category: categoryB._id });

    const product = await Product.create({
      name: 'Admin Widget',
      slug: 'admin-widget-abc12',
      sku: 'ADMIN-PRIMARY-SKU',
      regularPrice: 100,
      status: 'draft',
      ownerUserId: adminId,
      category: categoryA._id,
      subcategory: subA._id,
      seo: { primaryKeyword: 'Admin Widget' },
      shortDesc: 'Admin Widget description.',
    });
    productId = product._id;
  });

  it('allows admin to change the primary category path', async () => {
    const req = {
      params: { id: String(productId) },
      body: {
        name: 'Admin Widget',
        category: String(categoryB._id),
        subcategory: String(subB._id),
        childCategory: '',
        regularPrice: '100',
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

    expect(res.status).not.toHaveBeenCalledWith(400);
    const persisted = await Product.findById(productId).lean();
    expect(String(persisted.category)).toBe(String(categoryB._id));
    expect(String(persisted.subcategory)).toBe(String(subB._id));
  });

  it('rejects secondary path that matches the effective primary', async () => {
    const req = {
      params: { id: String(productId) },
      body: {
        name: 'Admin Widget',
        category: String(categoryA._id),
        subcategory: String(subA._id),
        childCategory: '',
        regularPrice: '100',
        status: 'draft',
        secondaryCategories: JSON.stringify([
          { category: String(categoryA._id), subcategory: String(subA._id), childCategory: '' },
        ]),
        upsellSkus: '',
        crossSellSkus: '',
        boughtTogetherSkus: '',
      },
      user: { _id: adminId },
      files: undefined,
    };
    const res = mockRes();

    await updateProduct(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(String(res.json.mock.calls[0][0].message || '')).toContain(
      SECONDARY_SAME_AS_PRIMARY_MESSAGE
    );
  });

  it('rejects duplicate secondary paths', async () => {
    const secondary = {
      category: String(categoryB._id),
      subcategory: String(subB._id),
      childCategory: '',
    };
    const req = {
      params: { id: String(productId) },
      body: {
        name: 'Admin Widget',
        category: String(categoryA._id),
        subcategory: String(subA._id),
        childCategory: '',
        regularPrice: '100',
        status: 'draft',
        secondaryCategories: JSON.stringify([secondary, secondary]),
        upsellSkus: '',
        crossSellSkus: '',
        boughtTogetherSkus: '',
      },
      user: { _id: adminId },
      files: undefined,
    };
    const res = mockRes();

    await updateProduct(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(String(res.json.mock.calls[0][0].message || '')).toContain(SECONDARY_DUPLICATE_MESSAGE);
  });

  it('persists a valid secondary path when primary is also changed by admin', async () => {
    const req = {
      params: { id: String(productId) },
      body: {
        name: 'Admin Widget',
        category: String(categoryB._id),
        subcategory: String(subB._id),
        childCategory: '',
        regularPrice: '100',
        status: 'draft',
        secondaryCategories: JSON.stringify([
          { category: String(categoryA._id), subcategory: String(subA._id), childCategory: '' },
        ]),
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
    const persisted = await Product.findById(productId).lean();
    expect(String(persisted.category)).toBe(String(categoryB._id));
    expect(persisted.secondaryCategories).toHaveLength(1);
    expect(String(persisted.secondaryCategories[0].category)).toBe(String(categoryA._id));
  });
});
