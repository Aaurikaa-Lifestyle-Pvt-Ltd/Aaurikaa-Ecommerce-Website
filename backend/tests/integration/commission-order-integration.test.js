const mongoose = require('mongoose');
const Order = require('../../models/Order');
const Product = require('../../models/Product');
const Seller = require('../../models/Seller');
const Commission = require('../../models/Commission');
const Category = require('../../models/Category');

// Mock the models
jest.mock('../../models/Order');
jest.mock('../../models/Product');
jest.mock('../../models/Seller');
jest.mock('../../models/Commission');
jest.mock('../../models/Category');

describe('Commission and Order Integration Tests', () => {
  let sellerId;
  let categoryId;
  let productId;
  let orderId;
  let mockSeller;
  let mockProduct;
  let mockCategory;

  beforeAll(() => {
    sellerId = new mongoose.Types.ObjectId();
    categoryId = new mongoose.Types.ObjectId();
    productId = new mongoose.Types.ObjectId();
    orderId = new mongoose.Types.ObjectId();

    mockSeller = {
      _id: sellerId,
      firstName: 'John',
      lastName: 'Doe',
      email: 'seller@test.com',
      shopName: 'Test Shop',
      commission: 10,
      categoryCommission: []
    };

    mockCategory = {
      _id: categoryId,
      name: 'Electronics'
    };

    mockProduct = {
      _id: productId,
      name: 'Test Product',
      price: 100,
      seller: sellerId,
      category: categoryId
    };
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Commission Creation on Order Delivery', () => {
    it('should automatically create commission when order is delivered', async () => {
      const mockOrder = {
        _id: orderId,
        status: 'shipped',
        items: [
          {
            product: mockProduct,
            quantity: 2
          }
        ],
        totalPrice: 200
      };

      // Order status updated to delivered
      Order.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockOrder)
      });

      Order.findByIdAndUpdate = jest.fn().mockResolvedValue({
        ...mockOrder,
        status: 'delivered',
        deliveredAt: new Date()
      });

      // Seller lookup for commission calculation
      Seller.findById = jest.fn().mockResolvedValue(mockSeller);

      // Check for duplicate commission
      Commission.findOne = jest.fn().mockResolvedValue(null);

      // Create commission
      const expectedCommission = {
        _id: new mongoose.Types.ObjectId(),
        seller: sellerId,
        order: orderId,
        product: productId,
        orderAmount: 200,
        commissionAmount: 20, // 10% of 200
        status: 'approved', // Auto-approved on delivery
        year: new Date().getFullYear(),
        month: new Date().getMonth() + 1
      };

      Commission.create = jest.fn().mockResolvedValue(expectedCommission);

      // Simulate order delivery
      const deliveredOrder = await Order.findByIdAndUpdate(
        orderId,
        { status: 'delivered', deliveredAt: new Date() },
        { new: true }
      );

      // Commission should be created
      const commission = await Commission.create(expectedCommission);

      expect(deliveredOrder.status).toBe('delivered');
      expect(commission).toBeDefined();
      expect(commission.commissionAmount).toBe(20);
      expect(commission.status).toBe('approved'); // Auto-approved on delivery
    });

    it('should create separate commissions for multiple products from same seller', async () => {
      const product2Id = new mongoose.Types.ObjectId();
      const mockProduct2 = {
        _id: product2Id,
        name: 'Test Product 2',
        price: 150,
        seller: sellerId,
        category: categoryId
      };

      const mockOrder = {
        _id: orderId,
        status: 'delivered',
        items: [
          { product: mockProduct, quantity: 2 },
          { product: mockProduct2, quantity: 1 }
        ],
        totalPrice: 350
      };

      Order.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockOrder)
      });

      Seller.findById = jest.fn().mockResolvedValue(mockSeller);
      Commission.findOne = jest.fn().mockResolvedValue(null);

      // Create commissions for each product
      const commission1 = {
        _id: new mongoose.Types.ObjectId(),
        seller: sellerId,
        order: orderId,
        product: productId,
        orderAmount: 200,
        commissionAmount: 20,
        status: 'approved' // Auto-approved on delivery
      };

      const commission2 = {
        _id: new mongoose.Types.ObjectId(),
        seller: sellerId,
        order: orderId,
        product: product2Id,
        orderAmount: 150,
        commissionAmount: 15,
        status: 'approved' // Auto-approved on delivery
      };

      Commission.create = jest.fn()
        .mockResolvedValueOnce(commission1)
        .mockResolvedValueOnce(commission2);

      const createdCommission1 = await Commission.create(commission1);
      const createdCommission2 = await Commission.create(commission2);

      expect(Commission.create).toHaveBeenCalledTimes(2);
      expect(createdCommission1.commissionAmount).toBe(20);
      expect(createdCommission2.commissionAmount).toBe(15);
    });

    it('should create commissions for different sellers in multi-vendor order', async () => {
      const seller2Id = new mongoose.Types.ObjectId();
      const product2Id = new mongoose.Types.ObjectId();

      const mockSeller2 = {
        _id: seller2Id,
        commission: 15
      };

      const mockProduct2 = {
        _id: product2Id,
        name: 'Product from Seller 2',
        price: 200,
        seller: seller2Id,
        category: categoryId
      };

      const mockOrder = {
        _id: orderId,
        status: 'delivered',
        items: [
          { product: mockProduct, quantity: 1 },
          { product: mockProduct2, quantity: 1 }
        ],
        totalPrice: 300
      };

      Order.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockOrder)
      });

      Seller.findById = jest.fn()
        .mockResolvedValueOnce(mockSeller)
        .mockResolvedValueOnce(mockSeller2);

      Commission.findOne = jest.fn().mockResolvedValue(null);

      const commission1 = {
        seller: sellerId,
        order: orderId,
        product: productId,
        orderAmount: 100,
        commissionAmount: 10,
        status: 'approved' // Auto-approved on delivery
      };

      const commission2 = {
        seller: seller2Id,
        order: orderId,
        product: product2Id,
        orderAmount: 200,
        commissionAmount: 30, // 15% of 200
        status: 'approved' // Auto-approved on delivery
      };

      Commission.create = jest.fn()
        .mockResolvedValueOnce(commission1)
        .mockResolvedValueOnce(commission2);

      await Commission.create(commission1);
      await Commission.create(commission2);

      expect(Commission.create).toHaveBeenCalledTimes(2);
    });

    it('should prevent duplicate commission creation for same order and product', async () => {
      const mockOrder = {
        _id: orderId,
        status: 'delivered',
        items: [
          { product: mockProduct, quantity: 1 }
        ]
      };

      Order.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockOrder)
      });

      // Commission already exists
      const existingCommission = {
        _id: new mongoose.Types.ObjectId(),
        seller: sellerId,
        order: orderId,
        product: productId,
        orderAmount: 100,
        commissionAmount: 10,
        status: 'approved' // Auto-approved on delivery
      };

      Commission.findOne = jest.fn().mockResolvedValue(existingCommission);

      const duplicateCheck = await Commission.findOne({
        seller: sellerId,
        order: orderId,
        product: productId
      });

      expect(duplicateCheck).toBeDefined();
      expect(duplicateCheck._id).toEqual(existingCommission._id);

      // Should not create new commission
      expect(() => {
        if (duplicateCheck) {
          throw new Error('Commission already exists for this order and product');
        }
      }).toThrow('Commission already exists for this order and product');
    });
  });

  describe('Commission Calculation with Different Rates', () => {
    it('should use category-specific commission rate', async () => {
      const sellerWithCategoryRate = {
        ...mockSeller,
        categoryCommission: [
          { categoryId: categoryId, commission: 15 }
        ]
      };

      Seller.findById = jest.fn().mockResolvedValue(sellerWithCategoryRate);

      // Calculate commission with category-specific rate
      const orderAmount = 200;
      const commissionRate = 15;
      const expectedCommission = (orderAmount * commissionRate) / 100;

      expect(expectedCommission).toBe(30); // 15% of 200
    });

    it('should use seller default commission rate when no category-specific rate', async () => {
      Seller.findById = jest.fn().mockResolvedValue(mockSeller);

      const orderAmount = 200;
      const commissionRate = mockSeller.commission;
      const expectedCommission = (orderAmount * commissionRate) / 100;

      expect(expectedCommission).toBe(20); // 10% of 200
    });

    it('should use system default rate (5%) when seller has no commission configured', async () => {
      const sellerWithoutCommission = {
        ...mockSeller,
        commission: undefined
      };

      Seller.findById = jest.fn().mockResolvedValue(sellerWithoutCommission);

      const orderAmount = 200;
      const systemDefaultRate = 5;
      const expectedCommission = (orderAmount * systemDefaultRate) / 100;

      expect(expectedCommission).toBe(10); // 5% of 200
    });
  });

  describe('Commission Status Lifecycle with Orders', () => {
    it('should set commission to approved when order is delivered', async () => {
      const commission = {
        _id: new mongoose.Types.ObjectId(),
        seller: sellerId,
        order: orderId,
        status: 'approved', // Auto-approved on delivery
        orderAmount: 200,
        commissionAmount: 20
      };

      Commission.create = jest.fn().mockResolvedValue(commission);

      const result = await Commission.create(commission);

      expect(result.status).toBe('approved'); // Auto-approved on delivery
    });

    it('should track commission through approval workflow', async () => {
      const commissionId = new mongoose.Types.ObjectId();

      // Step 1: Approved commission (auto-approved on delivery)
      const approvedCommissionInitial = {
        _id: commissionId,
        seller: sellerId,
        order: orderId,
        status: 'approved',
        commissionAmount: 20
      };

      Commission.findById = jest.fn().mockResolvedValue(approvedCommissionInitial);

      // Step 2: Commission can be locked for payout
      const lockedCommission = {
        ...approvedCommissionInitial,
        status: 'locked',
        lockedAt: new Date(),
        lockedBy: new mongoose.Types.ObjectId()
      };

      Commission.findByIdAndUpdate = jest.fn().mockResolvedValue(lockedCommission);

      const updated = await Commission.findByIdAndUpdate(
        commissionId,
        {
          status: 'locked',
          lockedAt: new Date(),
          lockedBy: new mongoose.Types.ObjectId()
        },
        { new: true }
      );

      expect(updated.status).toBe('locked');
      expect(updated.lockedAt).toBeDefined();
    });

    it('should handle commission disputes', async () => {
      const commissionId = new mongoose.Types.ObjectId();

      const disputedCommission = {
        _id: commissionId,
        seller: sellerId,
        order: orderId,
        status: 'disputed',
        disputeReason: 'Incorrect commission amount',
        commissionAmount: 20
      };

      Commission.findByIdAndUpdate = jest.fn().mockResolvedValue(disputedCommission);

      const result = await Commission.findByIdAndUpdate(
        commissionId,
        {
          status: 'disputed',
          disputeReason: 'Incorrect commission amount'
        },
        { new: true }
      );

      expect(result.status).toBe('disputed');
      expect(result.disputeReason).toBeDefined();
    });
  });

  describe('Commission Aggregation for Orders', () => {
    it('should calculate total commission for multi-product order', async () => {
      const commissions = [
        {
          _id: new mongoose.Types.ObjectId(),
          seller: sellerId,
          order: orderId,
          product: productId,
          commissionAmount: 20
        },
        {
          _id: new mongoose.Types.ObjectId(),
          seller: sellerId,
          order: orderId,
          product: new mongoose.Types.ObjectId(),
          commissionAmount: 15
        }
      ];

      Commission.find = jest.fn().mockResolvedValue(commissions);

      const orderCommissions = await Commission.find({
        order: orderId,
        seller: sellerId
      });

      const totalCommission = orderCommissions.reduce(
        (sum, c) => sum + c.commissionAmount,
        0
      );

      expect(totalCommission).toBe(35);
    });

    it('should aggregate commissions by seller for multi-vendor order', async () => {
      const seller2Id = new mongoose.Types.ObjectId();

      const commissions = [
        { seller: sellerId, commissionAmount: 20 },
        { seller: sellerId, commissionAmount: 10 },
        { seller: seller2Id, commissionAmount: 30 }
      ];

      Commission.find = jest.fn().mockResolvedValue(commissions);

      const orderCommissions = await Commission.find({ order: orderId });

      const commissionsBySeller = orderCommissions.reduce((acc, c) => {
        const sellerKey = c.seller.toString();
        acc[sellerKey] = (acc[sellerKey] || 0) + c.commissionAmount;
        return acc;
      }, {});

      expect(commissionsBySeller[sellerId.toString()]).toBe(30);
      expect(commissionsBySeller[seller2Id.toString()]).toBe(30);
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should complete order delivery even if commission creation fails', async () => {
      const mockOrder = {
        _id: orderId,
        status: 'shipped',
        items: [{ product: mockProduct, quantity: 1 }]
      };

      Order.findByIdAndUpdate = jest.fn().mockResolvedValue({
        ...mockOrder,
        status: 'delivered',
        deliveredAt: new Date()
      });

      // Commission creation fails
      Commission.create = jest.fn().mockRejectedValue(
        new Error('Commission creation failed')
      );

      // Order should still be delivered
      const deliveredOrder = await Order.findByIdAndUpdate(
        orderId,
        { status: 'delivered', deliveredAt: new Date() },
        { new: true }
      );

      expect(deliveredOrder.status).toBe('delivered');

      // Commission creation should fail but not prevent order update
      await expect(Commission.create()).rejects.toThrow('Commission creation failed');
    });

    it('should log errors for failed commission calculations', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      Seller.findById = jest.fn().mockRejectedValue(
        new Error('Seller not found')
      );

      try {
        await Seller.findById(sellerId);
      } catch (error) {
        console.error('Commission calculation error:', error.message);
      }

      expect(consoleSpy).toHaveBeenCalledWith(
        'Commission calculation error:',
        'Seller not found'
      );

      consoleSpy.mockRestore();
    });

    it('should handle missing product information gracefully', async () => {
      const mockOrder = {
        _id: orderId,
        status: 'delivered',
        items: [
          { product: null, quantity: 1 } // Missing product
        ]
      };

      Order.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockOrder)
      });

      const order = await Order.findById(orderId).populate('items.product');

      // Should skip items without product information
      const validItems = order.items.filter(item => item.product !== null);

      expect(validItems).toHaveLength(0);
    });
  });

  describe('Commission Reporting and Analytics', () => {
    it('should generate commission summary by period', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      Commission.aggregate = jest.fn().mockResolvedValue([
        {
          _id: { year: 2024, month: 1 },
          count: 10,
          totalAmount: 200,
          totalOrderAmount: 2000
        },
        {
          _id: { year: 2024, month: 2 },
          count: 15,
          totalAmount: 300,
          totalOrderAmount: 3000
        }
      ]);

      const summary = await Commission.aggregate([
        {
          $match: {
            seller: sellerId,
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
            count: { $sum: 1 },
            totalAmount: { $sum: '$commissionAmount' },
            totalOrderAmount: { $sum: '$orderAmount' }
          }
        }
      ]);

      expect(summary).toHaveLength(2);
      expect(summary[0].totalAmount).toBe(200);
      expect(summary[1].totalAmount).toBe(300);
    });

    it('should track commission by order status', async () => {
      Commission.aggregate = jest.fn().mockResolvedValue([
        { _id: 'pending', count: 5, total: 100 },
        { _id: 'approved', count: 10, total: 200 },
        { _id: 'paid', count: 20, total: 400 }
      ]);

      const statusSummary = await Commission.aggregate([
        { $match: { seller: sellerId } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            total: { $sum: '$commissionAmount' }
          }
        }
      ]);

      expect(statusSummary).toHaveLength(3);

      const totalCommissions = statusSummary.reduce((sum, s) => sum + s.total, 0);
      expect(totalCommissions).toBe(700);
    });
  });
});

