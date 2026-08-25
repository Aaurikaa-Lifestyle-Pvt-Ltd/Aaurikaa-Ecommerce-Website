const { getDashboardStats, getRecentActivity, getSalesAnalytics } = require('../../controllers/dashboardController');
const { ERROR_CODES } = require('../../utils/errorHandler');

jest.mock('../../models/Product', () => ({
  aggregate: jest.fn(),
  find: jest.fn()
}));

jest.mock('../../models/Seller', () => ({
  aggregate: jest.fn(),
  find: jest.fn()
}));

jest.mock('../../models/Shopper', () => ({
  aggregate: jest.fn()
}));

jest.mock('../../models/Order', () => ({
  aggregate: jest.fn(),
  find: jest.fn()
}));

jest.mock('../../models/Admin', () => ({
  aggregate: jest.fn()
}));

jest.mock('../../models/Commission', () => ({
  aggregate: jest.fn()
}));

const Product = require('../../models/Product');
const Seller = require('../../models/Seller');
const Shopper = require('../../models/Shopper');
const Order = require('../../models/Order');
const Admin = require('../../models/Admin');
const Commission = require('../../models/Commission');

const superAdminUser = { isSuperAdmin: true, permissions: [] };
const catalogStaffUser = { isSuperAdmin: false, permissions: ['catalog:view'] };

const runHandler = async (handler, req, res, next) => {
  handler(req, res, next);
  await new Promise((resolve) => setImmediate(resolve));
};

describe('Dashboard Controller', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = {
      query: {},
      user: { id: 'test-admin-id', role: 'admin' },
      adminUser: superAdminUser,
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe('getDashboardStats', () => {
    it('should return comprehensive dashboard statistics for Super Admin', async () => {
      Product.aggregate.mockResolvedValue([{
        totalProducts: 100,
        totalStock: 5000,
        avgPrice: 1500,
        approvedProducts: 80,
        pendingProducts: 15,
        rejectedProducts: 5,
        lowStockProducts: 10
      }]);
      Seller.aggregate.mockResolvedValue([{
        totalSellers: 50,
        approvedSellers: 40,
        pendingSellers: 3,
        rejectedSellers: 2,
        activeSellers: 45
      }]);
      Shopper.aggregate.mockResolvedValue([{
        totalShoppers: 1000,
        activeShoppers: 950,
        verifiedShoppers: 900
      }]);
      Order.aggregate
        .mockResolvedValueOnce([{
          totalOrders: 500,
          totalRevenue: 750000,
          avgOrderValue: 1500,
          completedOrders: 450,
          pendingOrders: 30,
          cancelledOrders: 20
        }])
        .mockResolvedValueOnce([{ todayOrders: 15, todayRevenue: 22500 }])
        .mockResolvedValueOnce([{ monthlyOrders: 200, monthlyRevenue: 300000 }])
        .mockResolvedValueOnce([{ yearlyOrders: 500, yearlyRevenue: 750000 }]);
      Admin.aggregate.mockResolvedValue([{ totalAdmins: 5, activeAdmins: 4 }]);
      Commission.aggregate
        .mockResolvedValueOnce([{ total: 12000 }])
        .mockResolvedValueOnce([{ total: 500 }])
        .mockResolvedValueOnce([{ total: 4000 }]);

      await runHandler(getDashboardStats, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      const responseData = mockRes.json.mock.calls[0][0];
      expect(responseData.success).toBe(true);
      expect(responseData.data).toHaveProperty('overview');
      expect(responseData.data).toHaveProperty('products');
      expect(responseData.data).toHaveProperty('sellers');
      expect(responseData.data).toHaveProperty('shoppers');
      expect(responseData.data).toHaveProperty('orders');
      expect(responseData.data).toHaveProperty('revenue');
      expect(responseData.data).toHaveProperty('today');
      expect(responseData.data).toHaveProperty('monthly');
      expect(responseData.data).toHaveProperty('yearly');
      expect(responseData.data).toHaveProperty('admins');
      expect(responseData.data).toHaveProperty('lastUpdated');
    });

    it('should return only catalog metrics for catalog staff', async () => {
      mockReq.adminUser = catalogStaffUser;

      Product.aggregate.mockResolvedValue([{
        totalProducts: 25,
        totalStock: 100,
        avgPrice: 500,
        approvedProducts: 20,
        pendingProducts: 5,
        rejectedProducts: 0,
        lowStockProducts: 2
      }]);

      await runHandler(getDashboardStats, mockReq, mockRes, mockNext);

      expect(Product.aggregate).toHaveBeenCalled();
      expect(Seller.aggregate).not.toHaveBeenCalled();
      expect(Order.aggregate).not.toHaveBeenCalled();
      expect(Commission.aggregate).not.toHaveBeenCalled();

      const responseData = mockRes.json.mock.calls[0][0];
      expect(responseData.data).toHaveProperty('products.total', 25);
      expect(responseData.data).not.toHaveProperty('orders');
      expect(responseData.data).not.toHaveProperty('revenue');
      expect(responseData.data.overview).not.toHaveProperty('totalRevenue');
    });

    it('should return only lastUpdated for staff with no permissions', async () => {
      mockReq.adminUser = { isSuperAdmin: false, permissions: [] };

      await runHandler(getDashboardStats, mockReq, mockRes, mockNext);

      expect(Product.aggregate).not.toHaveBeenCalled();
      const responseData = mockRes.json.mock.calls[0][0];
      expect(responseData.data).toEqual({
        lastUpdated: expect.any(String),
      });
    });
  });

  describe('getRecentActivity', () => {
    it('should return recent activity data', async () => {
      const mockOrders = [
        {
          _id: 'order1',
          orderNumber: '12345',
          totalAmount: 5000,
          status: 'completed',
          createdAt: new Date(),
          shopper: { name: 'Test Shopper' }
        }
      ];

      Order.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue(mockOrders)
          })
        })
      });

      Product.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            sort: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([])
            })
          })
        })
      });

      Seller.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([])
        })
      });

      await runHandler(getRecentActivity, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      const responseData = mockRes.json.mock.calls[0][0];
      expect(responseData.data.activities).toHaveLength(1);
    });
  });

  describe('getSalesAnalytics', () => {
    it('should return sales analytics data for finance access', async () => {
      mockReq.adminUser = { isSuperAdmin: false, permissions: ['finance:view'] };

      Order.aggregate.mockResolvedValue([
        {
          _id: { year: 2024, month: 1, day: 1 },
          totalRevenue: 15000,
          orderCount: 10
        }
      ]);

      await runHandler(getSalesAnalytics, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      const responseData = mockRes.json.mock.calls[0][0];
      expect(responseData.data).toHaveProperty('totalRevenue', 15000);
    });

    it('should reject sales analytics without finance permission', async () => {
      mockReq.adminUser = catalogStaffUser;

      await runHandler(getSalesAnalytics, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json.mock.calls[0][0].code).toBe(ERROR_CODES.AUTH_ACCESS_DENIED);
      expect(Order.aggregate).not.toHaveBeenCalled();
    });
  });

  describe('TD-012 Regression Tests — Delivery Statistics Consistency', () => {
    beforeEach(() => {
      mockReq.adminUser = superAdminUser; // Super Admin has access to all domains including finance and orders
    });

    it('should produce identical dashboard stats for manual vs automatic deliveries without Commission records', async () => {
      // Mock static product, seller, shopper, admin data
      Product.aggregate.mockResolvedValue([{ totalProducts: 1, totalStock: 10, avgPrice: 100 }]);
      Seller.aggregate.mockResolvedValue([{ totalSellers: 1 }]);
      Shopper.aggregate.mockResolvedValue([{ totalShoppers: 1 }]);
      Admin.aggregate.mockResolvedValue([{ totalAdmins: 1 }]);

      // Mock aggregates showing one delivered order of ₹1000
      const mockOrderStats = [{
        totalOrders: 1,
        totalRevenue: 1000,
        avgOrderValue: 1000,
        completedOrders: 1, // status: 'delivered'
        pendingOrders: 0,
        cancelledOrders: 0
      }];
      const mockTodayStats = [{ todayOrders: 1, todayRevenue: 1000 }];
      const mockMonthlyStats = [{ monthlyOrders: 1, monthlyRevenue: 1000 }];
      const mockYearlyStats = [{ yearlyOrders: 1, yearlyRevenue: 1000 }];

      // Scenario 1: Manual Delivery
      // The order is marked delivered manually by admin/seller. In this scenario, the database Order document status becomes 'delivered'.
      Order.aggregate
        .mockResolvedValueOnce(mockOrderStats)
        .mockResolvedValueOnce(mockTodayStats)
        .mockResolvedValueOnce(mockMonthlyStats)
        .mockResolvedValueOnce(mockYearlyStats);

      const resManual = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };
      await runHandler(getDashboardStats, mockReq, resManual, mockNext);

      const manualData = resManual.json.mock.calls[0][0].data;

      // Scenario 2: Automatic Delivery (via Shiprocket Poller)
      // The order is marked delivered automatically. The database Order document status becomes 'delivered'.
      // Reset mocks for a fresh run
      jest.clearAllMocks();
      Product.aggregate.mockResolvedValue([{ totalProducts: 1, totalStock: 10, avgPrice: 100 }]);
      Seller.aggregate.mockResolvedValue([{ totalSellers: 1 }]);
      Shopper.aggregate.mockResolvedValue([{ totalShoppers: 1 }]);
      Admin.aggregate.mockResolvedValue([{ totalAdmins: 1 }]);

      Order.aggregate
        .mockResolvedValueOnce(mockOrderStats)
        .mockResolvedValueOnce(mockTodayStats)
        .mockResolvedValueOnce(mockMonthlyStats)
        .mockResolvedValueOnce(mockYearlyStats);

      const resAutomatic = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };
      await runHandler(getDashboardStats, mockReq, resAutomatic, mockNext);

      const automaticData = resAutomatic.json.mock.calls[0][0].data;

      // Assertions
      // 1. Proves both manual and automatic delivery stats are identical
      expect(manualData.overview.totalRevenue).toBe(1000);
      expect(automaticData.overview.totalRevenue).toBe(1000);
      expect(manualData.orders.completed).toBe(1);
      expect(automaticData.orders.completed).toBe(1);
      expect(manualData.revenue.total).toBe(1000);
      expect(automaticData.revenue.total).toBe(1000);
      expect(manualData.today.revenue).toBe(1000);
      expect(automaticData.today.revenue).toBe(1000);

      // Deep equality of stats payload for both paths (ignoring slight timestamp variation in lastUpdated)
      manualData.lastUpdated = 'fixed-timestamp';
      automaticData.lastUpdated = 'fixed-timestamp';
      expect(automaticData).toEqual(manualData);

      // 2. Proves Commission records are ignored and commission fields are returned as 0
      expect(Commission.aggregate).not.toHaveBeenCalled();
      expect(manualData.overview.totalCommission).toBe(0);
      expect(automaticData.overview.totalCommission).toBe(0);
      expect(manualData.revenue.commission).toBe(0);
      expect(automaticData.revenue.commission).toBe(0);
      expect(manualData.today.commission).toBe(0);
      expect(automaticData.today.commission).toBe(0);
      expect(manualData.monthly.commission).toBe(0);
      expect(automaticData.monthly.commission).toBe(0);
    });
  });
});
