/**
 * Ensures catalogue/card product selects expose avgRating + reviewCount.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const app = require('../helpers/testApp');
const Product = require('../../models/Product');
const Seller = require('../../models/Seller');

describe('Product card rating fields on list endpoints', () => {
  let seller;
  let product;

  beforeEach(async () => {
    await Product.deleteMany({});
    await Seller.deleteMany({});

    const t = Date.now();
    seller = await Seller.create({
      firstName: 'Card',
      lastName: 'Seller',
      username: `cardseller${t}`,
      email: `cardseller${t}@test.com`,
      password: await bcrypt.hash('Test123!@#', 10),
      shopName: `Card Shop ${t}`,
      shopUrl: `card-shop-${t}`,
      role: 'seller',
      isApproved: true,
    });

    product = await Product.create({
      name: 'Rated Product',
      sku: `RATED-${t}`,
      seller: seller._id,
      regularPrice: 200,
      salePrice: 180,
      stock: 5,
      status: 'published',
      approvalStatus: 'approved',
      avgRating: 4.5,
      reviewCount: 12,
      slug: `rated-product-${t}`,
    });
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  it('GET /api/products/by-skus includes avgRating and reviewCount', async () => {
    const res = await request(app).get(`/api/products/by-skus?skus=${product.sku}`);
    expect(res.status).toBe(200);
    expect(res.body.products.length).toBe(1);
    expect(res.body.products[0].avgRating).toBe(4.5);
    expect(res.body.products[0].reviewCount).toBe(12);
  });

  it('GET /api/products/by-seller/:sellerId includes avgRating and reviewCount', async () => {
    const res = await request(app).get(`/api/products/by-seller/${seller._id.toString()}`);
    expect(res.status).toBe(200);
    expect(res.body.products.length).toBe(1);
    expect(res.body.products[0].avgRating).toBe(4.5);
    expect(res.body.products[0].reviewCount).toBe(12);
  });
});
