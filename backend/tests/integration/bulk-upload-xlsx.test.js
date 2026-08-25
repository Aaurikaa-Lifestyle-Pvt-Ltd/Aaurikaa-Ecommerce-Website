// backend/tests/integration/bulk-upload-xlsx.test.js
process.env.ENABLE_XLSX_IMPORT = 'true';

jest.mock('../../middleware/verifySeller', () => {
  const mongoose = require('mongoose');
  return (req, res, next) => {
    const sellerIdHeader = req.headers['x-test-seller-id'];
    if (sellerIdHeader) {
      let sellerIdObj;
      if (mongoose.Types.ObjectId.isValid(sellerIdHeader)) {
        sellerIdObj = new mongoose.Types.ObjectId(sellerIdHeader);
      } else {
        sellerIdObj = sellerIdHeader;
      }
      req.user = { _id: sellerIdObj, role: 'seller' };
      return next();
    }
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      req.user = { _id: null, role: 'seller' };
      return next();
    }
    return res.status(401).json({ message: 'Unauthorized' });
  };
});

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../helpers/testApp');
const Product = require('../../models/Product');
const ImportBatch = require('../../models/ImportBatch');
const Seller = require('../../models/Seller');
const Category = require('../../models/Category');
const { buildTestXlsxBuffer } = require('../helpers/buildTestXlsx');

const ORIGINAL_XLSX_FLAG = process.env.ENABLE_XLSX_IMPORT;

describe('Bulk Upload XLSX Integration', () => {
  let seller;
  let category;
  let sellerId;
  const authToken = 'test-token';

  beforeAll(async () => {
    process.env.ENABLE_XLSX_IMPORT = 'true';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(
        process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test-bulk-xlsx'
      );
    }

    seller = await Seller.create({
      firstName: 'XLSX',
      lastName: 'Test',
      username: 'xlsxtest',
      email: 'xlsxtest@example.com',
      password: 'hashedpassword',
      phone: '1234567890',
      shopName: 'XLSX Shop',
      shopUrl: 'xlsx-test-shop',
      isApproved: true,
    });
    sellerId = seller._id;

    category = await Category.create({
      name: 'XLSX Category',
      slug: 'xlsx-category',
      description: 'XLSX test',
    });
  });

  afterAll(async () => {
    process.env.ENABLE_XLSX_IMPORT = ORIGINAL_XLSX_FLAG;
    await Product.deleteMany({});
    await ImportBatch.deleteMany({});
    await Seller.deleteMany({});
    await Category.deleteMany({});
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  });

  beforeEach(async () => {
    await Product.deleteMany({ seller: sellerId });
    await ImportBatch.deleteMany({ uploader: sellerId });
  });

  function attachXlsx(agent, rows) {
    const buffer = buildTestXlsxBuffer(rows, {
      textColumns: ['sku', 'contractVersion'],
    });
    return agent.attach('csvFile', buffer, {
      filename: 'products.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  it('commits valid XLSX import through governance pipeline', async () => {
    const rows = [
      {
        name: 'XLSX TX Product',
        sku: 'SKU-XLSX-TX-001',
        regularPrice: '100',
        stock: '10',
        category: category._id.toString(),
        status: 'draft',
      },
    ];

    const response = await attachXlsx(
      request(app)
        .post('/api/seller/products/bulk-upload')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-test-seller-id', sellerId.toString()),
      rows
    );

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);

    const products = await Product.find({ seller: sellerId });
    expect(products).toHaveLength(1);
    expect(products[0].sku).toBe('SKU-XLSX-TX-001');

    const batch = await ImportBatch.findById(response.body.data.batchId);
    expect(batch).toBeTruthy();
    expect(batch.status).toBe('PENDING');
  });

  it('rolls back on duplicate SKU in create mode', async () => {
    await Product.create({
      name: 'Existing',
      sku: 'SKU-XLSX-DUP',
      regularPrice: 50,
      stock: 5,
      category: category._id,
      seller: sellerId,
      status: 'draft',
    });

    const rows = [
      {
        contractVersion: '2.0',
        name: 'Duplicate attempt',
        sku: 'SKU-XLSX-DUP',
        regularPrice: '100',
        stock: '10',
        category: category._id.toString(),
      },
    ];

    const response = await attachXlsx(
      request(app)
        .post('/api/seller/products/bulk-upload')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-test-seller-id', sellerId.toString()),
      rows
    );

    expect(response.status).toBe(400);
    const products = await Product.find({ seller: sellerId, sku: 'SKU-XLSX-DUP' });
    expect(products).toHaveLength(1);
    const orphanBatches = await ImportBatch.find({ uploader: sellerId, productCount: 1 });
    const linked = await Product.countDocuments({ batchId: { $in: orphanBatches.map((b) => b._id) } });
    expect(linked).toBe(0);
  });

  it('validate-only returns dry run without persisting', async () => {
    const rows = [
      {
        contractVersion: '2.0',
        name: 'Validate XLSX',
        sku: 'SKU-XLSX-VAL',
        regularPrice: '50',
        stock: '5',
        category: category._id.toString(),
      },
    ];

    const response = await attachXlsx(
      request(app)
        .post('/api/seller/products/bulk-upload/validate')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-test-seller-id', sellerId.toString()),
      rows
    );

    expect(response.status).toBe(200);
    expect(response.body.data.dryRun).toBe(true);
    const count = await Product.countDocuments({ sku: 'SKU-XLSX-VAL' });
    expect(count).toBe(0);
  });
});
