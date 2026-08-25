const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MongoMemoryServer } = require('mongodb-memory-server');
const SkuRule = require('../../models/SkuRule');
const Brand = require('../../models/brand');
const Category = require('../../models/Category');
const Seller = require('../../models/Seller');
const { generateVariantCombinations } = require('../../utils/variantUtils');
const {
  fillMissingVariantSkus,
  regenerateAllVariantSkus,
  assertUniqueVariantSkus,
  VariantSkuGenerationError,
} = require('../../utils/variantSkuGeneration');

const RULE_WITH_PACK_SIZE = [
  { type: 'product_name', length: 6, order: 1, enabled: true },
  { type: 'category_name', length: 5, order: 2, enabled: true },
  { type: 'seller_shop_name', length: 4, order: 3, enabled: true },
  { type: 'pack_size', length: 4, order: 4, enabled: true },
];

const RULE_WITHOUT_PACK_SIZE = [
  { type: 'product_name', length: 6, order: 1, enabled: true },
  { type: 'category_name', length: 5, order: 2, enabled: true },
  { type: 'seller_shop_name', length: 4, order: 3, enabled: true },
];

describe('variantSkuGeneration helper', () => {
  let mongoServer;
  let brand;
  let category;
  let seller;
  let product;

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
    await Brand.deleteMany({});
    await Category.deleteMany({});
    await Seller.deleteMany({});

    brand = await Brand.create({ name: 'TestBrand' });
    category = await Category.create({ name: 'Apparel' });
    const sellerToken = `seller-${Date.now()}`;
    seller = await Seller.create({
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

    product = {
      name: 'Multi Variant Shirt',
      sku: 'BASE-SHIRT-001',
      regularPrice: 999,
      salePrice: 799,
      stock: 10,
      weight: 200,
      brand: brand._id,
      category: category._id,
      seller: seller._id,
      variants: [
        { type: 'Color', values: ['Red', 'Blue'] },
        { type: 'Size', values: ['S', 'M'] },
      ],
    };
  });

  async function activateRule(segments) {
    await SkuRule.create({
      name: 'Test Rule',
      isActive: true,
      separator: '-',
      allowedCharacters: 'A-Z0-9-',
      segments,
    });
  }

  function expectUniqueSkus(variantSku, expectedCount) {
    const values = Object.values(variantSku);
    expect(values.length).toBe(expectedCount);
    expect(new Set(values).size).toBe(expectedCount);
    values.forEach((sku) => {
      expect(sku).not.toBe(product.sku);
    });
  }

  it('fillMissingVariantSkus generates unique SKUs without pack_size via collision handling', async () => {
    await activateRule(RULE_WITHOUT_PACK_SIZE);
    const combos = generateVariantCombinations(product.variants);

    const { variantSku, updated } = await fillMissingVariantSkus({
      product,
      variants: product.variants,
      variantSku: {},
      baseSku: product.sku,
      category,
      seller,
    });

    expect(updated).toBe(true);
    expectUniqueSkus(variantSku, combos.length);
  });

  it('fillMissingVariantSkus generates unique SKUs with pack_size segment', async () => {
    await activateRule(RULE_WITH_PACK_SIZE);
    const combos = generateVariantCombinations(product.variants);

    const { variantSku, updated } = await fillMissingVariantSkus({
      product,
      variants: product.variants,
      variantSku: {},
      baseSku: product.sku,
      category,
      seller,
    });

    expect(updated).toBe(true);
    expectUniqueSkus(variantSku, combos.length);
  });

  it('fillMissingVariantSkus only generates missing keys and seeds excludes from existing values', async () => {
    await activateRule(RULE_WITHOUT_PACK_SIZE);
    const combos = generateVariantCombinations(product.variants);
    const firstKey = Object.keys(
      await fillMissingVariantSkus({
        product,
        variants: product.variants,
        variantSku: {},
        baseSku: product.sku,
        category,
        seller,
      }).then((r) => r.variantSku)
    )[0];

    const partial = {
      [firstKey]: 'EXISTING-VAR-SKU-001',
    };

    const { variantSku, updated } = await fillMissingVariantSkus({
      product,
      variants: product.variants,
      variantSku: partial,
      baseSku: product.sku,
      category,
      seller,
    });

    expect(updated).toBe(true);
    expect(variantSku[firstKey]).toBe('EXISTING-VAR-SKU-001');
    expect(Object.keys(variantSku).length).toBe(combos.length);
    expectUniqueSkus(variantSku, combos.length);
  });

  it('regenerateAllVariantSkus overwrites all combinations uniquely', async () => {
    await activateRule(RULE_WITHOUT_PACK_SIZE);
    const combos = generateVariantCombinations(product.variants);

    const { variantSku } = await regenerateAllVariantSkus({
      product,
      variants: product.variants,
      baseSku: product.sku,
      category,
      seller,
    });

    expectUniqueSkus(variantSku, combos.length);
  });

  it('assertUniqueVariantSkus throws on duplicate values', () => {
    expect(() =>
      assertUniqueVariantSkus({
        'color:red|size:s': 'SKU-A',
        'color:blue|size:m': 'SKU-A',
      })
    ).toThrow(VariantSkuGenerationError);
  });
});
