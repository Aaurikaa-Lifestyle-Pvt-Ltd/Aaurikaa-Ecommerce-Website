/**
 * Objective 4.9 – Public product routes: featured, bulk-by-ids, limit bounds, sort=sales
 * Extended for Phase 2 entity-aware `q` on GET /api/products and /api/products/search
 */
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Product = require('../../models/Product');
const Category = require('../../models/Category');
const Brand = require('../../models/brand');
const app = require('../helpers/testApp');

describe('Public Products API – Objective 4.9', () => {
  let mongoServer;

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  }, 60000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  beforeEach(async () => {
    await Product.deleteMany({});
    await Category.deleteMany({});
    await Brand.deleteMany({});
  });

  describe('GET /api/products?featured=true', () => {
    it('returns only featured products', async () => {
      await Product.create([
        { name: 'F1', sku: 'sku-f1', regularPrice: 100, isFeatured: true, status: 'published', approvalStatus: 'approved' },
        { name: 'F2', sku: 'sku-f2', regularPrice: 200, isFeatured: true, status: 'published', approvalStatus: 'approved' },
        { name: 'N1', sku: 'sku-n1', regularPrice: 300, isFeatured: false, status: 'published', approvalStatus: 'approved' },
      ]);
      const res = await request(app).get('/api/products?featured=true');
      expect(res.status).toBe(200);
      expect(res.body.products).toHaveLength(2);
      expect(res.body.products.every((p) => p.isFeatured === true)).toBe(true);
    });

    it('uses default limit 10 when featured=true and limit unspecified', async () => {
      const docs = Array.from({ length: 15 }, (_, i) => ({
        name: `F${i}`,
        sku: `sku-f${i}`,
        regularPrice: 100,
        isFeatured: true,
        status: 'published',
        approvalStatus: 'approved',
      }));
      await Product.create(docs);
      const res = await request(app).get('/api/products?featured=true');
      expect(res.status).toBe(200);
      expect(res.body.products.length).toBeLessThanOrEqual(10);
    });

    it('enforces max limit 20 for featured', async () => {
      const docs = Array.from({ length: 25 }, (_, i) => ({
        name: `F${i}`,
        sku: `sku-f${i}`,
        regularPrice: 100,
        isFeatured: true,
        status: 'published',
        approvalStatus: 'approved',
      }));
      await Product.create(docs);
      const res = await request(app).get('/api/products?featured=true&limit=50');
      expect(res.status).toBe(200);
      expect(res.body.products.length).toBeLessThanOrEqual(20);
    });

    it('returns empty array when no featured products', async () => {
      await Product.create({ name: 'N', sku: 'sku-n', regularPrice: 100, isFeatured: false, status: 'published', approvalStatus: 'approved' });
      const res = await request(app).get('/api/products?featured=true');
      expect(res.status).toBe(200);
      expect(res.body.products).toEqual([]);
    });
  });

  describe('POST /api/products/bulk-by-ids', () => {
    it('returns products in same order as ids', async () => {
      const [p1, p2, p3] = await Product.create([
        { name: 'A', sku: 's1', regularPrice: 1, status: 'published', approvalStatus: 'approved' },
        { name: 'B', sku: 's2', regularPrice: 2, status: 'published', approvalStatus: 'approved' },
        { name: 'C', sku: 's3', regularPrice: 3, status: 'published', approvalStatus: 'approved' },
      ]);
      const ids = [p2._id.toString(), p1._id.toString(), p3._id.toString()];
      const res = await request(app).post('/api/products/bulk-by-ids').send({ ids }).set('Content-Type', 'application/json');
      expect(res.status).toBe(200);
      expect(res.body.products).toHaveLength(3);
      expect(res.body.products[0].name).toBe('B');
      expect(res.body.products[1].name).toBe('A');
      expect(res.body.products[2].name).toBe('C');
    });

    it('validates max 12 ids', async () => {
      const docs = await Product.create(
        Array.from({ length: 14 }, (_, i) => ({
          name: `P${i}`,
          sku: `sku-${i}`,
          regularPrice: 100,
          status: 'published',
          approvalStatus: 'approved',
        }))
      );
      const ids = docs.map((d) => d._id.toString());
      const res = await request(app).post('/api/products/bulk-by-ids').send({ ids }).set('Content-Type', 'application/json');
      expect(res.status).toBe(200);
      expect(res.body.products.length).toBeLessThanOrEqual(12);
    });

    it('returns empty when ids empty or invalid', async () => {
      const res = await request(app).post('/api/products/bulk-by-ids').send({ ids: [] }).set('Content-Type', 'application/json');
      expect(res.status).toBe(200);
      expect(res.body.products).toEqual([]);
    });

    it('returns unique products when duplicate ids sent', async () => {
      const [p1, p2] = await Product.create([
        { name: 'A', sku: 's1', regularPrice: 1, status: 'published', approvalStatus: 'approved' },
        { name: 'B', sku: 's2', regularPrice: 2, status: 'published', approvalStatus: 'approved' },
      ]);
      const ids = [p1._id.toString(), p2._id.toString(), p1._id.toString(), p1._id.toString()];
      const res = await request(app).post('/api/products/bulk-by-ids').send({ ids }).set('Content-Type', 'application/json');
      expect(res.status).toBe(200);
      expect(res.body.products).toHaveLength(2);
      const names = res.body.products.map((p) => p.name);
      expect(names).toContain('A');
      expect(names).toContain('B');
    });
  });

  describe('GET /api/products?sortBy=sales', () => {
    it('sorts by salesCount descending and applies limit', async () => {
      await Product.create([
        { name: 'P1', sku: 's1', regularPrice: 100, salesCount: 5, status: 'published', approvalStatus: 'approved' },
        { name: 'P2', sku: 's2', regularPrice: 100, salesCount: 20, status: 'published', approvalStatus: 'approved' },
        { name: 'P3', sku: 's3', regularPrice: 100, salesCount: 10, status: 'published', approvalStatus: 'approved' },
      ]);
      const res = await request(app).get('/api/products?sortBy=sales&limit=12');
      expect(res.status).toBe(200);
      expect(res.body.products[0].name).toBe('P2');
      expect(res.body.products[1].name).toBe('P3');
      expect(res.body.products[2].name).toBe('P1');
    });

    it('enforces limit bounds for sales query', async () => {
      await Product.create(
        Array.from({ length: 25 }, (_, i) => ({
          name: `P${i}`,
          sku: `sku-${i}`,
          regularPrice: 100,
          salesCount: i,
          status: 'published',
          approvalStatus: 'approved',
        }))
      );
      const res = await request(app).get('/api/products?sortBy=sales&limit=100');
      expect(res.status).toBe(200);
      expect(res.body.products.length).toBeLessThanOrEqual(20);
    });
  });

  describe('GET /api/products?q= (entity-aware search)', () => {
    it('returns products matching brand entity when name does not contain q', async () => {
      const brand = await Brand.create({ name: 'Samsung', isActive: true });
      await Product.create([
        {
          name: 'Wireless Earbuds',
          sku: 'obj49-ear-1',
          regularPrice: 1500,
          status: 'published',
          approvalStatus: 'approved',
          brand: brand._id,
        },
        {
          name: 'Office Chair',
          sku: 'obj49-chair-1',
          regularPrice: 2000,
          status: 'published',
          approvalStatus: 'approved',
        },
      ]);

      const res = await request(app).get('/api/products').query({ q: 'Samsung' });
      expect(res.status).toBe(200);
      expect(res.body.products.map((p) => p.name)).toContain('Wireless Earbuds');
      expect(res.body.products.map((p) => p.name)).not.toContain('Office Chair');
      expect(res.body).toEqual(
        expect.objectContaining({
          totalCount: expect.any(Number),
          totalPages: expect.any(Number),
          currentPage: expect.any(Number),
        })
      );
    });

    it('returns products matching category entity', async () => {
      const category = await Category.create({ name: 'Electronics', isActive: true });
      await Product.create([
        {
          name: 'USB Cable',
          sku: 'obj49-usb-1',
          regularPrice: 200,
          status: 'published',
          approvalStatus: 'approved',
          category: category._id,
        },
        {
          name: 'Sofa',
          sku: 'obj49-sofa-1',
          regularPrice: 8000,
          status: 'published',
          approvalStatus: 'approved',
        },
      ]);

      const res = await request(app).get('/api/products').query({ q: 'Electronics' });
      expect(res.status).toBe(200);
      expect(res.body.products.map((p) => p.name)).toEqual(['USB Cable']);
    });

    it('returns products matching tag within q', async () => {
      await Product.create({
        name: 'Yoga Mat',
        sku: 'obj49-yoga-1',
        regularPrice: 800,
        status: 'published',
        approvalStatus: 'approved',
        tags: ['fitness', 'yoga'],
      });

      const res = await request(app).get('/api/products').query({ q: 'fitness' });
      expect(res.status).toBe(200);
      expect(res.body.products.map((p) => p.name)).toEqual(['Yoga Mat']);
    });

    it('AND-combines q with explicit brand ObjectId filter', async () => {
      const brandA = await Brand.create({ name: 'Apple', isActive: true });
      const brandB = await Brand.create({ name: 'Sony', isActive: true });
      const category = await Category.create({ name: 'Gadgets', isActive: true });
      await Product.create([
        {
          name: 'Phone A',
          sku: 'obj49-phone-a',
          regularPrice: 1000,
          status: 'published',
          approvalStatus: 'approved',
          brand: brandA._id,
          category: category._id,
        },
        {
          name: 'Phone B',
          sku: 'obj49-phone-b',
          regularPrice: 1000,
          status: 'published',
          approvalStatus: 'approved',
          brand: brandB._id,
          category: category._id,
        },
      ]);

      const res = await request(app)
        .get('/api/products')
        .query({ q: 'Gadgets', brand: String(brandA._id) });
      expect(res.status).toBe(200);
      expect(res.body.products.map((p) => p.name)).toEqual(['Phone A']);
    });

    it('preserves listing without q (default catalog)', async () => {
      await Product.create({
        name: 'Plain Product',
        sku: 'obj49-plain-1',
        regularPrice: 50,
        status: 'published',
        approvalStatus: 'approved',
      });
      const res = await request(app).get('/api/products');
      expect(res.status).toBe(200);
      expect(res.body.products.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/products/search?q=', () => {
    it('returns flat product array for legacy autocomplete', async () => {
      const brand = await Brand.create({ name: 'Logitech', isActive: true });
      await Product.create({
        name: 'Wireless Mouse',
        sku: 'obj49-mouse-1',
        regularPrice: 500,
        status: 'published',
        approvalStatus: 'approved',
        brand: brand._id,
      });

      const res = await request(app).get('/api/products/search').query({ q: 'Logitech' });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0]).toEqual(
        expect.objectContaining({ name: 'Wireless Mouse', slug: expect.any(String) })
      );
    });

    it('returns empty array when q is missing', async () => {
      const res = await request(app).get('/api/products/search');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('handles regex metacharacters in q safely', async () => {
      const res = await request(app).get('/api/products/search').query({ q: 'Log.+' });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
