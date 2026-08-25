const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Category = require('../../models/Category');
const Subcategory = require('../../models/Subcategory');
const ChildCategory = require('../../models/ChildCategory');
const {
  PRIMARY_IMMUTABLE_MESSAGE,
  SECONDARY_DUPLICATE_MESSAGE,
  SECONDARY_SAME_AS_PRIMARY_MESSAGE,
  parseSecondaryCategoriesInput,
  assertSellerPrimaryImmutable,
  assertValidTaxonomyPath,
  normalizeAndValidateSecondaryCategories,
  categoryPathKey,
} = require('../../utils/productCategoryValidation');

describe('productCategoryValidation', () => {
  let mongoServer;
  let categoryA;
  let categoryB;
  let subA;
  let subB;
  let childA;

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
      Category.deleteMany({}),
      Subcategory.deleteMany({}),
      ChildCategory.deleteMany({}),
    ]);

    categoryA = await Category.create({ name: 'Electronics' });
    categoryB = await Category.create({ name: 'Apparel' });
    subA = await Subcategory.create({ name: 'Phones', category: categoryA._id });
    subB = await Subcategory.create({ name: 'Shirts', category: categoryB._id });
    childA = await ChildCategory.create({ name: 'Smartphones', subcategory: subA._id });
  });

  describe('parseSecondaryCategoriesInput', () => {
    it('parses JSON strings and empty values', () => {
      expect(parseSecondaryCategoriesInput('')).toEqual([]);
      expect(parseSecondaryCategoriesInput('[]')).toEqual([]);
      expect(
        parseSecondaryCategoriesInput(
          JSON.stringify([{ category: String(categoryA._id), subcategory: String(subA._id) }])
        )
      ).toHaveLength(1);
      expect(
        parseSecondaryCategoriesInput([
          JSON.stringify([{ category: String(categoryB._id) }]),
        ])
      ).toHaveLength(1);
    });
  });

  describe('assertSellerPrimaryImmutable', () => {
    it('allows omitted fields and identical values', () => {
      const existing = {
        category: categoryA._id,
        subcategory: subA._id,
        childCategory: childA._id,
      };
      expect(() => assertSellerPrimaryImmutable(existing, {})).not.toThrow();
      expect(() =>
        assertSellerPrimaryImmutable(existing, {
          category: String(categoryA._id),
          subcategory: String(subA._id),
          childCategory: String(childA._id),
        })
      ).not.toThrow();
    });

    it('rejects primary path mutation', () => {
      const existing = {
        category: categoryA._id,
        subcategory: subA._id,
        childCategory: childA._id,
      };
      expect(() =>
        assertSellerPrimaryImmutable(existing, { category: String(categoryB._id) })
      ).toThrow(PRIMARY_IMMUTABLE_MESSAGE);
    });

    it('allows establishing a primary field that was not yet set', () => {
      const existing = {
        category: null,
        subcategory: null,
        childCategory: null,
      };
      expect(() =>
        assertSellerPrimaryImmutable(existing, {
          category: String(categoryA._id),
          subcategory: String(subA._id),
        })
      ).not.toThrow();
    });

    it('rejects clearing an established primary category', () => {
      const existing = { category: categoryA._id, subcategory: null, childCategory: null };
      expect(() =>
        assertSellerPrimaryImmutable(existing, { category: '' })
      ).toThrow(PRIMARY_IMMUTABLE_MESSAGE);
    });
  });

  describe('assertValidTaxonomyPath', () => {
    it('accepts a valid full path', async () => {
      const result = await assertValidTaxonomyPath({
        category: categoryA._id,
        subcategory: subA._id,
        childCategory: childA._id,
      });
      expect(result.category).toBe(String(categoryA._id));
      expect(result.childCategory).toBe(String(childA._id));
    });

    it('rejects subcategory under the wrong category', async () => {
      await expect(
        assertValidTaxonomyPath({
          category: categoryA._id,
          subcategory: subB._id,
        })
      ).rejects.toThrow(/subcategory/i);
    });
  });

  describe('normalizeAndValidateSecondaryCategories', () => {
    it('rejects duplicates and paths matching primary', async () => {
      const primary = {
        category: String(categoryA._id),
        subcategory: String(subA._id),
        childCategory: String(childA._id),
      };

      await expect(
        normalizeAndValidateSecondaryCategories([primary], primary)
      ).rejects.toThrow(SECONDARY_SAME_AS_PRIMARY_MESSAGE);

      const secondary = {
        category: String(categoryB._id),
        subcategory: String(subB._id),
        childCategory: null,
      };
      await expect(
        normalizeAndValidateSecondaryCategories([secondary, secondary], primary)
      ).rejects.toThrow(SECONDARY_DUPLICATE_MESSAGE);
    });

    it('returns normalized unique secondary paths', async () => {
      const primary = {
        category: String(categoryA._id),
        subcategory: String(subA._id),
        childCategory: String(childA._id),
      };
      const secondary = {
        category: String(categoryB._id),
        subcategory: String(subB._id),
      };
      const result = await normalizeAndValidateSecondaryCategories([secondary], primary);
      expect(result).toHaveLength(1);
      expect(categoryPathKey(result[0])).toBe(categoryPathKey(secondary));
    });
  });
});
