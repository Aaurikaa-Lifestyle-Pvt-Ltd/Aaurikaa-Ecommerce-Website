const { getSellerDashboardStats, getSellerAnalytics } = require('../../controllers/sellerDashboardController');
const { ERROR_CODES, HTTP_STATUS } = require('../../utils/errorHandler');

// Mock the models at the module level
jest.mock('../../models/Product', () => ({
  find: jest.fn().mockReturnThis(),
  aggregate: jest.fn(),
  select: jest.fn().mockReturnThis()
}));

jest.mock('../../models/Order', () => ({
  find: jest.fn().mockReturnThis(),
  aggregate: jest.fn(),
  populate: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis()
}));

jest.mock('../../models/Commission', () => ({
  aggregate: jest.fn(),
  find: jest.fn().mockReturnThis(),
  populate: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis()
}));

jest.mock('../../models/Seller', () => ({
  find: jest.fn().mockReturnThis(),
  aggregate: jest.fn(),
  select: jest.fn().mockReturnThis()
}));

const Product = require('../../models/Product');
const Order = require('../../models/Order');
const Commission = require('../../models/Commission');
const Seller = require('../../models/Seller');

describe('Seller Dashboard Error Handling', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = {
      user: { _id: 'test-seller-id' },
      query: {}
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    mockNext = jest.fn();

    // Clear all mocks but keep implementations
    jest.clearAllMocks();
  });

  describe('getSellerDashboardStats Error Handling', () => {
    it('should handle missing seller ID', async () => {
      mockReq.user = {};

      await getSellerDashboardStats(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.BAD_REQUEST);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Invalid seller ID',
          timestamp: expect.any(String)
        })
      );
    });

    it('should handle database error when fetching products', async () => {
      Product.find.mockReturnValue({
        select: jest.fn().mockRejectedValue(new Error('Database connection failed'))
      });

      await getSellerDashboardStats(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Failed to fetch seller products',
          code: ERROR_CODES.DATABASE_ERROR
        })
      );
    });

    it('should handle database error when fetching orders', async () => {
      Product.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([{ _id: 'product1' }])
      });
      Order.find.mockReturnValue({
        populate: jest.fn().mockRejectedValue(new Error('Database timeout'))
      });

      await getSellerDashboardStats(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Failed to fetch orders',
          code: ERROR_CODES.DATABASE_ERROR,
          timestamp: expect.any(String)
        })
      );
    });

    it('should handle database error when fetching pending commissions', async () => {
      Product.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([{ _id: 'product1' }])
      });
      Order.find.mockRejectedValue(new Error('Orders query failed'));

      await getSellerDashboardStats(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Failed to fetch orders',
          code: ERROR_CODES.DATABASE_ERROR,
          timestamp: expect.any(String)
        })
      );
    });

    it('should handle database error when fetching total commissions', async () => {
      Product.select.mockResolvedValue([{ _id: 'product1' }]);
      Order.find.mockResolvedValue([]);
      Order.populate.mockResolvedValue([]);
      Order.sort.mockResolvedValue([]);
      Commission.aggregate.mockResolvedValueOnce([]); // pending commissions
      Commission.aggregate.mockRejectedValueOnce(new Error('Total commission query failed'));

      await getSellerDashboardStats(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Failed to fetch commission data',
          code: ERROR_CODES.DATABASE_ERROR,
          timestamp: expect.any(String)
        })
      );
    });

    it('should continue with empty monthly earnings on database error', async () => {
      Product.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([{ _id: 'product1' }])
      });
      Order.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue([])
        })
      });
      Commission.aggregate
        .mockResolvedValueOnce([]) // pending commissions
        .mockResolvedValueOnce([]) // total commissions
        .mockRejectedValueOnce(new Error('Monthly earnings query failed')) // monthly earnings
        .mockResolvedValueOnce([]); // commission summary

      await getSellerDashboardStats(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            monthlyEarnings: expect.arrayContaining([
              expect.objectContaining({ month: expect.any(String), earnings: 0 })
            ])
          }),
          timestamp: expect.any(String)
        })
      );
    });

    it('should continue with empty commission summary on database error', async () => {
      Product.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([{ _id: 'product1' }])
      });
      Order.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue([])
        })
      });
      Commission.aggregate.mockResolvedValueOnce([]); // pending commissions
      Commission.aggregate.mockResolvedValueOnce([]); // total commissions
      Commission.aggregate.mockResolvedValue([]); // monthly earnings (6 times)
      Commission.aggregate.mockRejectedValueOnce(new Error('Commission summary query failed'));

      await getSellerDashboardStats(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            commissionSummary: { pending: 0, approved: 0, paid: 0, total: 0 }
          }),
          timestamp: expect.any(String)
        })
      );
    });
  });

  describe('getSellerAnalytics Error Handling', () => {
    it('should handle missing seller ID', async () => {
      mockReq.user = {};

      await getSellerAnalytics(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.BAD_REQUEST);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Invalid seller ID',
          timestamp: expect.any(String)
        })
      );
    });

    it('should handle invalid period parameter', async () => {
      mockReq.query.period = 'invalid';

      await getSellerAnalytics(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.BAD_REQUEST);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Invalid period parameter',
          timestamp: expect.any(String)
        })
      );
    });

    it('should handle database error when fetching products for analytics', async () => {
      Product.find.mockReturnValue({
        select: jest.fn().mockRejectedValue(new Error('Analytics product query failed'))
      });

      await getSellerAnalytics(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Failed to fetch seller products',
          code: ERROR_CODES.DATABASE_ERROR
        })
      );
    });

    it('should handle database error when fetching orders for analytics', async () => {
      Product.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([{ _id: 'product1' }])
      });
      Order.find.mockRejectedValue(new Error('Analytics order query failed'));

      await getSellerAnalytics(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Failed to fetch orders',
          code: ERROR_CODES.DATABASE_ERROR,
          timestamp: expect.any(String)
        })
      );
    });

    it('should return empty analytics for seller with no products', async () => {
      Product.select.mockResolvedValue([]);

      await getSellerAnalytics(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            salesTrend: [],
            conversionRate: 0,
            averageOrderValue: 0,
            totalRevenue: 0,
            orderCount: 0
          }),
          timestamp: expect.any(String)
        })
      );
    });

    it('should handle different valid period parameters', async () => {
      const periods = ['7d', '30d', '90d', '1y'];
      
      for (const period of periods) {
        mockReq.query.period = period;
        Product.find.mockReturnValue({
          select: jest.fn().mockResolvedValue([{ _id: 'product1' }])
        });
        Order.find.mockResolvedValue([]);

        await getSellerAnalytics(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: expect.objectContaining({
              salesTrend: expect.any(Array)
            }),
            timestamp: expect.any(String)
          })
        );
      }
    });
  });

  describe('General Error Handling', () => {
    it('should handle unexpected errors gracefully', async () => {
      // Mock an unexpected error
      Product.find.mockReturnValue({
        select: jest.fn().mockImplementation(() => {
          throw new Error('Unexpected error');
        })
      });

      await getSellerDashboardStats(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Failed to fetch seller products',
          code: ERROR_CODES.DATABASE_ERROR,
          timestamp: expect.any(String)
        })
      );
    });

    it('should provide detailed error logging', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      Product.select.mockRejectedValue(new Error('Database connection lost'));

      await getSellerDashboardStats(mockReq, mockRes);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Database error fetching seller products:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });
});
