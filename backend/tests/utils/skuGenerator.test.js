const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { generateSku, isFallbackSku } = require('../../utils/skuGenerator');
const SkuRule = require('../../models/SkuRule');
const Product = require('../../models/Product');
const Brand = require('../../models/brand');
const Category = require('../../models/Category');
const Seller = require('../../models/Seller');
const { generateVariantCombinations, normalizeVariantCombination } = require('../../utils/variantUtils');


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

describe('skuGenerator variant regeneration', () => {
  let mongoServer;
  let brand;
  let category;
  let seller;
  let product;
  let baseSku;

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

    await SkuRule.create({
      name: 'Test Rule',
      isActive: true,
      separator: '-',
      allowedCharacters: 'A-Z0-9-',
      segments: ACTIVE_RULE_SEGMENTS,
    });

    brand = await Brand.create({ name: 'Shambhavi' });
    category = await Category.create({ name: 'Apparel' });
    const sellerToken = `seller-${Date.now()}`;
    seller = await Seller.create({
      firstName: 'Yashi',
      lastName: 'Seller',
      username: sellerToken,
      shopName: 'Yashi Shop',
      shopUrl: `shop-${sellerToken}`,
      email: `${sellerToken}@test.com`,
      password: 'hashed',
      role: 'seller',
      isApproved: true,
    });

    product = await Product.create({
      name: 'Kanjivaram Saree',
      sku: `BASE-${Date.now()}`,
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
      variantSku: {},
    });

    baseSku = await generateSku({
      product,
      category,
      seller,
      excludeSkus: [],
    });
  });

  it('A: base SKU follows active rule', async () => {
    expect(baseSku).toMatch(/^KANJIV-/);
    expect(baseSku).toContain('APPAR');
    expect(isFallbackSku(baseSku)).toBe(false);
  });

  it('A/D: variant SKU follows active rule with variantValues', async () => {
    const combos = generateVariantCombinations(product.variants);
    expect(combos.length).toBeGreaterThan(0);

    const combo = combos[0];
    const variantSku = await generateSku({
      product,
      category,
      seller,
      variantValues: Object.values(combo),
      excludeSkus: [baseSku],
    });

    expect(variantSku).toMatch(/^KANJIV-/);
    expect(variantSku).toContain('APPAR');
    expect(isFallbackSku(variantSku)).toBe(false);
  });

  it('B: variant SKU must not use NAME8-RAND4 fallback when rule succeeds', async () => {
    const combos = generateVariantCombinations(product.variants);
    const variantSku = await generateSku({
      product,
      category,
      seller,
      variantValues: Object.values(combos[0]),
      excludeSkus: [baseSku],
    });

    expect(isFallbackSku(variantSku)).toBe(false);
    expect(variantSku.split('-').length).toBeGreaterThan(3);
  });

  it('D: all variant combinations produce rule-based SKUs', async () => {
    const combos = generateVariantCombinations(product.variants);
    const results = [];

    for (const combo of combos) {
      const key = normalizeVariantCombination(combo);
      const sku = await generateSku({
        product,
        category,
        seller,
        variantValues: Object.values(combo),
        excludeSkus: [baseSku],
      });
      results.push({ key, sku });
      expect(isFallbackSku(sku)).toBe(false);
      expect(sku.split('-').length).toBeGreaterThan(3);
    }

    expect(results.length).toBe(combos.length);
  });

  it('C: mongoose document product behaves same as plain object for variants', async () => {
    const reloaded = await Product.findById(product._id);
    const categoryDoc = await Category.findById(product.category);
    const sellerDoc = await Seller.findById(product.seller);
    const combos = generateVariantCombinations(reloaded.variants);

    const fromDoc = await generateSku({
      product: reloaded,
      category: categoryDoc,
      seller: sellerDoc,
      variantValues: Object.values(combos[0]),
      excludeSkus: [baseSku],
    });

    const plain = reloaded.toObject();
    const fromPlain = await generateSku({
      product: plain,
      category: categoryDoc.toObject(),
      seller: sellerDoc.toObject(),
      variantValues: Object.values(combos[0]),
      excludeSkus: [baseSku],
    });

    expect(fromDoc).toBe(fromPlain);
    expect(isFallbackSku(fromDoc)).toBe(false);
  });

  it('uses valid segments when rule contains unknown segment types', async () => {
    await SkuRule.deleteMany({});
    await mongoose.connection.collection('skurules').insertOne({
      isActive: true,
      separator: '-',
      allowedCharacters: 'A-Z0-9-',
      segments: [
        { type: 'invalid_legacy_type', length: 6, order: 1, enabled: true },
        { type: 'product_name', length: 6, order: 2, enabled: true },
        { type: 'category_name', length: 5, order: 3, enabled: true },
        { type: 'pack_size', length: 4, order: 4, enabled: true },
      ],
    });

    const combos = generateVariantCombinations(product.variants);
    const variantSku = await generateSku({
      product,
      category,
      seller,
      variantCombination: combos[0],
      variantValues: Object.values(combos[0]),
      excludeSkus: [baseSku],
    });

    expect(isFallbackSku(variantSku)).toBe(false);
    expect(variantSku).toContain('KANJIV');
    expect(variantSku).toContain('PURP');
  });

  it('E: fallback only when no active rule exists', async () => {
    await SkuRule.deleteMany({});

    const fallbackSku = await generateSku({
      product,
      category,
      seller,
      variantValues: ['Purple', '400'],
      excludeSkus: [],
    });

    expect(isFallbackSku(fallbackSku)).toBe(true);
    expect(fallbackSku.startsWith('KANJIVAR-')).toBe(true);
  });
});
