const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Product = require('../../models/Product');
const SkuRule = require('../../models/SkuRule');
const Brand = require('../../models/brand');
const Category = require('../../models/Category');
const Seller = require('../../models/Seller');
const { regenerateSku } = require('../../controllers/adminProductController');
const { generateVariantCombinations } = require('../../utils/variantUtils');
const { isFallbackSku } = require('../../utils/skuGenerator');

const ACTIVE_RULE_SEGMENTS = [
  { type: 'product_name', length: 6, order: 1, enabled: true },
  { type: 'quantity', length: 3, order: 2, enabled: true },
  { type: 'category_name', length: 5, order: 3, enabled: true },
  { type: 'weight_number', length: 3, order: 4, enabled: true },
  { type: 'seller_shop_name', length: 4, order: 5, enabled: true },
  { type: 'regular_price', length: null, order: 6, enabled: true },
  { type: 'brand_name', length: 4, order: 7, enabled: true },
  { type: 'sale_price', length: 4, order: 8, enabled: true },
  { type: 'pack_size', length: 4, order: 9, enabled: true },
];

describe('regenerateSku variant integration (real generateSku)', () => {
  let mongoServer;
  let product;
  let adminUserId;

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
    await SkuRule.deleteMany({});
    await Product.deleteMany({});
    await Brand.deleteMany({});
    await Category.deleteMany({});
    await Seller.deleteMany({});

    adminUserId = new mongoose.Types.ObjectId();

    await SkuRule.create({
      name: 'Production-like Rule',
      isActive: true,
      separator: '-',
      allowedCharacters: 'A-Z0-9-',
      segments: ACTIVE_RULE_SEGMENTS,
    });

    const brand = await Brand.create({ name: 'Shambhavi' });
    const category = await Category.create({ name: 'Apparel' });
    const sellerToken = `seller-${Date.now()}`;
    const seller = await Seller.create({
      firstName: 'Yashi',
      lastName: 'Seller',
      username: sellerToken,
      shopName: 'Yashi Shop',
      shopUrl: `shop-${sellerToken}`,
      email: `${sellerToken}@test.com`,
      password: await bcrypt.hash('Test123!@#', 10),
      role: 'seller',
      isApproved: true,
    });

    product = await Product.create({
      name: 'Kanjivaram Saree',
      sku: 'KANJIVA-002-APPAR-400-YASH-1799-SHAM-0699',
      regularPrice: 1799,
      salePrice: 699,
      stock: 2,
      weight: 400,
      brand: brand._id,
      category: category._id,
      seller: seller._id,
      variants: [
        { type: 'Color', values: ['Purple'] },
        { type: 'Size', values: ['400'] },
      ],
      variantSku: {
        'color:purple|size:400': 'KANJIVARAMSARE-APPAREL-YASHI-SHAMBH-002-PURP-400-1799-0699-1',
      },
    });
  });

  it('regenerateSku returns 400 when no active SKU rule exists', async () => {
    await SkuRule.deleteMany({});

    const req = {
      params: { id: String(product._id) },
      body: { target: 'variants' },
      user: { _id: adminUserId },
    };
    const res = mockRes();

    await regenerateSku(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(/no active sku rule/i);

    const refreshed = await Product.findById(product._id);
    expect(refreshed.variantSku['color:purple|size:400'] || refreshed.variantSku['color:purple']).toBeDefined();
  });

  it('regenerateSku variants produces rule-based SKUs, not fallback', async () => {
    const req = {
      params: { id: String(product._id) },
      body: { target: 'variants' },
      user: { _id: adminUserId },
    };
    const res = mockRes();

    await regenerateSku(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    const variantSkus = Object.values(payload.product.variantSku || {});

    expect(variantSkus.length).toBeGreaterThan(0);
    variantSkus.forEach((sku) => {
      expect(isFallbackSku(sku)).toBe(false);
      expect(sku).toContain('APPAR');
      expect(sku.split('-').length).toBeGreaterThan(5);
    });
  });

  it('regenerateSku base still follows active rule', async () => {
    const req = {
      params: { id: String(product._id) },
      body: { target: 'base' },
      user: { _id: adminUserId },
    };
    const res = mockRes();

    await regenerateSku(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.product.sku).toContain('APPAR');
    expect(isFallbackSku(payload.product.sku)).toBe(false);
  });

  it('regenerateSku variants uses rule when active rule has legacy invalid segment types', async () => {
    await SkuRule.deleteMany({});
    await mongoose.connection.collection('skurules').insertOne({
      isActive: true,
      separator: '-',
      allowedCharacters: 'A-Z0-9-',
      segments: [
        { type: 'legacy_variant_code', length: 6, order: 1, enabled: true },
        ...ACTIVE_RULE_SEGMENTS,
      ],
    });

    const req = {
      params: { id: String(product._id) },
      body: { target: 'variants' },
      user: { _id: adminUserId },
    };
    const res = mockRes();

    await regenerateSku(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    const variantSkus = Object.values(payload.product.variantSku || {});

    expect(variantSkus.length).toBeGreaterThan(0);
    variantSkus.forEach((sku) => {
      expect(isFallbackSku(sku)).toBe(false);
      expect(sku).toContain('APPAR');
    });
  });

  it('regenerateSku all regenerates base and every variant combination', async () => {
    const combos = generateVariantCombinations(product.variants);
    const req = {
      params: { id: String(product._id) },
      body: { target: 'all' },
      user: { _id: adminUserId },
    };
    const res = mockRes();

    await regenerateSku(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];

    expect(isFallbackSku(payload.product.sku)).toBe(false);
    expect(Object.keys(payload.product.variantSku).length).toBe(combos.length);
    Object.values(payload.product.variantSku).forEach((sku) => {
      expect(isFallbackSku(sku)).toBe(false);
    });
  });

  it('regenerateSku base uses override sellerId without persisting product seller', async () => {
    const altSellerToken = `alt-seller-${Date.now()}`;
    const altSeller = await Seller.create({
      firstName: 'Alt',
      lastName: 'Seller',
      username: altSellerToken,
      shopName: 'NEWSHOP',
      shopUrl: `shop-${altSellerToken}`,
      email: `${altSellerToken}@test.com`,
      password: await bcrypt.hash('Test123!@#', 10),
      role: 'seller',
      isApproved: true,
    });

    const req = {
      params: { id: String(product._id) },
      body: {
        target: 'base',
        overrides: { sellerId: String(altSeller._id) },
      },
      user: { _id: adminUserId },
    };
    const res = mockRes();

    await regenerateSku(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.product.sku).toContain('NEWS');

    const persisted = await Product.findById(product._id);
    expect(String(persisted.seller)).not.toBe(String(altSeller._id));
  });

  it('regenerateSku base uses override categoryId without persisting product category', async () => {
    const altCategory = await Category.create({ name: 'Footwear' });

    const req = {
      params: { id: String(product._id) },
      body: {
        target: 'base',
        overrides: { categoryId: String(altCategory._id) },
      },
      user: { _id: adminUserId },
    };
    const res = mockRes();

    await regenerateSku(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.product.sku).toContain('FOOTW');

    const persisted = await Product.findById(product._id);
    expect(String(persisted.category)).not.toBe(String(altCategory._id));
  });

  it('regenerateSku base uses override product name without persisting product name', async () => {
    const req = {
      params: { id: String(product._id) },
      body: {
        target: 'base',
        overrides: { name: 'Banarasi Silk' },
      },
      user: { _id: adminUserId },
    };
    const res = mockRes();

    await regenerateSku(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.product.sku).toContain('BANARA');

    const persisted = await Product.findById(product._id);
    expect(persisted.name).toBe('Kanjivaram Saree');
  });

  it('regenerateSku base uses sellerShopName override for displayed shop without persisting seller', async () => {
    const req = {
      params: { id: String(product._id) },
      body: {
        target: 'base',
        overrides: {
          sellerId: String(product.seller),
          sellerShopName: 'Moonlight Boutique',
        },
      },
      user: { _id: adminUserId },
    };
    const res = mockRes();

    await regenerateSku(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.product.sku).toContain('MOON');

    const persisted = await Product.findById(product._id);
    expect(String(persisted.seller)).toBe(String(product.seller));
    expect(persisted.sku).toBe(payload.product.sku);
  });

  it('regenerateSku returns 400 for invalid override sellerId', async () => {
    const req = {
      params: { id: String(product._id) },
      body: {
        target: 'base',
        overrides: { sellerId: 'not-a-valid-id' },
      },
      user: { _id: adminUserId },
    };
    const res = mockRes();

    await regenerateSku(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(/invalid sellerid/i);
  });
});
