// backend/tests/utils/bulkUploadValidator.test.js
const mongoose = require('mongoose');
const {
  validateRequiredFields,
  validateSkuUniqueness,
  validatePrice,
  validateStock,
  validateObjectId,
  validateProductRow,
  validateProductRows
} = require('../../utils/bulkUploadValidator');
const Product = require('../../models/Product');
const Category = require('../../models/Category');
const Subcategory = require('../../models/Subcategory');
const ChildCategory = require('../../models/ChildCategory');
const Brand = require('../../models/brand');
const Seller = require('../../models/Seller');

describe('Bulk Upload Validator', () => {
  let seller;
  let category;
  let subcategory;
  let childCategory;
  let brand;
  let sellerId;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test-bulk-validator');
    }

    // Create test seller
    seller = await Seller.create({
      firstName: 'Test',
      lastName: 'Seller',
      username: `validatortest-${Date.now()}`,
      email: `validatortest-${Date.now()}@example.com`,
      password: 'hashedpassword',
      phone: '1234567890',
      shopName: 'Test Shop',
      shopUrl: `https://validator-${Date.now()}.example.test`,
      isApproved: true
    });
    sellerId = seller._id.toString();

    // Create test category
    category = await Category.create({
      name: 'Test Category',
      slug: 'test-category',
      description: 'Test category'
    });

    // Create test subcategory
    subcategory = await Subcategory.create({
      name: 'Test Subcategory',
      slug: 'test-subcategory',
      category: category._id
    });

    // Create test child category
    childCategory = await ChildCategory.create({
      name: 'Test Child Category',
      slug: 'test-child-category',
      subcategory: subcategory._id
    });

    // Create test brand
    brand = await Brand.create({
      name: 'Test Brand',
      slug: 'test-brand'
    });
  });

  afterAll(async () => {
    await Product.deleteMany({});
    await Seller.deleteMany({});
    await Category.deleteMany({});
    await Subcategory.deleteMany({});
    await ChildCategory.deleteMany({});
    await Brand.deleteMany({});
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  });

  beforeEach(async () => {
    await Product.deleteMany({});
  });

  describe('validateRequiredFields', () => {
    it('should return valid for complete row', () => {
      const row = {
        name: 'Test Product',
        sku: 'SKU-001',
        regularPrice: '100',
        stock: '10',
        category: category._id.toString()
      };
      const result = validateRequiredFields(row, 0);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for missing required fields', () => {
      const row = {
        name: 'Test Product',
        // Missing sku, regularPrice, stock, category
      };
      const result = validateRequiredFields(row, 0);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.includes('Regular price'))).toBe(true);
      expect(result.errors.some(e => e.includes('Stock'))).toBe(true);
      expect(result.errors.some(e => e.includes('Category'))).toBe(true);
    });

    it('should return errors for empty string fields', () => {
      const row = {
        name: '',
        sku: '',
        regularPrice: '',
        stock: '',
        category: ''
      };
      const result = validateRequiredFields(row, 0);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('validateSkuUniqueness', () => {
    it('should return valid for unique SKU', async () => {
      const result = await validateSkuUniqueness('UNIQUE-SKU-001', sellerId, []);
      expect(result.isValid).toBe(true);
    });

    it('should return error for duplicate SKU in batch', async () => {
      const result = await validateSkuUniqueness('DUPLICATE-SKU', sellerId, ['DUPLICATE-SKU']);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('duplicated in the upload file');
    });

    it('should return error for existing SKU in database', async () => {
      await Product.create({
        name: 'Existing Product',
        sku: 'EXISTING-SKU',
        regularPrice: 100,
        stock: 10,
        category: category._id,
        seller: sellerId
      });

      const result = await validateSkuUniqueness('EXISTING-SKU', sellerId, []);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('already exists in the database');
    });

    it('allows an existing catalog SKU when upserting', async () => {
      await Product.create({
        name: 'Existing Product',
        sku: 'UPSERT-SKU',
        regularPrice: 100,
        stock: 10,
        category: category._id,
        seller: sellerId
      });

      const blocked = await validateSkuUniqueness('UPSERT-SKU', sellerId, []);
      expect(blocked.isValid).toBe(false);

      const allowed = await validateSkuUniqueness('UPSERT-SKU', sellerId, [], { allowExistingSku: true });
      expect(allowed.isValid).toBe(true);
    });
  });

  describe('validatePrice', () => {
    it('should return valid for positive number', () => {
      const result = validatePrice(100, 'Regular price');
      expect(result.isValid).toBe(true);
      expect(result.value).toBe(100);
    });

    it('should return valid for positive string number', () => {
      const result = validatePrice('100.50', 'Regular price');
      expect(result.isValid).toBe(true);
      expect(result.value).toBe(100.50);
    });

    it('should return error for zero', () => {
      const result = validatePrice(0, 'Regular price');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('greater than 0');
    });

    it('should return error for negative number', () => {
      const result = validatePrice(-10, 'Regular price');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('greater than 0');
    });

    it('should return error for invalid string', () => {
      const result = validatePrice('invalid', 'Regular price');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('valid number');
    });
  });

  describe('validateStock', () => {
    it('should return valid for positive number', () => {
      const result = validateStock(10);
      expect(result.isValid).toBe(true);
      expect(result.value).toBe(10);
    });

    it('should return valid for zero', () => {
      const result = validateStock(0);
      expect(result.isValid).toBe(true);
      expect(result.value).toBe(0);
    });

    it('should return error for negative number', () => {
      const result = validateStock(-10);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('cannot be negative');
    });

    it('should return error for invalid string', () => {
      const result = validateStock('invalid');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('valid number');
    });
  });

  describe('validateObjectId', () => {
    it('should return valid for existing ObjectId', async () => {
      const result = await validateObjectId(category._id.toString(), Category, 'Category');
      expect(result.isValid).toBe(true);
    });

    it('should return valid for optional empty field', async () => {
      const result = await validateObjectId('', Category, 'Category');
      expect(result.isValid).toBe(true);
    });

    it('should return error for invalid ObjectId format', async () => {
      const result = await validateObjectId('invalid-id', Category, 'Category');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('valid ObjectId');
    });

    it('should return error for non-existent ObjectId', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const result = await validateObjectId(fakeId.toString(), Category, 'Category');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('does not exist');
    });
  });

  describe('validateProductRow', () => {
    it('should return valid for complete valid row', async () => {
      const row = {
        name: 'Test Product',
        sku: 'VALID-SKU-001',
        regularPrice: '100',
        salePrice: '80',
        stock: '10',
        category: category._id.toString(),
        subcategory: subcategory._id.toString(),
        brand: brand._id.toString()
      };
      const result = await validateProductRow(row, 0, sellerId, []);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.row.regularPrice).toBe(100);
      expect(result.row.salePrice).toBe(80);
      expect(result.row.stock).toBe(10);
    });

    it('should return errors for invalid row', async () => {
      const row = {
        name: '',
        sku: '',
        regularPrice: '0',
        stock: '-10',
        category: 'invalid-id'
      };
      const result = await validateProductRow(row, 0, sellerId, []);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('validateProductRows', () => {
    it('should return valid for all valid rows', async () => {
      const rows = [
        {
          name: 'Product 1',
          sku: 'SKU-001',
          regularPrice: '100',
          stock: '10',
          category: category._id.toString()
        },
        {
          name: 'Product 2',
          sku: 'SKU-002',
          regularPrice: '200',
          stock: '20',
          category: category._id.toString()
        }
      ];
      const result = await validateProductRows(rows, sellerId);
      expect(result.isValid).toBe(true);
      expect(result.validRows).toHaveLength(2);
      expect(result.invalidRows).toHaveLength(0);
      expect(result.summary.total).toBe(2);
      expect(result.summary.valid).toBe(2);
      expect(result.summary.invalid).toBe(0);
    });

    it('should return invalid for rows with errors', async () => {
      const rows = [
        {
          name: 'Product 1',
          sku: 'SKU-001',
          regularPrice: '100',
          stock: '10',
          category: category._id.toString()
        },
        {
          name: '',
          sku: '',
          regularPrice: '0',
          stock: '-10',
          category: 'invalid-id'
        }
      ];
      const result = await validateProductRows(rows, sellerId);
      expect(result.isValid).toBe(false);
      expect(result.validRows).toHaveLength(1);
      expect(result.invalidRows).toHaveLength(1);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect duplicate SKUs in batch', async () => {
      const rows = [
        {
          name: 'Product 1',
          sku: 'DUPLICATE-SKU',
          regularPrice: '100',
          stock: '10',
          category: category._id.toString()
        },
        {
          name: 'Product 2',
          sku: 'DUPLICATE-SKU',
          regularPrice: '200',
          stock: '20',
          category: category._id.toString()
        }
      ];
      const result = await validateProductRows(rows, sellerId);
      expect(result.isValid).toBe(false);
      expect(result.validRows).toHaveLength(1);
      expect(result.invalidRows).toHaveLength(1);
      expect(result.errors.some(e => e.includes('duplicated'))).toBe(true);
    });
  });
});

