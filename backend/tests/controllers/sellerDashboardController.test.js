const { getSellerDashboardStats, getSellerAnalytics } = require('../../controllers/sellerDashboardController');
const { ERROR_CODES } = require('../../utils/errorHandler');

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

describe('Seller Dashboard Controller', () => {
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

  describe('getSellerDashboardStats', () => {
    it('should return seller dashboard statistics successfully', async () => {
      // Mock Product.find().select() chain to return seller's products
      const mockProducts = [{ _id: 'product1' }, { _id: 'product2' }];
      Product.select.mockResolvedValue(mockProducts);

      // Mock Order.find().populate().populate() chain to return orders
      const mockOrders = [
        {
          _id: 'order1',
          status: 'paid',
          totalAmount: 1000,
          createdAt: new Date(),
          items: [{ product: { _id: 'product1', name: 'Test Product' }, quantity: 1, price: 1000 }],
          buyer: { firstName: 'John', lastName: 'Doe' }
        }
      ];
      Order.sort.mockResolvedValue(mockOrders);

      // Mock Commission.aggregate for pending payouts
      Commission.aggregate.mockResolvedValueOnce([{ total: 500 }]); // pending payouts
      Commission.aggregate.mockResolvedValueOnce([{ total: 2000 }]); // total earnings
      Commission.aggregate.mockResolvedValueOnce([]); // monthly earnings
      Commission.aggregate.mockResolvedValueOnce([]); // commission summary

      await getSellerDashboardStats(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Dashboard statistics retrieved successfully',
          data: expect.objectContaining({
            activeOrders: expect.any(Number),
            pendingPayouts: expect.any(Number),
            totalEarnings: expect.any(Number),
            monthlyEarnings: expect.any(Array),
            recentOrders: expect.any(Array),
            topProducts: expect.any(Array),
            commissionSummary: expect.any(Object)
          })
        })
      );
    });

    it('should return empty stats for seller with no products', async () => {
      // Mock Product.find().select() chain to return empty array
      Product.select.mockResolvedValue([]);

      await getSellerDashboardStats(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            activeOrders: 0,
            pendingPayouts: 0,
            totalEarnings: 0,
            monthlyEarnings: [],
            recentOrders: [],
            topProducts: [],
            commissionSummary: { pending: 0, approved: 0, paid: 0, total: 0 }
          })
        })
      );
    });

    it('should handle database errors gracefully', async () => {
      // Mock Product.find to throw error
      Product.find.mockRejectedValue(new Error('Database error'));

      await getSellerDashboardStats(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Failed to fetch dashboard statistics'
        })
      );
    });
  });

  describe('getSellerAnalytics', () => {
    it('should return seller analytics for default period', async () => {
      // Mock Product.find().select() chain to return seller's products
      const mockProducts = [{ _id: 'product1' }];
      Product.select.mockResolvedValue(mockProducts);

      // Mock Order.find to return orders
      const mockOrders = [
        {
          _id: 'order1',
          totalAmount: 1000,
          createdAt: new Date(),
          items: [{ product: { _id: 'product1' }, quantity: 1, price: 1000 }]
        }
      ];
      Order.find.mockResolvedValue(mockOrders);

      await getSellerAnalytics(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Analytics retrieved successfully',
          data: expect.objectContaining({
            salesTrend: expect.any(Array),
            conversionRate: expect.any(Number),
            averageOrderValue: expect.any(Number),
            totalRevenue: expect.any(Number),
            orderCount: expect.any(Number)
          })
        })
      );
    });

    it('should return analytics for different periods', async () => {
      const periods = ['7d', '30d', '90d', '1y'];
      
      for (const period of periods) {
        mockReq.query.period = period;
        
        // Mock Product.find().select() chain to return seller's products
        Product.select.mockResolvedValue([{ _id: 'product1' }]);
        
        // Mock Order.find to return orders
        Order.find.mockResolvedValue([]);

        await getSellerAnalytics(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(200);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: expect.objectContaining({
              salesTrend: expect.any(Array)
            })
          })
        );
      }
    });

    it('should return empty analytics for seller with no products', async () => {
      // Mock Product.find().select() chain to return empty array
      Product.select.mockResolvedValue([]);

      await getSellerAnalytics(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            salesTrend: [],
            conversionRate: 0,
            averageOrderValue: 0,
            totalRevenue: 0,
            orderCount: 0
          })
        })
      );
    });

    it('should handle database errors gracefully', async () => {
      // Mock Product.find to throw error
      Product.find.mockRejectedValue(new Error('Database error'));

      await getSellerAnalytics(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Failed to fetch analytics'
        })
      );
    });
  });
});
