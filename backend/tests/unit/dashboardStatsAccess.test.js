const {
  resolveDashboardAccess,
  buildDashboardStatsPayload,
  canViewSalesAnalytics,
} = require("../../utils/dashboardStatsAccess");

const superAdmin = { isSuperAdmin: true, permissions: [] };
const catalogStaff = { isSuperAdmin: false, permissions: ["catalog:view"] };
const ordersStaff = { isSuperAdmin: false, permissions: ["orders:view"] };
const financeStaff = { isSuperAdmin: false, permissions: ["finance:view"] };
const emptyStaff = { isSuperAdmin: false, permissions: [] };

const fullRaw = {
  productStats: [{
    totalProducts: 100,
    totalStock: 5000,
    avgPrice: 1500,
    approvedProducts: 80,
    pendingProducts: 15,
    rejectedProducts: 5,
    lowStockProducts: 10,
  }],
  sellerStats: [{ totalSellers: 50, activeSellers: 45, pendingSellers: 3, approvedSellers: 40, rejectedSellers: 2 }],
  shopperStats: [{ totalShoppers: 1000, activeShoppers: 950, verifiedShoppers: 900 }],
  orderStats: [{
    totalOrders: 500,
    totalRevenue: 750000,
    avgOrderValue: 1500,
    completedOrders: 450,
    pendingOrders: 30,
    cancelledOrders: 20,
  }],
  todayOrderStats: [{ todayOrders: 15, todayRevenue: 22500 }],
  monthlyOrderStats: [{ monthlyOrders: 200, monthlyRevenue: 300000 }],
  yearlyOrderStats: [{ yearlyOrders: 500, yearlyRevenue: 750000 }],
  adminStats: [{ totalAdmins: 5, activeAdmins: 4 }],
  commissionTotalStats: [{ total: 12000 }],
  commissionTodayStats: [{ total: 500 }],
  commissionMonthlyStats: [{ total: 4000 }],
};

describe("dashboardStatsAccess", () => {
  describe("resolveDashboardAccess", () => {
    it("grants all sections to Super Admin", () => {
      expect(resolveDashboardAccess(superAdmin)).toMatchObject({
        hasAnySection: true,
        products: true,
        sellers: true,
        shoppers: true,
        orders: true,
        finance: true,
        admins: true,
      });
    });

    it("denies all sections for staff with no permissions", () => {
      expect(resolveDashboardAccess(emptyStaff)).toEqual({
        hasAnySection: false,
        products: false,
        sellers: false,
        shoppers: false,
        orders: false,
        finance: false,
        admins: false,
        needsOrderAggregates: false,
      });
    });

    it("scopes catalog staff to product metrics only", () => {
      expect(resolveDashboardAccess(catalogStaff)).toMatchObject({
        hasAnySection: true,
        products: true,
        sellers: false,
        finance: false,
        needsOrderAggregates: false,
      });
    });
  });

  describe("buildDashboardStatsPayload", () => {
    it("returns the full payload for Super Admin", () => {
      const access = resolveDashboardAccess(superAdmin);
      const payload = buildDashboardStatsPayload(fullRaw, access);

      expect(payload).toHaveProperty("overview.totalProducts", 100);
      expect(payload).toHaveProperty("overview.totalRevenue", 750000);
      expect(payload).toHaveProperty("products.lowStock", 10);
      expect(payload).toHaveProperty("orders.total", 500);
      expect(payload).toHaveProperty("revenue.commission", 0);
      expect(payload).toHaveProperty("admins.total", 5);
    });

    it("omits finance and order sections for catalog staff", () => {
      const access = resolveDashboardAccess(catalogStaff);
      const payload = buildDashboardStatsPayload(fullRaw, access);

      expect(payload).toHaveProperty("products.total", 100);
      expect(payload).toHaveProperty("overview.totalProducts", 100);
      expect(payload.overview).not.toHaveProperty("totalRevenue");
      expect(payload).not.toHaveProperty("orders");
      expect(payload).not.toHaveProperty("revenue");
      expect(payload).not.toHaveProperty("sellers");
    });

    it("omits revenue for orders staff", () => {
      const access = resolveDashboardAccess(ordersStaff);
      const payload = buildDashboardStatsPayload(fullRaw, access);

      expect(payload).toHaveProperty("orders.total", 500);
      expect(payload).toHaveProperty("today.orders", 15);
      expect(payload).not.toHaveProperty("revenue");
      expect(payload.overview).not.toHaveProperty("totalRevenue");
      expect(payload).not.toHaveProperty("products");
    });

    it("omits catalog metrics for finance staff", () => {
      const access = resolveDashboardAccess(financeStaff);
      const payload = buildDashboardStatsPayload(fullRaw, access);

      expect(payload).toHaveProperty("revenue.total", 750000);
      expect(payload).toHaveProperty("today.revenue", 22500);
      expect(payload).not.toHaveProperty("products");
      expect(payload).not.toHaveProperty("orders");
      expect(payload.overview).not.toHaveProperty("totalProducts");
    });
  });

  describe("canViewSalesAnalytics", () => {
    it("allows finance staff and Super Admin only", () => {
      expect(canViewSalesAnalytics(superAdmin)).toBe(true);
      expect(canViewSalesAnalytics(financeStaff)).toBe(true);
      expect(canViewSalesAnalytics(ordersStaff)).toBe(false);
    });
  });
});
