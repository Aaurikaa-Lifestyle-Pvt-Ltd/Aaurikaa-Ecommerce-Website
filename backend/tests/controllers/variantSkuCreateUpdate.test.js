const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Product = require('../../models/Product');
const SkuRule = require('../../models/SkuRule');
const Brand = require('../../models/brand');
const Category = require('../../models/Category');
const Seller = require('../../models/Seller');
const { addProduct: adminAddProduct, updateProduct: adminUpdateProduct, regenerateSku } = require('../../controllers/adminProductController');
const { addProduct: sellerAddProduct, updateProduct: sellerUpdateProduct } = require('../../controllers/sellerProductController');
const { generateVariantCombinations, normalizeVariantCombination } = require('../../utils/variantUtils');

jest.mock('../../utils/productPublishGuard', () => ({
  assertPublishable: jest.fn().mockResolvedValue(undefined),
  enforcePublishSlugOnTransition: jest.fn(async ({ currentSlug }) => currentSlug),
  isDraftToPublishedTransition: jest.fn(
    (previousStatus, newStatus) => previousStatus !== 'published' && newStatus === 'published'
  ),
}));

const RULE_WITHOUT_PACK_SIZE = [
  { type: 'product_name', length: 6, order: 1, enabled: true },
  { type: 'category_name', length: 5, order: 2, enabled: true },
  { type: 'seller_shop_name', length: 4, order: 3, enabled: true },
];

const RULE_WITH_PACK_SIZE = [
  ...RULE_WITHOUT_PACK_SIZE,
  { type: 'pack_size', length: 4, order: 4, enabled: true },
];

const MULTI_VARIANTS = JSON.stringify([
  { type: 'Color', values: ['Red', 'Blue'] },
  { type: 'Size', values: ['S', 'M'] },
]);

describe('variant SKU create/update controller integration', () => {
  let mongoServer;
  let adminId;
  let sellerUserId;
  let brand;
  let category;
  let seller;

  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  function expectUniqueVariantSkus(variantSku, variants, baseSku) {
    const combos = generateVariantCombinations(variants);
    const keys = combos
      .map((combo) => normalizeVariantCombination(combo))
      .filter(Boolean);
    const values = keys.map((key) => variantSku[key]).filter(Boolean);

    expect(values.length).toBe(combos.length);
    expect(new Set(values).size).toBe(combos.length);
    values.forEach((sku) => expect(sku).not.toBe(baseSku));
  }

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
    await SkuRule.deleteMany({});
    await Brand.deleteMany({});
    await Category.deleteMany({});
    await Seller.deleteMany({});

    adminId = new mongoose.Types.ObjectId();
    sellerUserId = new mongoose.Types.ObjectId();
    brand = await Brand.create({ name: 'TestBrand' });
    category = await Category.create({ name: 'Apparel' });
    const sellerToken = `seller-${Date.now()}`;
    seller = await Seller.create({
      _id: sellerUserId,
      firstName: 'Test',
      lastName: 'Seller',
      username: sellerToken,
      shopName: 'TestShop',
      shopUrl: `shop-${sellerToken}`,
      email: `${sellerToken}@test.com`,
      password: await bcrypt.hash('Test123!@#', 10),
      role: 'seller',
      isApproved: true,
    });
  });

  async function activateRule(segments) {
    await SkuRule.create({
      name: 'Controller Test Rule',
      isActive: true,
      separator: '-',
      allowedCharacters: 'A-Z0-9-',
      segments,
    });
  }

  it('admin addProduct generates unique variant SKUs without pack_size', async () => {
    await activateRule(RULE_WITHOUT_PACK_SIZE);
    const combos = generateVariantCombinations(JSON.parse(MULTI_VARIANTS));
    const req = {
      user: { _id: adminId },
      body: {
        name: 'Admin Multi Variant',
        regularPrice: 500,
        salePrice: 400,
        stock: 5,
        weight: 100,
        brand: String(brand._id),
        category: String(category._id),
        sellerId: String(seller._id),
        status: 'draft',
        variants: MULTI_VARIANTS,
        variantSku: '{}',
        mainImage: 'https://cdn.example.com/main.jpg',
      },
      files: {},
    };
    const res = mockRes();

    await adminAddProduct(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    const payload = res.json.mock.calls[0][0];
    const saved = payload.product || payload.data?.product;
    expect(saved).toBeTruthy();
    expectUniqueVariantSkus(saved.variantSku, saved.variants, saved.sku);
  });

  it('admin addProduct generates unique variant SKUs with pack_size', async () => {
    await activateRule(RULE_WITH_PACK_SIZE);
    const combos = generateVariantCombinations(JSON.parse(MULTI_VARIANTS));
    const req = {
      user: { _id: adminId },
      body: {
        name: 'Admin Pack Size Variant',
        regularPrice: 500,
        salePrice: 400,
        stock: 5,
        weight: 100,
        brand: String(brand._id),
        category: String(category._id),
        sellerId: String(seller._id),
        status: 'draft',
        variants: MULTI_VARIANTS,
        variantSku: '{}',
        mainImage: 'https://cdn.example.com/main.jpg',
      },
      files: {},
    };
    const res = mockRes();

    await adminAddProduct(req, res);

    const payload = res.json.mock.calls[0][0];
    const saved = payload.product || payload.data?.product;
    expectUniqueVariantSkus(saved.variantSku, saved.variants, saved.sku);
  });

  it('seller addProduct generates unique variant SKUs', async () => {
    await activateRule(RULE_WITHOUT_PACK_SIZE);
    const combos = generateVariantCombinations(JSON.parse(MULTI_VARIANTS));
    const req = {
      user: { _id: sellerUserId },
      body: {
        name: 'Seller Multi Variant',
        regularPrice: 500,
        salePrice: 400,
        stock: 5,
        weight: 100,
        brand: String(brand._id),
        category: String(category._id),
        status: 'draft',
        variants: MULTI_VARIANTS,
        variantSku: '{}',
        mainImage: 'https://cdn.example.com/main.jpg',
      },
      files: {},
    };
    const res = mockRes();

    await sellerAddProduct(req, res);

    const payload = res.json.mock.calls[0][0];
    const saved = payload.data?.product || payload.product;
    expectUniqueVariantSkus(saved.variantSku, saved.variants, saved.sku);
  });

  it('admin updateProduct fills missing variant SKUs uniquely', async () => {
    await activateRule(RULE_WITHOUT_PACK_SIZE);
    const variants = JSON.parse(MULTI_VARIANTS);
    const combos = generateVariantCombinations(variants);

    const existing = await Product.create({
      name: 'Existing Admin Product',
      sku: 'ADMIN-BASE-001',
      regularPrice: 500,
      salePrice: 400,
      stock: 5,
      weight: 100,
      brand: brand._id,
      category: category._id,
      seller: seller._id,
      ownerUserId: adminId,
      status: 'draft',
      variants,
      variantSku: {},
      mainImage: 'https://cdn.example.com/main.jpg',
    });

    const req = {
      params: { id: String(existing._id) },
      user: { _id: adminId },
      body: {
        name: existing.name,
        regularPrice: existing.regularPrice,
        salePrice: existing.salePrice,
        stock: existing.stock,
        weight: existing.weight,
        brand: String(brand._id),
        category: String(category._id),
        sellerId: String(seller._id),
        status: 'draft',
        variants: MULTI_VARIANTS,
        variantSku: '{}',
      },
      files: {},
    };
    const res = mockRes();

    await adminUpdateProduct(req, res);

    const payload = res.json.mock.calls[0][0];
    const saved = payload.product || payload.data?.product;
    expectUniqueVariantSkus(saved.variantSku, saved.variants, saved.sku);
  });

  it('seller updateProduct fills missing variant SKUs uniquely', async () => {
    await activateRule(RULE_WITHOUT_PACK_SIZE);
    const variants = JSON.parse(MULTI_VARIANTS);
    const combos = generateVariantCombinations(variants);

    const existing = await Product.create({
      name: 'Existing Seller Product',
      sku: 'SELLER-BASE-001',
      regularPrice: 500,
      salePrice: 400,
      stock: 5,
      weight: 100,
      brand: brand._id,
      category: category._id,
      seller: sellerUserId,
      ownerUserId: sellerUserId,
      status: 'draft',
      variants,
      variantSku: {},
      mainImage: 'https://cdn.example.com/main.jpg',
    });

    const req = {
      params: { id: String(existing._id) },
      user: { _id: sellerUserId },
      body: {
        name: existing.name,
        regularPrice: existing.regularPrice,
        salePrice: existing.salePrice,
        stock: existing.stock,
        weight: existing.weight,
        brand: String(brand._id),
        category: String(category._id),
        status: 'draft',
        variants: MULTI_VARIANTS,
        variantSku: '{}',
      },
      files: {},
    };
    const res = mockRes();

    await sellerUpdateProduct(req, res);

    const payload = res.json.mock.calls[0][0];
    const saved = payload.data?.product || payload.product;
    expectUniqueVariantSkus(saved.variantSku, saved.variants, saved.sku);
  });

  it('regenerateSku variants behavior remains unchanged', async () => {
    await activateRule(RULE_WITHOUT_PACK_SIZE);
    const variants = JSON.parse(MULTI_VARIANTS);
    const combos = generateVariantCombinations(variants);

    const existing = await Product.create({
      name: 'Regen Product',
      sku: 'REGEN-BASE-001',
      regularPrice: 500,
      salePrice: 400,
      stock: 5,
      weight: 100,
      brand: brand._id,
      category: category._id,
      seller: seller._id,
      ownerUserId: adminId,
      status: 'draft',
      variants,
      variantSku: { 'color:red|size:s': 'OLD-SKU' },
      mainImage: 'https://cdn.example.com/main.jpg',
    });

    const req = {
      params: { id: String(existing._id) },
      body: { target: 'variants' },
      user: { _id: adminId },
    };
    const res = mockRes();

    await regenerateSku(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expectUniqueVariantSkus(payload.product.variantSku, payload.product.variants, payload.product.sku);
    expect(payload.product.variantSku['color:red|size:s']).not.toBe('OLD-SKU');
  });
});
