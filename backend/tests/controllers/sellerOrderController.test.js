const {
  getSellerOrders,
  updateOrderStatus
} = require('../../controllers/sellerOrderController');

const Order = require('../../models/Order');
const Product = require('../../models/Product');
const Commission = require('../../models/Commission');
const SellerLedger = require('../../models/SellerLedger');
const mongoose = require('mongoose');
const { calculateCommission } = require('../../utils/calculateCommission');
const { sendErrorResponse, sendSuccessResponse, ERROR_CODES } = require('../../utils/errorHandler');

jest.mock('../../models/SellerLedger');
jest.mock('../../utils/calculateCommission', () => ({
  calculateCommission: jest.fn(),
}));
jest.mock('../../utils/financialIntegrityValidator', () => ({
  validateSellerLedgerIntegrity: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../services/orderFulfillmentService', () => ({
  maybeSyncShiprocket: jest.fn().mockResolvedValue(undefined),
  syncToShiprocket: jest.fn().mockResolvedValue(undefined),
}));

// Mock the models and utilities
jest.mock('../../models/Order');
jest.mock('../../models/Product');
jest.mock('../../models/Commission');
jest.mock('../../models/ReturnRequest', () => ({
  find: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    }),
  }),
}));
jest.mock('../../utils/errorHandler', () => {
  const actual = jest.requireActual('../../utils/errorHandler');
  return {
    ...actual,
    // Make controller exports awaitable (async handler identity).
    asyncHandler: (fn) => fn,
    // Spy but still run real implementations so res.status/json expectations work.
    sendErrorResponse: jest.fn(actual.sendErrorResponse),
    sendSuccessResponse: jest.fn(actual.sendSuccessResponse),
  };
});

describe('SellerOrderController', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    
    mockReq = {
      user: { _id: 'seller123' },
      params: {},
      query: {},
      body: {}
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('getSellerOrders', () => {
    it('should return seller orders successfully', async () => {
      const mockProducts = [
        { _id: 'product1', name: 'Product 1' },
        { _id: 'product2', name: 'Product 2' }
      ];

      const mockOrders = [
        {
          _id: 'order1',
          buyer: '507f1f77bcf86cd799439099',
          paymentMethod: 'phonepe',
          paymentStatus: 'success',
          status: 'paid',
          paymentTransactionId: 'TXN_test',
          createdAt: new Date('2026-01-01'),
          items: [
            { product: { _id: 'product1', name: 'Product 1', price: 100 }, quantity: 2 },
            { product: { _id: 'product2', name: 'Product 2', price: 50 }, quantity: 1 }
          ],
          toObject: function() { return this; }
        }
      ];

      Product.find = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockProducts)
      });

      Order.find = jest.fn()
        .mockReturnValueOnce({
          populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockReturnValue({
              sort: jest.fn().mockResolvedValue(mockOrders)
            })
          })
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        });

      await getSellerOrders(mockReq, mockRes);

      expect(Product.find).toHaveBeenCalledWith({ seller: 'seller123' });
      expect(Order.find).toHaveBeenCalledWith({
        'items.product': { $in: ['product1', 'product2'] }
      });
      expect(sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        200,
        'Seller orders retrieved successfully',
        expect.objectContaining({
          orders: expect.any(Array),
          count: expect.any(Number)
        })
      );

      const payload = sendSuccessResponse.mock.calls[0][3];
      expect(payload.orders[0].paymentVisibility).toEqual(
        expect.objectContaining({
          paymentMethod: 'ONLINE',
          paymentGateway: 'PHONEPE',
          paymentStatus: 'PAID',
        })
      );
      expect(payload.orders[0].manualConfirmation).toEqual(
        expect.objectContaining({
          status: 'CALL_PENDING',
          eligible: true,
        })
      );
    });

    it('should handle missing seller ID', async () => {
      mockReq.user = {};

      await getSellerOrders(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid seller ID',
        timestamp: expect.any(String)
      });
    });
  });

  describe('updateOrderStatus', () => {
    it('should update order status successfully', async () => {
      const mockProducts = [{ _id: 'product1' }];
      const mockOrder = {
        _id: 'order1',
        items: [{ product: 'product1', price: 100, quantity: 1 }],
        status: 'paid',
        shippingApplicability: 'full',
        updatedAt: new Date(),
        save: jest.fn().mockResolvedValue(true)
      };

      Product.find = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockProducts)
      });

      Order.findById = jest.fn().mockResolvedValue(mockOrder);
      Commission.findOne = jest.fn().mockResolvedValue(null);
      Commission.mockImplementation(() => ({
        save: jest.fn().mockResolvedValue(true)
      }));

      mockReq.params = { orderId: 'order1' };
      mockReq.body = { status: 'processing' };

      await updateOrderStatus(mockReq, mockRes);

      expect(Order.findById).toHaveBeenCalledWith('order1');
      expect(mockOrder.status).toBe('processing');
      expect(mockOrder.save).toHaveBeenCalled();
      expect(sendSuccessResponse).toHaveBeenCalledWith(
        mockRes,
        200,
        'Order status updated successfully',
        expect.objectContaining({
          orderId: 'order1',
          status: 'processing',
          updatedAt: expect.any(Date)
        })
      );
    });

    it('should allow processing to delivered for no-shipping orders', async () => {
      const mockProducts = [{ _id: 'product1' }];
      const mockOrder = {
        _id: 'order1',
        items: [{ product: 'product1', price: 100, quantity: 1, lineShippingApplicability: 'not_applicable' }],
        status: 'processing',
        shippingApplicability: 'none',
        updatedAt: new Date(),
        save: jest.fn().mockResolvedValue(true),
      };

      Product.find = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockProducts),
      });

      Order.findById = jest.fn().mockResolvedValue(mockOrder);

      mockReq.params = { orderId: 'order1' };
      mockReq.body = { status: 'delivered' };

      await updateOrderStatus(mockReq, mockRes);

      expect(mockOrder.status).toBe('delivered');
      expect(sendSuccessResponse).toHaveBeenCalled();
    });

    it('should reject processing to delivered for full shipping orders', async () => {
      const mockProducts = [{ _id: 'product1' }];
      const mockOrder = {
        _id: 'order1',
        items: [{ product: 'product1', price: 100, quantity: 1, lineShippingApplicability: 'applicable' }],
        status: 'processing',
        shippingApplicability: 'full',
        updatedAt: new Date(),
        save: jest.fn().mockResolvedValue(true),
      };

      Product.find = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockProducts),
      });

      Order.findById = jest.fn().mockResolvedValue(mockOrder);

      mockReq.params = { orderId: 'order1' };
      mockReq.body = { status: 'delivered' };

      await updateOrderStatus(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockOrder.save).not.toHaveBeenCalled();
    });

    it('should create commission when order is delivered', async () => {
      const mockProducts = [{ _id: 'product1' }];
      const mockOrder = {
        _id: 'order1',
        items: [{ product: 'product1', price: 100, quantity: 1 }],
        status: 'shipped',
        updatedAt: new Date(),
        save: jest.fn().mockResolvedValue(true)
      };

      Product.find = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockProducts)
      });

      Order.findById = jest.fn().mockResolvedValue(mockOrder);
      Commission.findOne = jest.fn().mockResolvedValue(null);
      
      const mockCommission = {
        save: jest.fn().mockResolvedValue(true)
      };
      Commission.mockImplementation(() => mockCommission);

      // Mock calculateCommission to keep this test DB-independent.
      calculateCommission.mockResolvedValue({
        commissionRate: 10,
        commissionAmount: 10,
        commissionType: 'percentage',
        appliedRule: 'mock_rule',
      });

      // Mock Product.findById(...).select('category')
      Product.findById = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({ category: 'cat1' })
      });

      // Mock SellerLedger lookups + writes so the delivered flow doesn't touch real persistence.
      SellerLedger.findOne = jest.fn().mockReturnValue({
        sort: jest.fn().mockResolvedValue(null)
      });
      SellerLedger.create = jest.fn().mockResolvedValue(true);

      // Force standalone fallback path (avoid replica-set transaction requirements).
      jest.spyOn(mongoose, 'startSession').mockRejectedValue(
        new Error('only allowed on a replica set member or mongos')
      );

      mockReq.params = { orderId: 'order1' };
      mockReq.body = { status: 'delivered' };

      await updateOrderStatus(mockReq, mockRes);

      expect(Commission).toHaveBeenCalledWith({
        order: 'order1',
        seller: 'seller123',
        product: 'product1',
        commissionRate: 10,
        commissionAmount: 10,
        commissionType: 'percentage',
        appliedRule: 'mock_rule',
        status: 'approved',
        category: 'cat1',
        orderAmount: 100,
        period: {
          year: expect.any(Number),
          month: expect.any(Number)
        }
      });
      expect(mockCommission.save).toHaveBeenCalled();
    });

    it('should handle invalid status', async () => {
      const mockProducts = [{ _id: 'product1' }];
      const mockOrder = {
        _id: 'order1',
        items: [{ product: 'product1', price: 100, quantity: 1 }],
        status: 'paid',
        updatedAt: new Date(),
        save: jest.fn().mockResolvedValue(true),
      };

      Product.find = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockProducts)
      });
      Order.findById = jest.fn().mockResolvedValue(mockOrder);

      mockReq.params = { orderId: 'order1' };
      mockReq.body = { status: 'invalid' };

      await updateOrderStatus(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid status value'
      });
    });

    it('should handle order not found', async () => {
      Product.find = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue([{ _id: 'product1' }])
      });

      Order.findById = jest.fn().mockResolvedValue(null);

      mockReq.params = { orderId: 'nonexistent' };
      mockReq.body = { status: 'processing' };

      await updateOrderStatus(mockReq, mockRes);

      expect(sendErrorResponse).toHaveBeenCalledWith(
        mockRes,
        404,
        'Order not found',
        ERROR_CODES.RESOURCE_NOT_FOUND
      );
    });
  });
});