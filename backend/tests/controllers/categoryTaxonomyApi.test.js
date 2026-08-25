jest.mock('../../middleware/verifyAdmin', () => (req, res, next) => {
  req.user = { _id: '507f1f77bcf86cd799439099', role: 'admin' };
  next();
});

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../helpers/testApp');
const Category = require('../../models/Category');
const Subcategory = require('../../models/Subcategory');
const ChildCategory = require('../../models/ChildCategory');
const { buildHierarchyRows } = require('../../services/categoryHierarchyListingService');
const { MODEL_TRANSLATABLE_FIELDS } = require('../../routes/admin/translationRoutes');

describe('Category taxonomy API (Phase C)', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(
        process.env.MONGODB_TEST_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/ecommerce_test'
      );
    }
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await ChildCategory.deleteMany({});
    await Subcategory.deleteMany({});
    await Category.deleteMany({});
  });

  describe('Category CRUD with optional content fields', () => {
    it('creates category with title, description, and faq', async () => {
      const response = await request(app)
        .post('/api/categories')
        .send({
          name: 'Electronics',
          title: 'Shop Electronics',
          description: 'Long form category copy',
          faq: JSON.stringify([{ question: 'Warranty?', answer: 'One year.' }]),
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe('Shop Electronics');
      expect(response.body.data.faq).toHaveLength(1);
    });

    it('updates category with new optional fields', async () => {
      const category = await Category.create({ name: 'Electronics' });

      const response = await request(app)
        .put(`/api/categories/${category._id}`)
        .send({
          title: 'Updated Title',
          description: 'Updated description',
          faq: JSON.stringify([{ question: 'Returns?', answer: '30 days.' }]),
        })
        .expect(200);

      expect(response.body.data.title).toBe('Updated Title');
      expect(response.body.data.faq).toHaveLength(1);
    });

    it('supports legacy create/update payloads without new fields', async () => {
      const createResponse = await request(app)
        .post('/api/categories')
        .send({ name: 'Books' })
        .expect(201);

      const categoryId = createResponse.body.data._id;
      const updateResponse = await request(app)
        .put(`/api/categories/${categoryId}`)
        .send({ taxRate: 12 })
        .expect(200);

      expect(updateResponse.body.data.taxRate).toBe(12);
      expect(updateResponse.body.data.title).toBeUndefined();
    });
  });

  describe('Subcategory and child category CRUD', () => {
    let category;
    let subcategory;

    beforeEach(async () => {
      category = await Category.create({ name: 'Electronics' });
      subcategory = await Subcategory.create({ name: 'Phones', category: category._id });
    });

    it('creates and updates subcategory with optional content fields', async () => {
      const createResponse = await request(app)
        .post(`/api/categories/${category._id}/subcategories`)
        .send({
          name: 'Tablets',
          title: 'Tablet Devices',
          description: 'Tablet category copy',
          faq: JSON.stringify([{ question: 'Sizes?', answer: 'Many.' }]),
        })
        .expect(201);

      expect(createResponse.body.subcategory.title).toBe('Tablet Devices');
      expect(createResponse.body.subcategory.faq).toHaveLength(1);

      const subId = createResponse.body.subcategory._id;
      const updateResponse = await request(app)
        .put(`/api/categories/subcategories/${subId}`)
        .send({ title: 'Updated Tablets' })
        .expect(200);

      expect(updateResponse.body.updated.title).toBe('Updated Tablets');
    });

    it('creates and updates child category with optional content fields', async () => {
      const createResponse = await request(app)
        .post(`/api/categories/subcategories/${subcategory._id}/child-categories`)
        .send({
          name: 'Android',
          title: 'Android Phones',
          description: 'Android devices',
          faq: JSON.stringify([{ question: 'Updates?', answer: 'Varies.' }]),
        })
        .expect(201);

      expect(createResponse.body.child.title).toBe('Android Phones');

      const childId = createResponse.body.child._id;
      const updateResponse = await request(app)
        .put(`/api/categories/child-categories/${childId}`)
        .send({ description: 'Updated child description' })
        .expect(200);

      expect(updateResponse.body.updated.description).toBe('Updated child description');
    });
  });

  describe('GET /api/taxonomy/resolve', () => {
    it('returns new content fields for the active taxonomy depth', async () => {
      const category = await Category.create({
        name: 'Electronics',
        title: 'Shop Electronics',
        description: 'Category description',
        faq: [{ question: 'Q1', answer: 'A1' }],
      });
      const sub = await Subcategory.create({
        name: 'Phones',
        category: category._id,
        title: 'Mobile Phones',
        description: 'Sub description',
      });
      await ChildCategory.create({
        name: 'Android',
        subcategory: sub._id,
        title: 'Android Devices',
        description: 'Child description',
        faq: [{ question: 'Q2', answer: 'A2' }],
      });

      const response = await request(app)
        .get('/api/taxonomy/resolve')
        .query({
          categorySlug: category.slug,
          subSlug: sub.slug,
          childSlug: 'android',
        })
        .expect(200);

      expect(response.body.data.childCategory.title).toBe('Android Devices');
      expect(response.body.data.childCategory.description).toBe('Child description');
      expect(response.body.data.childCategory.faq).toHaveLength(1);
      expect(response.body.data.category.title).toBe('Shop Electronics');
    });

    it('returns AAURIKAA SEO defaults and /categories canonical paths', async () => {
      const category = await Category.create({ name: 'Jewellery' });
      const sub = await Subcategory.create({ name: 'Rings', category: category._id });
      const child = await ChildCategory.create({
        name: 'Gold Rings',
        subcategory: sub._id,
      });

      const response = await request(app)
        .get('/api/taxonomy/resolve')
        .query({
          categorySlug: category.slug,
          subSlug: sub.slug,
          childSlug: child.slug,
        })
        .expect(200);

      const { seo, breadcrumbs } = response.body.data;
      expect(seo.title).toContain('AAURIKAA');
      expect(seo.title).not.toMatch(/AnBazar/i);
      expect(seo.metaDescription).toContain('AAURIKAA');
      expect(seo.canonicalPath).toBe(
        `/categories/${category.slug}/${sub.slug}/${child.slug}`
      );
      expect(seo.canonicalPath).not.toMatch(/^\/category\//);
      expect(breadcrumbs[1]).toEqual(
        expect.objectContaining({ type: 'shop', href: '/categories' })
      );
      expect(breadcrumbs.find((b) => b.type === 'category').href).toBe(
        `/categories/${category.slug}`
      );
    });
  });

  describe('GET /api/taxonomy/price-bounds', () => {
    it('returns null bounds when catalogue is empty', async () => {
      const response = await request(app)
        .get('/api/taxonomy/price-bounds')
        .expect(200);

      expect(response.body).toEqual({ minPrice: null, maxPrice: null });
    });
  });

  describe('Hierarchy listing payload', () => {
    it('returns clean Admin hierarchy fields without marketplace residue', () => {
      const cat = {
        _id: '507f1f77bcf86cd799439001',
        name: 'Electronics',
        slug: 'electronics',
        taxRate: 18,
        taxType: 'GST',
        title: 'Shop Electronics',
        description: 'Cat desc',
        faq: [{ question: 'CQ', answer: 'CA' }],
        image: 'cat.jpg',
        isActive: true,
        showInMegaMenu: true,
        megaMenuOrder: 1,
        commissionRate: 5,
      };
      const sub = {
        _id: '507f1f77bcf86cd799439011',
        name: 'Phones',
        slug: 'phones',
        category: cat._id,
        taxRate: 12,
        taxType: 'GST',
        title: 'Mobile Phones',
        description: 'Sub desc',
        faq: [{ question: 'SQ', answer: 'SA' }],
        image: 'sub.jpg',
      };
      const child = {
        _id: '507f1f77bcf86cd799439021',
        name: 'Android',
        slug: 'android',
        subcategory: sub._id,
        taxType: 'VAT',
        title: 'Android Devices',
        description: 'Child desc',
        faq: [{ question: 'ChQ', answer: 'ChA' }],
        image: 'child.jpg',
      };

      const rows = buildHierarchyRows([cat], [sub], [child]);

      expect(rows).toHaveLength(1);
      expect(rows[0].category).toBe('Electronics');
      expect(rows[0].categorySlug).toBe('electronics');
      expect(rows[0].categoryTaxType).toBe('GST');
      expect(rows[0].subcategorySlug).toBe('phones');
      expect(rows[0].subcategoryTaxType).toBe('GST');
      expect(rows[0].childSlug).toBe('android');
      expect(rows[0].childTaxType).toBe('VAT');
      expect(rows[0].subImage).toContain('sub.jpg');
      expect(rows[0].childImage).toContain('child.jpg');
      expect(rows[0].isActive).toBe(true);
      expect(rows[0].categoryTitle).toBeUndefined();
      expect(rows[0].categoryFaq).toBeUndefined();
      expect(rows[0].categoryCommission).toBeUndefined();
      expect(rows[0].showInMegaMenu).toBeUndefined();
    });
  });

  describe('Translation registration', () => {
    it('registers title and description for all taxonomy models', () => {
      expect(MODEL_TRANSLATABLE_FIELDS.Category).toEqual(
        expect.arrayContaining(['name', 'description', 'title'])
      );
      expect(MODEL_TRANSLATABLE_FIELDS.Subcategory).toEqual(
        expect.arrayContaining(['name', 'description', 'title'])
      );
      expect(MODEL_TRANSLATABLE_FIELDS.ChildCategory).toEqual(
        expect.arrayContaining(['name', 'description', 'title'])
      );
    });
  });
});
