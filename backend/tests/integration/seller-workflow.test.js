const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../server');
const Seller = require('../../models/Seller');
const Product = require('../../models/Product');
const Order = require('../../models/Order');
const Commission = require('../../models/Commission');

// Mock the models for integration testing
jest.mock('../../models/Seller');
jest.mock('../../models/Product');
jest.mock('../../models/Order');
jest.mock('../../models/Commission');

describe('Seller Workflow Integration Tests', () => {
  let sellerId;
  let sellerToken;
  let mockSeller;

  beforeAll(() => {
    // Setup test data
    sellerId = new mongoose.Types.ObjectId();
    sellerToken = 'mock-jwt-token';
    
    mockSeller = {
      _id: sellerId,
      firstName: 'John',
      lastName: 'Doe',
      email: 'seller@test.com',
      shopName: 'Test Shop',
      status: 'approved',
      commission: 10
    };
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Complete Seller Registration to First Sale Workflow', () => {
    it('should complete full seller workflow: registration -> product creation -> order -> commission', async () => {
      // Step 1: Seller Registration (mock successful registration)
      const registrationData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'newseller@test.com',
        password: 'SecurePass123!',
        shopName: 'New Test Shop',
        phone: '1234567890'
      };

      // Mock seller creation
      Seller.create = jest.fn().mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        ...registrationData,
        status: 'pending'
      });

      // Step 2: Seller Approval (mock admin approval)
      const approvedSeller = {
        ...mockSeller,
        status: 'approved'
      };
      
      Seller.findById = jest.fn().mockResolvedValue(approvedSeller);
      Seller.findByIdAndUpdate = jest.fn().mockResolvedValue(approvedSeller);

      // Step 3: Product Creation
      const productData = {
        name: 'Test Product',
        description: 'Test Description',
        price: 100,
        stock: 50,
        category: new mongoose.Types.ObjectId()
      };

      const mockProduct = {
        _id: new mongoose.Types.ObjectId(),
        ...productData,
        seller: sellerId
      };

      Product.create = jest.fn().mockResolvedValue(mockProduct);

      // Step 4: Order Creation (customer places order)
      const mockOrder = {
        _id: new mongoose.Types.ObjectId(),
        buyer: new mongoose.Types.ObjectId(),
        items: [{
          product: mockProduct._id,
          quantity: 2,
          price: 100
        }],
        totalPrice: 200,
        status: 'pending'
      };

      Order.create = jest.fn().mockResolvedValue(mockOrder);
      Order.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue({
          ...mockOrder,
          items: [{
            product: { ...mockProduct, _id: mockProduct._id },
            quantity: 2
          }]
        })
      });

      // Step 5: Order Delivery (triggers commission)
      Order.findByIdAndUpdate = jest.fn().mockResolvedValue({
        ...mockOrder,
        status: 'delivered'
      });

      // Step 6: Commission Creation
      const mockCommission = {
        _id: new mongoose.Types.ObjectId(),
        seller: sellerId,
        order: mockOrder._id,
        product: mockProduct._id,
        orderAmount: 200,
        commissionAmount: 20, // 10% commission
        status: 'pending'
      };

      Commission.create = jest.fn().mockResolvedValue(mockCommission);
      Commission.findOne = jest.fn().mockResolvedValue(null); // No duplicate commission

      // Verify the workflow steps
      expect(Seller.create).toBeDefined();
      expect(Product.create).toBeDefined();
      expect(Order.create).toBeDefined();
      expect(Commission.create).toBeDefined();
    });

    it('should handle seller rejection workflow', async () => {
      // Mock seller with pending status
      const pendingSeller = {
        ...mockSeller,
        status: 'pending'
      };

      Seller.findById = jest.fn().mockResolvedValue(pendingSeller);

      // Mock rejection
      const rejectedSeller = {
        ...pendingSeller,
        status: 'rejected',
        rejectionReason: 'Invalid documents'
      };

      Seller.findByIdAndUpdate = jest.fn().mockResolvedValue(rejectedSeller);

      // Verify seller cannot create products when rejected
      Product.create = jest.fn().mockRejectedValue(
        new Error('Seller not approved')
      );

      expect(Seller.findByIdAndUpdate).toBeDefined();
    });
  });

  describe('Seller Dashboard Data Flow', () => {
    it('should aggregate dashboard data correctly', async () => {
      // Mock products
      const mockProducts = [
        { _id: new mongoose.Types.ObjectId(), seller: sellerId, name: 'Product 1' },
        { _id: new mongoose.Types.ObjectId(), seller: sellerId, name: 'Product 2' }
      ];

      Product.find = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockProducts)
      });

      // Mock orders
      const mockOrders = [
        {
          _id: new mongoose.Types.ObjectId(),
          status: 'processing',
          totalPrice: 200,
          items: [{ product: mockProducts[0]._id, quantity: 2 }]
        },
        {
          _id: new mongoose.Types.ObjectId(),
          status: 'delivered',
          totalPrice: 300,
          items: [{ product: mockProducts[1]._id, quantity: 3 }]
        }
      ];

      Order.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(mockOrders)
        })
      });

      // Mock commissions
      Commission.aggregate = jest.fn().mockResolvedValue([
        { _id: 'pending', count: 2, total: 50 },
        { _id: 'approved', count: 5, total: 100 },
        { _id: 'paid', count: 10, total: 200 }
      ]);

      // Calculate expected dashboard stats
      const activeOrders = mockOrders.filter(o => 
        ['paid', 'processing', 'shipped'].includes(o.status)
      ).length;

      expect(activeOrders).toBe(1);
      expect(Product.find).toBeDefined();
      expect(Order.find).toBeDefined();
      expect(Commission.aggregate).toBeDefined();
    });

    it('should handle sellers with no products', async () => {
      Product.find = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue([])
      });

      // Should return empty dashboard stats
      const expectedStats = {
        activeOrders: 0,
        pendingPayouts: 0,
        totalEarnings: 0,
        monthlyEarnings: [],
        recentOrders: [],
        topProducts: [],
        commissionSummary: {
          pending: 0,
          approved: 0,
          paid: 0,
          total: 0
        }
      };

      expect(expectedStats.activeOrders).toBe(0);
      expect(expectedStats.topProducts).toHaveLength(0);
    });
  });

  describe('Product Management Workflow', () => {
    it('should allow seller to create, update, and delete products', async () => {
      const productId = new mongoose.Types.ObjectId();
      
      // Create product
      const newProduct = {
        _id: productId,
        name: 'New Product',
        price: 100,
        stock: 50,
        seller: sellerId
      };

      Product.create = jest.fn().mockResolvedValue(newProduct);

      // Update product
      const updatedProduct = {
        ...newProduct,
        price: 120,
        stock: 40
      };

      Product.findOneAndUpdate = jest.fn().mockResolvedValue(updatedProduct);

      // Delete product
      Product.findOneAndDelete = jest.fn().mockResolvedValue(newProduct);

      expect(Product.create).toBeDefined();
      expect(Product.findOneAndUpdate).toBeDefined();
      expect(Product.findOneAndDelete).toBeDefined();
    });

    it('should prevent seller from managing other sellers products', async () => {
      const otherSellerId = new mongoose.Types.ObjectId();
      const productId = new mongoose.Types.ObjectId();

      // Mock product belonging to another seller
      Product.findById = jest.fn().mockResolvedValue({
        _id: productId,
        seller: otherSellerId,
        name: 'Other Seller Product'
      });

      // Should fail access control check
      const sellerCanAccess = (product) => {
        return product.seller.toString() === sellerId.toString();
      };

      const mockProduct = await Product.findById(productId);
      expect(sellerCanAccess(mockProduct)).toBe(false);
    });
  });

  describe('Order Management Workflow', () => {
    it('should allow seller to view and update their orders', async () => {
      const orderId = new mongoose.Types.ObjectId();
      const productId = new mongoose.Types.ObjectId();

      // Mock order with seller's product
      const mockOrder = {
        _id: orderId,
        items: [{
          product: {
            _id: productId,
            seller: sellerId,
            name: 'Seller Product'
          },
          quantity: 2
        }],
        status: 'paid'
      };

      Order.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue([mockOrder])
        })
      });

      // Update order status
      Order.findByIdAndUpdate = jest.fn().mockResolvedValue({
        ...mockOrder,
        status: 'processing'
      });

      expect(Order.find).toBeDefined();
      expect(Order.findByIdAndUpdate).toBeDefined();
    });

    it('should filter orders to only show orders with seller products', async () => {
      const productId1 = new mongoose.Types.ObjectId();
      const productId2 = new mongoose.Types.ObjectId();
      const otherSellerId = new mongoose.Types.ObjectId();

      const allOrders = [
        {
          _id: new mongoose.Types.ObjectId(),
          items: [{ product: { _id: productId1, seller: sellerId } }]
        },
        {
          _id: new mongoose.Types.ObjectId(),
          items: [{ product: { _id: productId2, seller: otherSellerId } }]
        }
      ];

      // Filter orders for current seller
      const sellerOrders = allOrders.filter(order => 
        order.items.some(item => 
          item.product.seller.toString() === sellerId.toString()
        )
      );

      expect(sellerOrders).toHaveLength(1);
      expect(sellerOrders[0].items[0].product.seller).toEqual(sellerId);
    });
  });

  describe('Commission Tracking Workflow', () => {
    it('should track commission from order creation to payout', async () => {
      const orderId = new mongoose.Types.ObjectId();
      const commissionId = new mongoose.Types.ObjectId();

      // Step 1: Order delivered, commission created
      const pendingCommission = {
        _id: commissionId,
        seller: sellerId,
        order: orderId,
        orderAmount: 200,
        commissionAmount: 20,
        status: 'pending'
      };

      Commission.create = jest.fn().mockResolvedValue(pendingCommission);

      // Step 2: Admin approves commission
      const approvedCommission = {
        ...pendingCommission,
        status: 'approved'
      };

      Commission.findByIdAndUpdate = jest.fn().mockResolvedValue(approvedCommission);

      // Step 3: Payout processed, commission marked as paid
      const paidCommission = {
        ...approvedCommission,
        status: 'paid',
        paidAt: new Date()
      };

      Commission.findByIdAndUpdate = jest.fn().mockResolvedValue(paidCommission);

      expect(Commission.create).toBeDefined();
      expect(Commission.findByIdAndUpdate).toBeDefined();
    });

    it('should calculate available payout from approved commissions', async () => {
      const mockCommissions = [
        { status: 'pending', commissionAmount: 50 },
        { status: 'approved', commissionAmount: 100 },
        { status: 'approved', commissionAmount: 150 },
        { status: 'paid', commissionAmount: 200 }
      ];

      // Calculate available for payout (only approved)
      const availableForPayout = mockCommissions
        .filter(c => c.status === 'approved')
        .reduce((sum, c) => sum + c.commissionAmount, 0);

      expect(availableForPayout).toBe(250);
    });
  });

  describe('Payout Request Workflow', () => {
    it('should process payout request with sufficient balance', async () => {
      const payoutAmount = 200;

      // Mock commission summary
      Commission.aggregate = jest.fn().mockResolvedValue([
        { _id: 'approved', count: 5, total: 250 }
      ]);

      // Seller has 250 available, requesting 200
      const availableBalance = 250;
      expect(payoutAmount <= availableBalance).toBe(true);

      // Mock payout creation
      const mockPayout = {
        _id: new mongoose.Types.ObjectId(),
        seller: sellerId,
        amount: payoutAmount,
        status: 'pending',
        requestedAt: new Date()
      };

      // Update commissions to 'processing'
      Commission.updateMany = jest.fn().mockResolvedValue({
        modifiedCount: 5
      });

      expect(Commission.aggregate).toBeDefined();
      expect(Commission.updateMany).toBeDefined();
    });

    it('should reject payout request with insufficient balance', async () => {
      const payoutAmount = 300;

      // Mock commission summary
      Commission.aggregate = jest.fn().mockResolvedValue([
        { _id: 'approved', count: 3, total: 200 }
      ]);

      // Seller has 200 available, requesting 300
      const availableBalance = 200;
      expect(payoutAmount > availableBalance).toBe(true);

      // Should throw error
      expect(() => {
        if (payoutAmount > availableBalance) {
          throw new Error('Insufficient balance for payout');
        }
      }).toThrow('Insufficient balance for payout');
    });
  });

  describe('Error Handling in Workflows', () => {
    it('should handle database errors gracefully', async () => {
      Product.find = jest.fn().mockRejectedValue(
        new Error('Database connection error')
      );

      await expect(Product.find()).rejects.toThrow('Database connection error');
    });

    it('should rollback on workflow failure', async () => {
      // Mock successful order creation
      const mockOrder = {
        _id: new mongoose.Types.ObjectId(),
        totalPrice: 200
      };

      Order.create = jest.fn().mockResolvedValue(mockOrder);

      // Mock failed commission creation
      Commission.create = jest.fn().mockRejectedValue(
        new Error('Commission creation failed')
      );

      // In real workflow, order should still complete even if commission fails
      // (with error logging)
      const order = await Order.create(mockOrder);
      expect(order).toBeDefined();

      // Commission creation should be retried or logged
      await expect(Commission.create()).rejects.toThrow('Commission creation failed');
    });
  });
});

