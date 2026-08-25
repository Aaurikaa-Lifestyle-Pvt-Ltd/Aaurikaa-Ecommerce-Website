const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const commissionController = require('../../controllers/commissionController');
const Commission = require('../../models/Commission');
const Order = require('../../models/Order');
const Product = require('../../models/Product');
const Seller = require('../../models/Seller');
const Category = require('../../models/Category');

describe('Commission Controller Tests', () => {
  let app;
  let testSeller, testProduct, testOrder, testCategory;

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
    app = express();
    app.use(express.json());
    
    // Mock authentication middleware
    app.use((req, res, next) => {
      req.user = { id: new mongoose.Types.ObjectId(), role: 'admin' };
      next();
    });

    // Setup routes
    app.get('/commissions', commissionController.getCommissions);
    app.get('/commissions/stats', commissionController.getCommissionStats);
    app.get('/commissions/pending', commissionController.getPendingCommissions);
    app.get('/commissions/:id', commissionController.getCommissionById);
    app.post('/commissions', commissionController.createCommission);
    app.patch('/commissions/:id/approve', commissionController.approveCommission);
    app.patch('/commissions/:id/paid', commissionController.markCommissionAsPaid);
    app.patch('/commissions/:id/dispute', commissionController.disputeCommission);
    app.patch('/commissions/:id/resolve', commissionController.resolveDispute);
    app.post('/commissions/bulk-approve', commissionController.bulkApproveCommissions);

    // Create test data
    testCategory = await Category.create({
      name: 'Electronics',
      description: 'Electronic products'
    });

    testSeller = await Seller.create({
      name: 'Test Seller',
      username: 'testseller',
      email: 'seller@test.com',
      phone: '9876543210',
      commission: 10
    });

    testProduct = await Product.create({
      name: 'Test Product',
      price: 1000,
      regularPrice: 1000,
      sku: 'TEST-SKU-001',
      seller: testSeller._id,
      category: testCategory._id,
      description: 'Test product description'
    });

    testOrder = await Order.create({
      orderNumber: 'ORD-001',
      buyer: new mongoose.Types.ObjectId(), // Add required buyer field
      items: [{
        product: testProduct._id,
        quantity: 2,
        price: 1000
      }],
      totalAmount: 2000,
      status: 'delivered' // Use valid status enum value
    });
  });

  afterEach(async () => {
    // Clean up test data
    await Commission.deleteMany({});
    await Order.deleteMany({});
    await Product.deleteMany({});
    await Seller.deleteMany({});
    await Category.deleteMany({});
  });

  describe('createCommission', () => {
    it('should create a new commission', async () => {
      const commissionData = {
        orderId: testOrder._id,
        sellerId: testSeller._id,
        productId: testProduct._id,
        orderAmount: 2000,
        commissionRate: 10,
        period: {
          year: 2024,
          month: 12
        },
        notes: 'Test commission'
      };

      const response = await request(app)
        .post('/commissions')
        .send(commissionData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.orderAmount).toBe(2000);
      expect(response.body.data.commissionAmount).toBe(200); // 10% of 2000
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/commissions')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Order ID, seller ID, product ID, and order amount are required');
    });

    it('should validate order amount', async () => {
      const commissionData = {
        orderId: testOrder._id,
        sellerId: testSeller._id,
        productId: testProduct._id,
        orderAmount: -100 // Invalid amount
      };

      const response = await request(app)
        .post('/commissions')
        .send(commissionData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Order amount must be a positive number');
    });

    it('should prevent duplicate commissions', async () => {
      // Create first commission
      await Commission.create({
        order: testOrder._id,
        seller: testSeller._id,
        product: testProduct._id,
        orderAmount: 2000,
        commissionRate: 10,
        commissionAmount: 200,
        period: {
          year: 2024,
          month: 1
        }
      });

      const commissionData = {
        orderId: testOrder._id,
        sellerId: testSeller._id,
        productId: testProduct._id,
        orderAmount: 2000
      };

      const response = await request(app)
        .post('/commissions')
        .send(commissionData);

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Commission already exists for this order and product');
    });

    it('should validate commission rate when provided', async () => {
      const commissionData = {
        orderId: testOrder._id,
        sellerId: testSeller._id,
        productId: testProduct._id,
        orderAmount: 2000,
        commissionRate: 150 // Invalid rate
      };

      const response = await request(app)
        .post('/commissions')
        .send(commissionData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Commission rate must be between 0 and 100');
    });
  });

  describe('getCommissions', () => {
    beforeEach(async () => {
      // Create test commissions
      await Commission.create([
        {
          order: testOrder._id,
          seller: testSeller._id,
          product: testProduct._id,
          orderAmount: 2000,
          commissionRate: 10,
          commissionAmount: 200,
          status: 'pending',
          period: {
            year: 2024,
            month: 1
          }
        },
        {
          order: testOrder._id,
          seller: testSeller._id,
          product: testProduct._id,
          orderAmount: 1000,
          commissionRate: 10,
          commissionAmount: 100,
          status: 'approved',
          period: {
            year: 2024,
            month: 1
          }
        }
      ]);
    });

    it('should get all commissions', async () => {
      const response = await request(app)
        .get('/commissions');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.commissions).toHaveLength(2);
    });

    it('should filter by status', async () => {
      const response = await request(app)
        .get('/commissions?status=pending');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.commissions).toHaveLength(1);
      expect(response.body.data.commissions[0].status).toBe('pending');
    });

    it('should filter by seller', async () => {
      const response = await request(app)
        .get(`/commissions?sellerId=${testSeller._id}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.commissions).toHaveLength(2);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/commissions?page=1&limit=1');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.commissions).toHaveLength(1);
      expect(response.body.data.pagination.currentPage).toBe(1);
      expect(response.body.data.pagination.totalPages).toBe(2);
    });
  });

  describe('approveCommission', () => {
    let testCommission;

    beforeEach(async () => {
      testCommission = await Commission.create({
        order: testOrder._id,
        seller: testSeller._id,
        product: testProduct._id,
        orderAmount: 2000,
        commissionRate: 10,
        commissionAmount: 200,
        status: 'pending',
        period: {
          year: 2024,
          month: 1
        }
      });
    });

    it('should approve a pending commission', async () => {
      const response = await request(app)
        .patch(`/commissions/${testCommission._id}/approve`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('approved');
      expect(response.body.data.approvedAt).toBeDefined();
    });

    it('should validate commission ID format', async () => {
      const response = await request(app)
        .patch('/commissions/invalid-id/approve');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid commission ID');
    });

    it('should return 404 for non-existent commission', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      
      const response = await request(app)
        .patch(`/commissions/${fakeId}/approve`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Commission not found');
    });

    it('should only approve pending commissions', async () => {
      // Update commission to approved status
      testCommission.status = 'approved';
      await testCommission.save();

      const response = await request(app)
        .patch(`/commissions/${testCommission._id}/approve`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Only pending commissions can be approved');
    });
  });

  describe('markCommissionAsPaid', () => {
    let testCommission;

    beforeEach(async () => {
      testCommission = await Commission.create({
        order: testOrder._id,
        seller: testSeller._id,
        product: testProduct._id,
        orderAmount: 2000,
        commissionRate: 10,
        commissionAmount: 200,
        status: 'approved',
        period: {
          year: 2024,
          month: 1
        }
      });
    });

    it('should mark approved commission as paid', async () => {
      const paymentData = {
        paymentMethod: 'bank_transfer',
        paymentReference: 'TXN-123456'
      };

      const response = await request(app)
        .patch(`/commissions/${testCommission._id}/paid`)
        .send(paymentData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('paid');
      expect(response.body.data.paymentDate).toBeDefined();
      expect(response.body.data.paymentMethod).toBe('bank_transfer');
    });

    it('should only mark approved commissions as paid', async () => {
      // Update commission to pending status
      testCommission.status = 'pending';
      await testCommission.save();

      const response = await request(app)
        .patch(`/commissions/${testCommission._id}/paid`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Only approved commissions can be marked as paid');
    });
  });

  describe('disputeCommission', () => {
    let testCommission;

    beforeEach(async () => {
      testCommission = await Commission.create({
        order: testOrder._id,
        seller: testSeller._id,
        product: testProduct._id,
        orderAmount: 2000,
        commissionRate: 10,
        commissionAmount: 200,
        status: 'approved',
        period: {
          year: 2024,
          month: 1
        }
      });
    });

    it('should dispute a commission', async () => {
      const disputeData = {
        reason: 'Incorrect commission calculation',
        raisedBy: 'seller'
      };

      const response = await request(app)
        .patch(`/commissions/${testCommission._id}/dispute`)
        .send(disputeData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('disputed');
      expect(response.body.data.dispute.reason).toBe('Incorrect commission calculation');
    });

    it('should require dispute reason', async () => {
      const response = await request(app)
        .patch(`/commissions/${testCommission._id}/dispute`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Dispute reason is required');
    });

    it('should not allow disputing already disputed commission', async () => {
      testCommission.status = 'disputed';
      await testCommission.save();

      const disputeData = {
        reason: 'Another dispute reason'
      };

      const response = await request(app)
        .patch(`/commissions/${testCommission._id}/dispute`)
        .send(disputeData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Commission is already disputed');
    });
  });

  describe('resolveDispute', () => {
    let testCommission;

    beforeEach(async () => {
      testCommission = await Commission.create({
        order: testOrder._id,
        seller: testSeller._id,
        product: testProduct._id,
        orderAmount: 2000,
        commissionRate: 10,
        commissionAmount: 200,
        status: 'disputed',
        period: {
          year: 2024,
          month: 1
        },
        dispute: {
          reason: 'Incorrect calculation',
          raisedBy: 'seller',
          raisedAt: new Date()
        }
      });
    });

    it('should resolve a dispute', async () => {
      const resolutionData = {
        resolution: 'Commission recalculated and corrected'
      };

      const response = await request(app)
        .patch(`/commissions/${testCommission._id}/resolve`)
        .send(resolutionData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('approved');
      expect(response.body.data.dispute.resolution).toBe('Commission recalculated and corrected');
      expect(response.body.data.dispute.resolvedAt).toBeDefined();
    });

    it('should require resolution text', async () => {
      const response = await request(app)
        .patch(`/commissions/${testCommission._id}/resolve`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Dispute resolution is required');
    });

    it('should only resolve disputed commissions', async () => {
      testCommission.status = 'approved';
      await testCommission.save();

      const resolutionData = {
        resolution: 'Test resolution'
      };

      const response = await request(app)
        .patch(`/commissions/${testCommission._id}/resolve`)
        .send(resolutionData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Only disputed commissions can be resolved');
    });
  });

  describe('bulkApproveCommissions', () => {
    let testCommissions;

    beforeEach(async () => {
      testCommissions = await Commission.create([
        {
          order: testOrder._id,
          seller: testSeller._id,
          product: testProduct._id,
          orderAmount: 2000,
          commissionRate: 10,
          commissionAmount: 200,
          status: 'pending',
          period: {
            year: 2024,
            month: 1
          }
        },
        {
          order: testOrder._id,
          seller: testSeller._id,
          product: testProduct._id,
          orderAmount: 1000,
          commissionRate: 10,
          commissionAmount: 100,
          status: 'pending',
          period: {
            year: 2024,
            month: 1
          }
        }
      ]);
    });

    it('should bulk approve multiple commissions', async () => {
      const commissionIds = testCommissions.map(c => c._id);
      
      const response = await request(app)
        .post('/commissions/bulk-approve')
        .send({ commissionIds });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.approvedCount).toBe(2);
    });

    it('should validate commission IDs array', async () => {
      const response = await request(app)
        .post('/commissions/bulk-approve')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Commission IDs array is required');
    });

    it('should validate ID format', async () => {
      const response = await request(app)
        .post('/commissions/bulk-approve')
        .send({ commissionIds: ['invalid-id'] });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid commission IDs found');
    });
  });

  describe('getCommissionStats', () => {
    beforeEach(async () => {
      // Create test commissions with different statuses
      await Commission.create([
        {
          order: testOrder._id,
          seller: testSeller._id,
          product: testProduct._id,
          orderAmount: 2000,
          commissionRate: 10,
          commissionAmount: 200,
          status: 'pending',
          period: {
            year: 2024,
            month: 1
          }
        },
        {
          order: testOrder._id,
          seller: testSeller._id,
          product: testProduct._id,
          orderAmount: 1000,
          commissionRate: 10,
          commissionAmount: 100,
          status: 'paid',
          period: {
            year: 2024,
            month: 1
          }
        }
      ]);
    });

    it('should get commission statistics', async () => {
      const response = await request(app)
        .get('/commissions/stats');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.totalCommissions).toBe(2);
      expect(response.body.data.totalAmount).toBe(300);
      expect(response.body.data.pendingCount).toBe(1);
      expect(response.body.data.paidCount).toBe(1);
    });
  });
});
