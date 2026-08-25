/**
 * Admin inventory list — Product.stock / variantStock thin adapter.
 */
jest.mock('../../middleware/verifyAdmin', () => (req, res, next) => {
  req.user = { _id: 'admin-test-id', role: 'admin' };
  next();
});

jest.mock('../../middleware/loadAdminContext', () => (req, res, next) => {
  req.adminUser = { isSuperAdmin: true, permissions: [] };
  next();
});

const request = require('supertest');
const mongoose = require('mongoose');
const Product = require('../../models/Product');
const app = require('../helpers/testApp');
const {
  summarizeVariantStock,
  effectiveStock,
  matchesStockFilter,
} = require('../../controllers/admin/inventoryController');

describe('Admin inventory list', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(
        process.env.MONGODB_TEST_URI ||
          process.env.MONGODB_URI ||
          'mongodb://localhost:27017/ecommerce_test_db'
      );
    }
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await Product.deleteMany({});
  });

  it('summarizes variantStock and effective stock', () => {
    expect(summarizeVariantStock({ 'size:m': 2, 'size:l': 3 })).toEqual({
      keys: 2,
      total: 5,
      entries: [
        { key: 'size:m', stock: 2 },
        { key: 'size:l', stock: 3 },
      ],
    });
    expect(effectiveStock({ stock: 10, variantStock: { a: 1, b: 2 } })).toBe(3);
    expect(effectiveStock({ stock: 7, variantStock: {} })).toBe(7);
    expect(matchesStockFilter(0, 'out')).toBe(true);
    expect(matchesStockFilter(3, 'low')).toBe(true);
    expect(matchesStockFilter(6, 'low')).toBe(false);
    expect(matchesStockFilter(1, 'in_stock')).toBe(true);
  });

  it('GET /api/admin/inventory returns product stock fields with pagination', async () => {
    await Product.create([
      {
        name: 'Gold Ring',
        sku: 'INV-RING-1',
        regularPrice: 1000,
        stock: 5,
        status: 'published',
        approvalStatus: 'approved',
        variantStock: { 'size:6': 2, 'size:7': 3 },
      },
      {
        name: 'Silver Chain',
        sku: 'INV-CHAIN-1',
        regularPrice: 500,
        stock: 1,
        status: 'draft',
      },
      {
        name: 'Trashed',
        sku: 'INV-TRASH-1',
        regularPrice: 1,
        stock: 0,
        status: 'trash',
      },
    ]);

    const res = await request(app).get('/api/admin/inventory');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.count).toBe(2);
    expect(res.body.data.pagination).toMatchObject({
      page: 1,
      limit: 25,
      total: 2,
      pages: 1,
    });
    const ring = res.body.data.products.find((p) => p.sku === 'INV-RING-1');
    expect(ring).toMatchObject({
      name: 'Gold Ring',
      sku: 'INV-RING-1',
      stock: 5,
      stockEffective: 5,
      status: 'published',
      approvalStatus: 'approved',
    });
    expect(ring.variantStockSummary.keys).toBe(2);
    expect(ring.variantStockSummary.total).toBe(5);
  });

  it('supports q/search, status, stock enum, and lowStock filters', async () => {
    await Product.create([
      {
        name: 'Low Stock Pendant',
        sku: 'LOW-1',
        regularPrice: 100,
        stock: 2,
        status: 'published',
        approvalStatus: 'approved',
      },
      {
        name: 'Plenty Bracelet',
        sku: 'OK-1',
        regularPrice: 100,
        stock: 50,
        status: 'published',
        approvalStatus: 'approved',
      },
      {
        name: 'Out of Stock Brooch',
        sku: 'OUT-1',
        regularPrice: 100,
        stock: 0,
        status: 'published',
        approvalStatus: 'approved',
      },
      {
        name: 'Draft Only',
        sku: 'DR-1',
        regularPrice: 100,
        stock: 0,
        status: 'draft',
      },
    ]);

    const byQ = await request(app).get('/api/admin/inventory?q=Pendant');
    expect(byQ.body.data.pagination.total).toBe(1);
    expect(byQ.body.data.products[0].sku).toBe('LOW-1');

    const bySearch = await request(app).get('/api/admin/inventory?search=Bracelet');
    expect(bySearch.body.data.pagination.total).toBe(1);
    expect(bySearch.body.data.products[0].sku).toBe('OK-1');

    const byStatus = await request(app).get('/api/admin/inventory?status=draft');
    expect(byStatus.body.data.pagination.total).toBe(1);
    expect(byStatus.body.data.products[0].sku).toBe('DR-1');

    const low = await request(app).get('/api/admin/inventory?lowStock=5&status=published');
    expect(low.body.data.lowStockThreshold).toBe(5);
    expect(low.body.data.products.map((p) => p.sku).sort()).toEqual(['LOW-1', 'OUT-1']);

    const stockLow = await request(app).get('/api/admin/inventory?stock=low&status=published');
    expect(stockLow.body.data.products.map((p) => p.sku)).toEqual(['LOW-1']);

    const stockOut = await request(app).get('/api/admin/inventory?stock=out&status=published');
    expect(stockOut.body.data.products.map((p) => p.sku)).toEqual(['OUT-1']);

    const stockIn = await request(app).get('/api/admin/inventory?stock=in_stock&status=published');
    expect(stockIn.body.data.products.map((p) => p.sku).sort()).toEqual(['LOW-1', 'OK-1']);
  });

  it('applies stock filter before pagination', async () => {
    const docs = [];
    for (let i = 1; i <= 6; i += 1) {
      docs.push({
        name: `Item ${i}`,
        sku: `PAG-${i}`,
        regularPrice: 10,
        stock: i <= 3 ? 0 : 10,
        status: 'published',
        approvalStatus: 'approved',
      });
    }
    await Product.create(docs);

    const res = await request(app).get('/api/admin/inventory?stock=out&page=1&limit=2&status=published');
    expect(res.status).toBe(200);
    expect(res.body.data.pagination).toMatchObject({
      page: 1,
      limit: 2,
      total: 3,
      pages: 2,
    });
    expect(res.body.data.count).toBe(2);
    expect(res.body.data.products).toHaveLength(2);
    expect(res.body.data.products.every((p) => p.stockEffective === 0)).toBe(true);

    const page2 = await request(app).get('/api/admin/inventory?stock=out&page=2&limit=2&status=published');
    expect(page2.body.data.count).toBe(1);
    expect(page2.body.data.pagination.total).toBe(3);
  });
});
