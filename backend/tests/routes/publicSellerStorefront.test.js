/**
 * Public seller storefront API
 */
const request = require('supertest');
const mongoose = require('mongoose');
const Seller = require('../../models/Seller');
const Product = require('../../models/Product');
const app = require('../helpers/testApp');
const { normalizeStorefrontInput } = require('../../utils/sellerStorefront');

describe('Public Seller Storefront API', () => {
  let sellerId;
  const previousMarketplaceFlag = process.env.AAURIKAA_ENABLE_MARKETPLACE_SURFACES;

  beforeAll(async () => {
    process.env.AAURIKAA_ENABLE_MARKETPLACE_SURFACES = 'true';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(
        process.env.MONGODB_TEST_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/ecommerce_test_db'
      );
    }
  });

  afterAll(async () => {
    if (previousMarketplaceFlag === undefined) {
      delete process.env.AAURIKAA_ENABLE_MARKETPLACE_SURFACES;
    } else {
      process.env.AAURIKAA_ENABLE_MARKETPLACE_SURFACES = previousMarketplaceFlag;
    }
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await Product.deleteMany({});
    await Seller.deleteMany({});

    const seller = await Seller.create({
      firstName: 'Hidden',
      lastName: 'Person',
      username: `store-${Date.now()}`,
      email: `store-${Date.now()}@test.com`,
      password: 'hashed',
      shopName: 'Fashion Haven',
      shopUrl: 'fashion-haven',
      isApproved: true,
      avgRating: 4.5,
      reviewCount: 12,
    });
    sellerId = seller._id;

    await Product.create([
      {
        name: 'Store Product 1',
        sku: `sku-sf-1-${Date.now()}`,
        regularPrice: 100,
        seller: sellerId,
        status: 'published',
        approvalStatus: 'approved',
        slug: `store-product-1-${Date.now()}`,
      },
      {
        name: 'Store Product 2',
        sku: `sku-sf-2-${Date.now()}`,
        regularPrice: 200,
        seller: sellerId,
        status: 'published',
        approvalStatus: 'approved',
        slug: `store-product-2-${Date.now()}`,
      },
    ]);
  });

  describe('normalizeStorefrontInput', () => {
    it('lowercases and slugifies', () => {
      expect(normalizeStorefrontInput('Fashion-Haven')).toEqual({
        canonicalSlug: 'fashion-haven',
        canonicalStorefrontPath: '/seller/fashion-haven',
      });
    });

    it('extracts slug from /seller/ path', () => {
      expect(normalizeStorefrontInput('https://anbazar.com/seller/fashion-haven/')).toEqual({
        canonicalSlug: 'fashion-haven',
        canonicalStorefrontPath: '/seller/fashion-haven',
      });
    });
  });

  describe('GET /api/sellers/storefront/:shopUrl', () => {
    it('returns shop and products for canonical slug', async () => {
      const res = await request(app).get('/api/sellers/storefront/fashion-haven');
      expect(res.status).toBe(200);
      expect(res.body.shop.shopName).toBe('Fashion Haven');
      expect(res.body.shop.canonicalStorefrontPath).toBe('/seller/fashion-haven');
      expect(res.body.shop.canonicalSlug).toBe('fashion-haven');
      expect(res.body.products).toHaveLength(2);
      expect(res.body.totalCount).toBe(2);
      expect(res.body.shop.firstName).toBeUndefined();
      expect(res.body.shop.lastName).toBeUndefined();
      expect(res.body.shop.email).toBeUndefined();
      expect(res.body.shop.phone).toBeUndefined();
      expect(res.body.shop._id).toBeUndefined();
    });

    it('resolves case-insensitive route param', async () => {
      const res = await request(app).get('/api/sellers/storefront/Fashion-Haven');
      expect(res.status).toBe(200);
      expect(res.body.shop.canonicalSlug).toBe('fashion-haven');
    });

    it('returns empty products array when seller has no published products', async () => {
      await Product.deleteMany({ seller: sellerId });
      const res = await request(app).get('/api/sellers/storefront/fashion-haven');
      expect(res.status).toBe(200);
      expect(res.body.products).toEqual([]);
      expect(res.body.totalCount).toBe(0);
      expect(res.body.shop.shopName).toBe('Fashion Haven');
    });

    it('returns 404 for unknown store', async () => {
      const res = await request(app).get('/api/sellers/storefront/does-not-exist-xyz');
      expect(res.status).toBe(404);
    });

    it('returns 404 for unapproved seller', async () => {
      await Seller.updateOne({ _id: sellerId }, { isApproved: false });
      const res = await request(app).get('/api/sellers/storefront/fashion-haven');
      expect(res.status).toBe(404);
    });

    it('paginates results', async () => {
      const res = await request(app).get('/api/sellers/storefront/fashion-haven?page=1&limit=1');
      expect(res.status).toBe(200);
      expect(res.body.products).toHaveLength(1);
      expect(res.body.totalPages).toBe(2);
      expect(res.body.currentPage).toBe(1);
    });
  });
});
