const mongoose = require('mongoose');
const Category = require('../../models/Category');
const Subcategory = require('../../models/Subcategory');
const ChildCategory = require('../../models/ChildCategory');

describe('Category Model', () => {
  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/ecommerce_test');
    }
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clear taxonomy collections before each test
    await ChildCategory.deleteMany({});
    await Subcategory.deleteMany({});
    await Category.deleteMany({});
  });

  describe('Category Creation', () => {
    it('should create a category with valid data', async () => {
      const categoryData = {
        name: 'Electronics',
        description: 'Electronic devices and gadgets'
      };

      const category = new Category(categoryData);
      const savedCategory = await category.save();

      expect(savedCategory._id).toBeDefined();
      expect(savedCategory.name).toBe(categoryData.name);
      expect(savedCategory.description).toBe(categoryData.description);
      expect(savedCategory.isActive).toBe(true);
      expect(savedCategory.level).toBe(0);
      expect(savedCategory.slug).toBe('electronics');
    });

    it('should not allow duplicate category names', async () => {
      const categoryData = {
        name: 'Electronics',
        description: 'Electronic devices and gadgets'
      };

      // Create first category
      const category1 = new Category(categoryData);
      await category1.save();

      // Try to create second category with same name
      const category2 = new Category(categoryData);
      
      await expect(category2.save()).rejects.toThrow();
    });

    it('should generate unique slug from name', async () => {
      const categoryData = {
        name: 'Home & Garden',
        description: 'Home and garden products'
      };

      const category = new Category(categoryData);
      const savedCategory = await category.save();

      expect(savedCategory.slug).toBe('home-garden');
    });

    it('should validate category name format', async () => {
      const invalidCategoryData = {
        name: 'Electronics@#$',
        description: 'Invalid characters in name'
      };

      const category = new Category(invalidCategoryData);
      
      await expect(category.save()).rejects.toThrow();
    });

    it('should validate category name length', async () => {
      const shortNameData = {
        name: 'A',
        description: 'Too short name'
      };

      const category = new Category(shortNameData);
      
      await expect(category.save()).rejects.toThrow();
    });

    it('should validate image file extension', async () => {
      const categoryData = {
        name: 'Electronics',
        description: 'Electronic devices',
        image: 'invalid-file.txt'
      };

      const category = new Category(categoryData);
      
      await expect(category.save()).rejects.toThrow();
    });

    it('should accept optional title and faq fields', async () => {
      const categoryData = {
        name: 'Electronics',
        title: 'Shop Electronics',
        faq: [
          { question: 'What is covered?', answer: 'All electronic devices.' }
        ]
      };

      const savedCategory = await new Category(categoryData).save();

      expect(savedCategory.title).toBe(categoryData.title);
      expect(savedCategory.faq).toHaveLength(1);
      expect(savedCategory.faq[0].question).toBe(categoryData.faq[0].question);
      expect(savedCategory.faq[0].answer).toBe(categoryData.faq[0].answer);
    });

    it('should accept long-form description without 500 character limit', async () => {
      const longDescription = 'a'.repeat(600);
      const categoryData = {
        name: 'Electronics',
        description: longDescription
      };

      const savedCategory = await new Category(categoryData).save();

      expect(savedCategory.description).toBe(longDescription);
    });

    it('should save legacy category when updating existing fields without new optional fields', async () => {
      const category = await Category.create({
        name: 'Electronics',
        taxRate: 5,
        taxType: 'GST',
        showInMegaMenu: false
      });

      category.taxRate = 18;
      category.showInMegaMenu = true;
      category.commissionRate = 12;
      const savedCategory = await category.save();

      expect(savedCategory.taxRate).toBe(18);
      expect(savedCategory.showInMegaMenu).toBe(true);
      expect(savedCategory.commissionRate).toBe(12);
      expect(savedCategory.title).toBeUndefined();
      expect(savedCategory.faq).toEqual([]);
    });
  });

  describe('Category Methods', () => {
    let category;

    beforeEach(async () => {
      category = new Category({
        name: 'Electronics',
        description: 'Electronic devices'
      });
      await category.save();
    });

    it('should deactivate category', async () => {
      await category.deactivate();
      expect(category.isActive).toBe(false);
    });

    it('should activate category', async () => {
      category.isActive = false;
      await category.activate();
      expect(category.isActive).toBe(true);
    });
  });

  describe('Category Static Methods', () => {
    beforeEach(async () => {
      // Create test categories
      await Category.create([
        { name: 'Electronics', isActive: true, sortOrder: 1 },
        { name: 'Clothing', isActive: true, sortOrder: 2 },
        { name: 'Books', isActive: false, sortOrder: 3 }
      ]);
    });

    it('should find only active categories', async () => {
      const activeCategories = await Category.findActive();
      expect(activeCategories).toHaveLength(2);
      expect(activeCategories.every(cat => cat.isActive)).toBe(true);
    });

    it('should find root categories', async () => {
      const rootCategories = await Category.findRootCategories();
      expect(rootCategories).toHaveLength(2);
      expect(rootCategories.every(cat => cat.parentCategory === null)).toBe(true);
    });
  });

  describe('Category Virtuals', () => {
    it('should have subcategories virtual', () => {
      const category = new Category({ name: 'Electronics' });
      expect(category.schema.virtuals.subcategories).toBeDefined();
    });

    it('should have productCount virtual', () => {
      const category = new Category({ name: 'Electronics' });
      expect(category.schema.virtuals.productCount).toBeDefined();
    });
  });

  describe('Slug regeneration on name change', () => {
    it('should regenerate category slug when name changes on save', async () => {
      const category = await Category.create({ name: 'Electronics' });
      expect(category.slug).toBe('electronics');

      category.name = 'Home & Garden';
      const updated = await category.save();

      expect(updated.slug).toBe('home-garden');
    });

    it('should keep category slug unchanged when name is not modified', async () => {
      const category = await Category.create({ name: 'Electronics' });
      const originalSlug = category.slug;

      category.description = 'Updated description';
      category.taxRate = 18;
      const updated = await category.save();

      expect(updated.slug).toBe(originalSlug);
    });

    it('should reject duplicate category name on rename', async () => {
      await Category.create({ name: 'Electronics' });
      const clothing = await Category.create({ name: 'Clothing' });

      clothing.name = 'Electronics';
      await expect(clothing.save()).rejects.toThrow();
    });

    it('should regenerate subcategory slug when name changes on save', async () => {
      const category = await Category.create({ name: 'Electronics' });
      const subcategory = await Subcategory.create({ name: 'Mobile Phones', category: category._id });
      expect(subcategory.slug).toBe('mobile-phones');

      subcategory.name = 'Smart Phones';
      const updated = await subcategory.save();

      expect(updated.slug).toBe('smart-phones');
    });

    it('should keep subcategory slug unchanged when name is not modified', async () => {
      const category = await Category.create({ name: 'Electronics' });
      const subcategory = await Subcategory.create({ name: 'Mobile Phones', category: category._id });
      const originalSlug = subcategory.slug;

      subcategory.taxRate = 12;
      const updated = await subcategory.save();

      expect(updated.slug).toBe(originalSlug);
    });

    it('should reject duplicate subcategory slug within the same category on rename', async () => {
      const category = await Category.create({ name: 'Electronics' });
      await Subcategory.create({ name: 'Phones', category: category._id });
      const tablets = await Subcategory.create({ name: 'Tablets', category: category._id });

      tablets.name = 'Phones';
      await expect(tablets.save()).rejects.toThrow();
    });

    it('should allow same subcategory slug under different parent categories', async () => {
      const electronics = await Category.create({ name: 'Electronics' });
      const home = await Category.create({ name: 'Home' });
      const sub1 = await Subcategory.create({ name: 'Accessories', category: electronics._id });
      const sub2 = await Subcategory.create({ name: 'Accessories', category: home._id });

      expect(sub1.slug).toBe('accessories');
      expect(sub2.slug).toBe('accessories');
    });

    it('should regenerate child category slug when name changes on save', async () => {
      const category = await Category.create({ name: 'Electronics' });
      const subcategory = await Subcategory.create({ name: 'Phones', category: category._id });
      const child = await ChildCategory.create({ name: 'Android Phones', subcategory: subcategory._id });
      expect(child.slug).toBe('android-phones');

      child.name = 'Google Pixel';
      const updated = await child.save();

      expect(updated.slug).toBe('google-pixel');
    });

    it('should keep child category slug unchanged when name is not modified', async () => {
      const category = await Category.create({ name: 'Electronics' });
      const subcategory = await Subcategory.create({ name: 'Phones', category: category._id });
      const child = await ChildCategory.create({ name: 'Android Phones', subcategory: subcategory._id });
      const originalSlug = child.slug;

      child.taxRate = 5;
      const updated = await child.save();

      expect(updated.slug).toBe(originalSlug);
    });

    it('should reject duplicate child category slug within the same subcategory on rename', async () => {
      const category = await Category.create({ name: 'Electronics' });
      const subcategory = await Subcategory.create({ name: 'Phones', category: category._id });
      await ChildCategory.create({ name: 'Android', subcategory: subcategory._id });
      const ios = await ChildCategory.create({ name: 'iOS', subcategory: subcategory._id });

      ios.name = 'Android';
      await expect(ios.save()).rejects.toThrow();
    });

    it('should preserve category _id when slug changes on rename', async () => {
      const category = await Category.create({ name: 'Electronics' });
      const originalId = category._id.toString();

      category.name = 'Consumer Electronics';
      const updated = await category.save();

      expect(updated._id.toString()).toBe(originalId);
      expect(updated.slug).toBe('consumer-electronics');
    });
  });

  describe('Subcategory optional content fields', () => {
    let category;

    beforeEach(async () => {
      category = await Category.create({ name: 'Electronics' });
    });

    it('should accept optional image, title, description, and faq', async () => {
      const longDescription = 'b'.repeat(600);
      const subcategoryData = {
        name: 'Phones',
        category: category._id,
        image: 'phones-banner.webp',
        title: 'Mobile Phones',
        description: longDescription,
        faq: [{ question: 'Warranty?', answer: 'One year standard.' }]
      };

      const savedSubcategory = await new Subcategory(subcategoryData).save();

      expect(savedSubcategory.image).toBe(subcategoryData.image);
      expect(savedSubcategory.title).toBe(subcategoryData.title);
      expect(savedSubcategory.description).toBe(longDescription);
      expect(savedSubcategory.faq).toHaveLength(1);
    });

    it('should validate subcategory image file extension', async () => {
      const subcategory = new Subcategory({
        name: 'Phones',
        category: category._id,
        image: 'invalid-file.txt'
      });

      await expect(subcategory.save()).rejects.toThrow();
    });
  });

  describe('ChildCategory optional content fields', () => {
    let subcategory;

    beforeEach(async () => {
      const category = await Category.create({ name: 'Electronics' });
      subcategory = await Subcategory.create({ name: 'Phones', category: category._id });
    });

    it('should accept optional image, title, description, and faq', async () => {
      const longDescription = 'c'.repeat(600);
      const childCategoryData = {
        name: 'Android',
        subcategory: subcategory._id,
        image: 'android-phones.png',
        title: 'Android Devices',
        description: longDescription,
        faq: [{ question: 'Updates?', answer: 'Varies by manufacturer.' }]
      };

      const savedChildCategory = await new ChildCategory(childCategoryData).save();

      expect(savedChildCategory.image).toBe(childCategoryData.image);
      expect(savedChildCategory.title).toBe(childCategoryData.title);
      expect(savedChildCategory.description).toBe(longDescription);
      expect(savedChildCategory.faq).toHaveLength(1);
    });

    it('should validate child category image file extension', async () => {
      const childCategory = new ChildCategory({
        name: 'Android',
        subcategory: subcategory._id,
        image: 'invalid-file.txt'
      });

      await expect(childCategory.save()).rejects.toThrow();
    });
  });
});
