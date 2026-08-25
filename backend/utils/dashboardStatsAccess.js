const { hasPermission } = require("./adminPermissions");

const canViewDomain = (adminUser, domain) => {
  if (!adminUser) return false;
  if (adminUser.isSuperAdmin) return true;
  return hasPermission(adminUser, domain, "view");
};

/**
 * Resolve which dashboard stat sections an admin may receive.
 * Mirrors frontend widget permissions in frontend/config/adminDashboard.js.
 */
const resolveDashboardAccess = (adminUser) => {
  if (adminUser?.isSuperAdmin) {
    return {
      hasAnySection: true,
      products: true,
      sellers: true,
      shoppers: true,
      orders: true,
      finance: true,
      admins: true,
      needsOrderAggregates: true,
    };
  }

  const products = canViewDomain(adminUser, "catalog");
  const sellers = canViewDomain(adminUser, "sellers");
  const shoppers = canViewDomain(adminUser, "shoppers");
  const orders = canViewDomain(adminUser, "orders");
  const finance = canViewDomain(adminUser, "finance");

  return {
    hasAnySection: products || sellers || shoppers || orders || finance,
    products,
    sellers,
    shoppers,
    orders,
    finance,
    admins: false,
    needsOrderAggregates: orders || finance,
  };
};

const buildDashboardStatsPayload = (raw, access) => {
  const productData = raw.productStats?.[0] || {};
  const sellerData = raw.sellerStats?.[0] || {};
  const shopperData = raw.shopperStats?.[0] || {};
  const orderData = raw.orderStats?.[0] || {};
  const todayData = raw.todayOrderStats?.[0] || {};
  const monthlyData = raw.monthlyOrderStats?.[0] || {};
  const yearlyData = raw.yearlyOrderStats?.[0] || {};
  const adminData = raw.adminStats?.[0] || {};
  const totalCommission = 0;
  const todayCommission = 0;
  const monthlyCommission = 0;

  const payload = {
    lastUpdated: new Date().toISOString(),
  };

  if (access.products) {
    payload.overview = {
      ...(payload.overview || {}),
      totalProducts: productData.totalProducts || 0,
    };
    payload.products = {
      total: productData.totalProducts || 0,
      approved: productData.approvedProducts || 0,
      pending: productData.pendingProducts || 0,
      rejected: productData.rejectedProducts || 0,
      lowStock: productData.lowStockProducts || 0,
      totalStock: productData.totalStock || 0,
      avgPrice: Math.round(productData.avgPrice || 0),
    };
  }

  if (access.sellers) {
    payload.overview = {
      ...(payload.overview || {}),
      totalSellers: sellerData.totalSellers || 0,
    };
    payload.sellers = {
      total: sellerData.totalSellers || 0,
      approved: sellerData.approvedSellers || 0,
      pending: sellerData.pendingSellers || 0,
      rejected: sellerData.rejectedSellers || 0,
      active: sellerData.activeSellers || 0,
    };
  }

  if (access.shoppers) {
    payload.overview = {
      ...(payload.overview || {}),
      totalShoppers: shopperData.totalShoppers || 0,
    };
    payload.shoppers = {
      total: shopperData.totalShoppers || 0,
      active: shopperData.activeShoppers || 0,
      verified: shopperData.verifiedShoppers || 0,
    };
  }

  if (access.orders) {
    payload.overview = {
      ...(payload.overview || {}),
      totalOrders: orderData.totalOrders || 0,
    };
    payload.orders = {
      total: orderData.totalOrders || 0,
      completed: orderData.completedOrders || 0,
      pending: orderData.pendingOrders || 0,
      cancelled: orderData.cancelledOrders || 0,
      avgOrderValue: Math.round(orderData.avgOrderValue || 0),
    };
    payload.today = {
      ...(payload.today || {}),
      orders: todayData.todayOrders || 0,
    };
    payload.monthly = {
      ...(payload.monthly || {}),
      orders: monthlyData.monthlyOrders || 0,
    };
    payload.yearly = {
      ...(payload.yearly || {}),
      orders: yearlyData.yearlyOrders || 0,
    };
  }

  if (access.finance) {
    payload.overview = {
      ...(payload.overview || {}),
      totalRevenue: orderData.totalRevenue || 0,
      totalCommission,
    };
    payload.revenue = {
      total: orderData.totalRevenue || 0,
      today: todayData.todayRevenue || 0,
      monthly: monthlyData.monthlyRevenue || 0,
      yearly: yearlyData.yearlyRevenue || 0,
      commission: totalCommission,
    };
    payload.today = {
      ...(payload.today || {}),
      revenue: todayData.todayRevenue || 0,
      commission: todayCommission,
      orders: todayData.todayOrders || 0,
    };
    payload.monthly = {
      ...(payload.monthly || {}),
      revenue: monthlyData.monthlyRevenue || 0,
      commission: monthlyCommission,
      orders: monthlyData.monthlyOrders || 0,
    };
    payload.yearly = {
      ...(payload.yearly || {}),
      revenue: yearlyData.yearlyRevenue || 0,
    };
  }

  if (access.admins) {
    payload.overview = {
      ...(payload.overview || {}),
      totalAdmins: adminData.totalAdmins || 0,
    };
    payload.admins = {
      total: adminData.totalAdmins || 0,
      active: adminData.activeAdmins || 0,
    };
  }

  return payload;
};

const canViewDashboardActivity = (adminUser, type) => {
  if (type === "orders") return canViewDomain(adminUser, "orders");
  if (type === "products") return canViewDomain(adminUser, "catalog");
  if (type === "sellers") return canViewDomain(adminUser, "sellers");
  return false;
};

const canViewSalesAnalytics = (adminUser) => canViewDomain(adminUser, "finance");

module.exports = {
  resolveDashboardAccess,
  buildDashboardStatsPayload,
  canViewDashboardActivity,
  canViewSalesAnalytics,
};
