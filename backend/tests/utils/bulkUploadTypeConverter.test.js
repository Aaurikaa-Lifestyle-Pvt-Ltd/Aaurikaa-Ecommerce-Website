// backend/tests/utils/bulkUploadTypeConverter.test.js
const mongoose = require('mongoose');
const {
  convertToNumber,
  convertToInteger,
  convertToObjectId,
  convertToBoolean,
  parseJson,
  parseCommaSeparated,
  convertProductRow,
  convertProductRows
} = require('../../utils/bulkUploadTypeConverter');

describe('Bulk Upload Type Converter', () => {
  let sellerId;

  beforeAll(() => {
    sellerId = new mongoose.Types.ObjectId().toString();
  });

  describe('convertToNumber', () => {
    it('should convert string number to number', () => {
      expect(convertToNumber('100')).toBe(100);
      expect(convertToNumber('100.50')).toBe(100.50);
    });

    it('should return number as-is', () => {
      expect(convertToNumber(100)).toBe(100);
      expect(convertToNumber(100.50)).toBe(100.50);
    });

    it('should return default value for empty string', () => {
      expect(convertToNumber('', 0)).toBe(0);
      expect(convertToNumber('', 10)).toBe(10);
    });

    it('should return default value for null/undefined', () => {
      expect(convertToNumber(null, 0)).toBe(0);
      expect(convertToNumber(undefined, 0)).toBe(0);
    });

    it('should return default value for invalid string', () => {
      expect(convertToNumber('invalid', 0)).toBe(0);
    });
  });

  describe('convertToInteger', () => {
    it('should convert string number to integer', () => {
      expect(convertToInteger('100')).toBe(100);
      expect(convertToInteger('100.50')).toBe(100);
    });

    it('should return integer as-is', () => {
      expect(convertToInteger(100)).toBe(100);
    });

    it('should return default value for empty string', () => {
      expect(convertToInteger('', 0)).toBe(0);
    });

    it('should return default value for invalid string', () => {
      expect(convertToInteger('invalid', 0)).toBe(0);
    });
  });

  describe('convertToObjectId', () => {
    it('should convert valid ObjectId string to ObjectId', () => {
      const id = new mongoose.Types.ObjectId();
      const result = convertToObjectId(id.toString());
      expect(result).toBeInstanceOf(mongoose.Types.ObjectId);
      expect(result.toString()).toBe(id.toString());
    });

    it('should return null for empty string', () => {
      expect(convertToObjectId('')).toBeNull();
      expect(convertToObjectId('null')).toBeNull();
      expect(convertToObjectId('undefined')).toBeNull();
    });

    it('should return null for invalid ObjectId', () => {
      expect(convertToObjectId('invalid-id')).toBeNull();
    });

    it('should return ObjectId as-is', () => {
      const id = new mongoose.Types.ObjectId();
      expect(convertToObjectId(id)).toBeInstanceOf(mongoose.Types.ObjectId);
    });
  });

  describe('convertToBoolean', () => {
    it('should convert string "true" to boolean', () => {
      expect(convertToBoolean('true')).toBe(true);
      expect(convertToBoolean('True')).toBe(true);
      expect(convertToBoolean('TRUE')).toBe(true);
    });

    it('should convert string "1" to boolean', () => {
      expect(convertToBoolean('1')).toBe(true);
    });

    it('should convert string "yes" to boolean', () => {
      expect(convertToBoolean('yes')).toBe(true);
      expect(convertToBoolean('Yes')).toBe(true);
    });

    it('should return false for other strings', () => {
      expect(convertToBoolean('false')).toBe(false);
      expect(convertToBoolean('0')).toBe(false);
      expect(convertToBoolean('no')).toBe(false);
    });

    it('should return boolean as-is', () => {
      expect(convertToBoolean(true)).toBe(true);
      expect(convertToBoolean(false)).toBe(false);
    });

    it('should convert number to boolean', () => {
      expect(convertToBoolean(1)).toBe(true);
      expect(convertToBoolean(0)).toBe(false);
    });
  });

  describe('parseJson', () => {
    it('should parse JSON array string', () => {
      const result = parseJson('[1, 2, 3]', 'array');
      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual([1, 2, 3]);
    });

    it('should parse JSON object string', () => {
      const result = parseJson('{"key": "value"}', 'object');
      expect(typeof result).toBe('object');
      expect(result.key).toBe('value');
    });

    it('should return empty array for empty string', () => {
      expect(parseJson('', 'array')).toEqual([]);
      expect(parseJson('[]', 'array')).toEqual([]);
    });

    it('should return empty object for empty string', () => {
      expect(parseJson('', 'object')).toEqual({});
      expect(parseJson('{}', 'object')).toEqual({});
    });

    it('should return array as-is', () => {
      const arr = [1, 2, 3];
      expect(parseJson(arr, 'array')).toEqual(arr);
    });

    it('should handle comma-separated string for arrays', () => {
      const result = parseJson('item1,item2,item3', 'array');
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('parseCommaSeparated', () => {
    it('should parse comma-separated string to array', () => {
      const result = parseCommaSeparated('tag1,tag2,tag3');
      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should trim whitespace', () => {
      const result = parseCommaSeparated('tag1, tag2 , tag3');
      expect(result).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should filter empty values', () => {
      const result = parseCommaSeparated('tag1,,tag2, ,tag3');
      expect(result).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should return empty array for empty string', () => {
      expect(parseCommaSeparated('')).toEqual([]);
    });

    it('should return array as-is', () => {
      const arr = ['tag1', 'tag2'];
      expect(parseCommaSeparated(arr)).toEqual(arr);
    });
  });

  describe('convertProductRow', () => {
    it('should convert all field types correctly', async () => {
      const categoryId = new mongoose.Types.ObjectId();
      const row = {
        name: 'Test Product',
        sku: 'SKU-001',
        regularPrice: '100.50',
        salePrice: '80.25',
        stock: '10',
        length: '5.5',
        width: '3.2',
        height: '2.1',
        weight: '1.5',
        taxRate: '10',
        shippingCharge: '5',
        shippingType: 'flat',
        shippingApplicability: 'applicable',
        category: categoryId.toString(),
        subcategory: categoryId.toString(),
        brand: categoryId.toString(),
        isFeatured: 'true',
        taxIncluded: 'yes',
        variants: '[{"type": "color", "values": ["red", "blue"]}]',
        features: '[{"key": "material", "value": "cotton"}]',
        tags: 'tag1,tag2,tag3',
        upsellSkus: 'SKU-002,SKU-003'
      };

      const result = await convertProductRow(row, sellerId);

      expect(typeof result.regularPrice).toBe('number');
      expect(result.regularPrice).toBe(100.50);
      expect(typeof result.salePrice).toBe('number');
      expect(result.salePrice).toBe(80.25);
      expect(typeof result.stock).toBe('number');
      expect(result.stock).toBe(10);
      expect(result.category).toBeInstanceOf(mongoose.Types.ObjectId);
      expect(result.isFeatured).toBe(true);
      expect(result.taxIncluded).toBe(true);
      expect(Array.isArray(result.variants)).toBe(true);
      expect(Array.isArray(result.features)).toBe(true);
      expect(Array.isArray(result.tags)).toBe(true);
      expect(Array.isArray(result.upsellSkus)).toBe(true);
      expect(result.seller).toBeInstanceOf(mongoose.Types.ObjectId);
      // P6: obsolete shipping columns ignored (not mapped)
      expect(result.shippingCharge).toBeUndefined();
      expect(result.shippingType).toBeUndefined();
      expect(result.shippingApplicability).toBeUndefined();
    });

    it('should handle optional fields', async () => {
      const categoryId = new mongoose.Types.ObjectId();
      const row = {
        name: 'Test Product',
        sku: 'SKU-001',
        regularPrice: '100',
        stock: '10',
        category: categoryId.toString()
      };

      const result = await convertProductRow(row, sellerId);
      expect(result.name).toBe('Test Product');
      expect(result.regularPrice).toBe(100);
      expect(result.stock).toBe(10);
    });

    it('should remove undefined values', async () => {
      const categoryId = new mongoose.Types.ObjectId();
      const row = {
        name: 'Test Product',
        sku: 'SKU-001',
        regularPrice: '100',
        stock: '10',
        category: categoryId.toString()
      };

      const result = await convertProductRow(row, sellerId);
      expect(result.subcategory).toBeUndefined();
      expect(result.brand).toBeUndefined();
    });

    it('converts secondaryCategories JSON ids without requiring Point 2 bulk redesign', async () => {
      const categoryId = new mongoose.Types.ObjectId();
      const secondaryId = new mongoose.Types.ObjectId();
      const result = await convertProductRow(
        {
          name: 'Test Product',
          sku: 'SKU-SEC',
          regularPrice: '100',
          stock: '10',
          category: categoryId.toString(),
          secondaryCategories: JSON.stringify([{ category: secondaryId.toString() }]),
        },
        sellerId
      );
      expect(result.secondaryCategories).toHaveLength(1);
      expect(result.secondaryCategories[0].category.toString()).toBe(secondaryId.toString());
      expect(result.secondaryCategories[0].unresolved).toBe(false);
    });

    it('clips WS-3 assurance fields on import using the same Add/Edit normalizer', async () => {
      const categoryId = new mongoose.Types.ObjectId();
      const result = await convertProductRow(
        {
          name: 'Test Product',
          sku: 'SKU-ASR',
          regularPrice: '100',
          stock: '10',
          category: categoryId.toString(),
          genuineProduct: 'yes',
          warrantyAvailable: 'true',
          warrantyDuration: 'd'.repeat(200),
          manufacturerSummary: 's'.repeat(600),
        },
        sellerId
      );
      expect(result.genuineProduct).toBe(true);
      expect(result.warranty.available).toBe(true);
      expect(result.warranty.duration).toHaveLength(120);
      expect(result.manufacturerConditions.summary).toHaveLength(500);
      expect(result.warrantyAvailable).toBeUndefined();
      expect(result.manufacturerSummary).toBeUndefined();
    });
  });

  describe('convertProductRows', () => {
    it('should convert multiple rows', async () => {
      const categoryId = new mongoose.Types.ObjectId();
      const rows = [
        {
          name: 'Product 1',
          sku: 'SKU-001',
          regularPrice: '100',
          stock: '10',
          category: categoryId.toString()
        },
        {
          name: 'Product 2',
          sku: 'SKU-002',
          regularPrice: '200',
          stock: '20',
          category: categoryId.toString()
        }
      ];

      const result = await convertProductRows(rows, sellerId);
      expect(result).toHaveLength(2);
      expect(result[0].regularPrice).toBe(100);
      expect(result[1].regularPrice).toBe(200);
    });
  });
});

