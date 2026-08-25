const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Product = require('../../models/Product');
const Category = require('../../models/Category');
const Subcategory = require('../../models/Subcategory');
const { addProduct, updateProduct } = require('../../controllers/sellerProductController');
const { PRIMARY_IMMUTABLE_MESSAGE } = require('../../utils/productCategoryValidation');

jest.mock('../../utils/skuGenerator', () => ({
  generateSku: jest.fn().mockResolvedValue('SELLER-SKU-1'),
}));

jest.mock('../../utils/catalogShippingValidation', () => ({
  validateProductWeightClass: jest.fn().mockResolvedValue({ valid: true, value: null }),
}));

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('seller primary category immutability (1.6)', () => {
  let mongoServer;
  let sellerId;
  let categoryA;
  let categoryB;
  let subA;
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
    sellerId = new mongoose.Types.ObjectId();
    categoryA = await Category.create({ name: 'Cat A' });
    categoryB = await Category.create({ name: 'Cat B' });
    subA = await Subcategory.create({ name: 'Sub A', category: categoryA._id });

    const product = await Product.create({
      name: 'Seller Widget',
      slug: 'seller-widget-abc12',
      sku: 'SELLER-IMMUT-SKU',
      regularPrice: 100,
      status: 'draft',
      ownerUserId: sellerId,
      seller: sellerId,
      sellerShop: sellerId,
      category: categoryA._id,
      subcategory: subA._id,
      seo: { primaryKeyword: 'Seller Widget' },
      shortDesc: 'Seller Widget description.',
    });
    productId = product._id;
  });

  it('rejects seller update that changes primary category', async () => {
    const req = {
      params: { id: String(productId) },
      body: {
        name: 'Seller Widget',
        category: String(categoryB._id),
        subcategory: '',
        childCategory: '',
        regularPrice: '100',
        status: 'draft',
      },
      user: { _id: sellerId },
      files: undefined,
    };
    const res = mockRes();

    await updateProduct(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const payload = res.json.mock.calls[0][0];
    expect(String(payload.message || payload.error || '')).toContain(
      PRIMARY_IMMUTABLE_MESSAGE.replace('❌ ', '')
    );

    const persisted = await Product.findById(productId).lean();
    expect(String(persisted.category)).toBe(String(categoryA._id));
  });

  it('allows seller update that keeps the same primary path and sets secondaryCategories', async () => {
    const req = {
      params: { id: String(productId) },
      body: {
        name: 'Seller Widget Updated',
        category: String(categoryA._id),
        subcategory: String(subA._id),
        childCategory: '',
        regularPrice: '120',
        status: 'draft',
        secondaryCategories: JSON.stringify([
          { category: String(categoryB._id), subcategory: '', childCategory: '' },
        ]),
      },
      user: { _id: sellerId },
      files: undefined,
    };
    const res = mockRes();

    await updateProduct(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    const persisted = await Product.findById(productId).lean();
    expect(String(persisted.category)).toBe(String(categoryA._id));
    expect(persisted.name).toBe('Seller Widget Updated');
    expect(persisted.secondaryCategories).toHaveLength(1);
    expect(String(persisted.secondaryCategories[0].category)).toBe(String(categoryB._id));
  });

  it('rejects addProduct draft-finalize that changes an established primary category', async () => {
    const req = {
      body: {
        id: String(productId),
        name: 'Seller Widget',
        category: String(categoryB._id),
        subcategory: '',
        childCategory: '',
        regularPrice: '100',
        status: 'draft',
        seo: { primaryKeyword: 'Seller Widget' },
        shortDesc: 'Seller Widget description.',
      },
      user: { _id: sellerId },
      files: undefined,
    };
    const res = mockRes();

    await addProduct(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const payload = res.json.mock.calls[0][0];
    expect(String(payload.message || '')).toContain(PRIMARY_IMMUTABLE_MESSAGE);

    const persisted = await Product.findById(productId).lean();
    expect(String(persisted.category)).toBe(String(categoryA._id));
    expect(String(persisted.subcategory)).toBe(String(subA._id));
  });

  it('allows new-product addProduct to establish a primary category', async () => {
    const req = {
      body: {
        name: 'Brand New Widget',
        sku: 'SELLER-NEW-CAT-SKU',
        category: String(categoryB._id),
        regularPrice: '50',
        status: 'draft',
        seo: { primaryKeyword: 'Brand New Widget' },
        shortDesc: 'Brand New Widget description.',
      },
      user: { _id: sellerId },
      files: undefined,
    };
    const res = mockRes();

    await addProduct(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    const created = await Product.findOne({ sku: 'SELLER-NEW-CAT-SKU' }).lean();
    expect(created).toBeTruthy();
    expect(String(created.category)).toBe(String(categoryB._id));
  });

  it('allows addProduct draft-finalize to establish primary when draft had none', async () => {
    const draft = await Product.create({
      name: 'No Cat Draft',
      slug: 'no-cat-draft-abc12',
      sku: 'SELLER-NO-CAT-SKU',
      regularPrice: 10,
      status: 'draft',
      ownerUserId: sellerId,
      seller: sellerId,
      sellerShop: sellerId,
    });

    const req = {
      body: {
        draftId: String(draft._id),
        name: 'No Cat Draft',
        category: String(categoryA._id),
        subcategory: String(subA._id),
        regularPrice: '10',
        status: 'draft',
        seo: { primaryKeyword: 'No Cat Draft' },
        shortDesc: 'No Cat Draft description.',
      },
      user: { _id: sellerId },
      files: undefined,
    };
    const res = mockRes();

    await addProduct(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    const persisted = await Product.findById(draft._id).lean();
    expect(String(persisted.category)).toBe(String(categoryA._id));
    expect(String(persisted.subcategory)).toBe(String(subA._id));
  });
});
