// backend/controllers/dashboardController.js

const { sendErrorResponse, sendSuccessResponse, ERROR_CODES, HTTP_STATUS, asyncHandler } = require('../utils/errorHandler');
const {
  resolveDashboardAccess,
  buildDashboardStatsPayload,
  canViewDashboardActivity,
  canViewSalesAnalytics,
} = require('../utils/dashboardStatsAccess');
const Product = require('../models/Product');
const Seller = require('../models/Seller');
const Shopper = require('../models/Shopper');
const Order = require('../models/Order');
const Admin = require('../models/Admin');
const Commission = require('../models/Commission');

const SUCCESSFUL_SALES_STATUSES = ['paid', 'processing', 'shipped', 'delivered'];

/**
 * Get dashboard statistics scoped to the authenticated admin's module permissions.
 */
exports.getDashboardStats = asyncHandler(async (req, res) => {
  try {
    const access = resolveDashboardAccess(req.adminUser);

    if (!access.hasAnySection) {
      return sendSuccessResponse(
        res,
        HTTP_STATUS.OK,
        "✅ Dashboard statistics retrieved successfully",
        { lastUpdated: new Date().toISOString() }
      );
    }

    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    const endOfYear = new Date(today.getFullYear() + 1, 0, 1);
    const commissionStatusMatch = { status: { $in: ['approved', 'locked', 'paid'] } };

    const queryEntries = [];

    if (access.products) {
      queryEntries.push([
        'productStats',
        Product.aggregate([
          { $match: { status: { $nin: ["draft", "trash"] } } },
          {
            $group: {
              _id: null,
              totalProducts: { $sum: 1 },
              totalStock: { $sum: "$stock" },
              avgPrice: { $avg: "$regularPrice" },
              approvedProducts: {
                $sum: { $cond: [{ $eq: ["$approvalStatus", "approved"] }, 1, 0] }
              },
              pendingProducts: {
                $sum: { $cond: [{ $eq: ["$approvalStatus", "pending"] }, 1, 0] }
              },
              rejectedProducts: {
                $sum: { $cond: [{ $eq: ["$approvalStatus", "rejected"] }, 1, 0] }
              },
              lowStockProducts: {
                $sum: { $cond: [{ $lte: ["$stock", 10] }, 1, 0] }
              }
            }
          }
        ]),
      ]);
    }

    if (access.sellers) {
      queryEntries.push([
        'sellerStats',
        Seller.aggregate([
          {
            $group: {
              _id: null,
              totalSellers: { $sum: 1 },
              approvedSellers: {
                $sum: { $cond: [{ $eq: ["$approvalStatus", "approved"] }, 1, 0] }
              },
              pendingSellers: {
                $sum: { $cond: [{ $eq: ["$approvalStatus", "pending"] }, 1, 0] }
              },
              rejectedSellers: {
                $sum: { $cond: [{ $eq: ["$approvalStatus", "rejected"] }, 1, 0] }
              },
              activeSellers: {
                $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] }
              }
            }
          }
        ]),
      ]);
    }

    if (access.shoppers) {
      queryEntries.push([
        'shopperStats',
        Shopper.aggregate([
          {
            $group: {
              _id: null,
              totalShoppers: { $sum: 1 },
              activeShoppers: {
                $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] }
              },
              verifiedShoppers: {
                $sum: { $cond: [{ $eq: ["$isVerified", true] }, 1, 0] }
              }
            }
          }
        ]),
      ]);
    }

    if (access.needsOrderAggregates) {
      queryEntries.push(
        [
          'orderStats',
          Order.aggregate([
            {
              $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                totalRevenue: {
                  $sum: {
                    $cond: [{ $in: ["$status", SUCCESSFUL_SALES_STATUSES] }, "$totalAmount", 0]
                  }
                },
                avgOrderValue: {
                  $avg: {
                    $cond: [{ $in: ["$status", SUCCESSFUL_SALES_STATUSES] }, "$totalAmount", null]
                  }
                },
                completedOrders: {
                  $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] }
                },
                pendingOrders: {
                  $sum: { $cond: [{ $in: ["$status", ["pending", "pending_verification"]] }, 1, 0] }
                },
                cancelledOrders: {
                  $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] }
                }
              }
            }
          ]),
        ],
        [
          'todayOrderStats',
          Order.aggregate([
            {
              $match: {
                createdAt: { $gte: startOfToday, $lt: endOfToday }
              }
            },
            {
              $group: {
                _id: null,
                todayOrders: { $sum: 1 },
                todayRevenue: {
                  $sum: {
                    $cond: [{ $in: ["$status", SUCCESSFUL_SALES_STATUSES] }, "$totalAmount", 0]
                  }
                }
              }
            }
          ]),
        ],
        [
          'monthlyOrderStats',
          Order.aggregate([
            {
              $match: {
                createdAt: { $gte: startOfMonth, $lt: endOfMonth }
              }
            },
            {
              $group: {
                _id: null,
                monthlyOrders: { $sum: 1 },
                monthlyRevenue: {
                  $sum: {
                    $cond: [{ $in: ["$status", SUCCESSFUL_SALES_STATUSES] }, "$totalAmount", 0]
                  }
                }
              }
            }
          ]),
        ],
        [
          'yearlyOrderStats',
          Order.aggregate([
            {
              $match: {
                createdAt: { $gte: startOfYear, $lt: endOfYear }
              }
            },
            {
              $group: {
                _id: null,
                yearlyOrders: { $sum: 1 },
                yearlyRevenue: {
                  $sum: {
                    $cond: [{ $in: ["$status", SUCCESSFUL_SALES_STATUSES] }, "$totalAmount", 0]
                  }
                }
              }
            }
          ]),
        ]
      );
    }

    if (access.admins) {
      queryEntries.push([
        'adminStats',
        Admin.aggregate([
          {
            $group: {
              _id: null,
              totalAdmins: { $sum: 1 },
              activeAdmins: {
                $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] }
              }
            }
          }
        ]),
      ]);
    }

    const results = await Promise.all(queryEntries.map(([, promise]) => promise));
    const raw = {};
    queryEntries.forEach(([key], index) => {
      raw[key] = results[index];
    });

    const dashboardStats = buildDashboardStatsPayload(raw, access);

    return sendSuccessResponse(
      res,
      HTTP_STATUS.OK,
      "✅ Dashboard statistics retrieved successfully",
      dashboardStats
    );
  } catch (error) {
    console.error("❌ Dashboard stats error:", error);
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      "Failed to fetch dashboard statistics",
      ERROR_CODES.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * Get recent activity for dashboard
 */
exports.getRecentActivity = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const adminUser = req.adminUser;

  const includeOrders = canViewDashboardActivity(adminUser, 'orders');
  const includeProducts = canViewDashboardActivity(adminUser, 'products');
  const includeSellers = canViewDashboardActivity(adminUser, 'sellers');

  if (!includeOrders && !includeProducts && !includeSellers) {
    return sendSuccessResponse(
      res,
      HTTP_STATUS.OK,
      "✅ Recent activity retrieved successfully",
      { activities: [], total: 0 }
    );
  }

  const [recentOrders, recentProducts, recentSellers] = await Promise.all([
    includeOrders
      ? Order.find()
          .populate('buyer', 'firstName lastName email')
          .sort({ createdAt: -1 })
          .limit(limit)
      : Promise.resolve([]),

    includeProducts
      ? Product.find({ status: { $nin: ["draft", "trash"] } })
          .populate('seller', 'shopName')
          .populate('category', 'name')
          .sort({ createdAt: -1 })
          .limit(limit)
      : Promise.resolve([]),

    includeSellers
      ? Seller.find()
          .sort({ createdAt: -1 })
          .limit(limit)
      : Promise.resolve([]),
  ]);

  const recentActivity = {
    orders: recentOrders.map(order => ({
      id: order._id,
      type: 'order',
      title: `New order #${order.orderNumber}`,
      description: `Order from ${order.shopper?.name || 'Unknown'} for ₹${order.totalAmount}`,
      timestamp: order.createdAt,
      status: order.status
    })),
    products: recentProducts.map(product => ({
      id: product._id,
      type: 'product',
      title: `New product: ${product.name}`,
      description: `Added by ${product.seller?.shopName || 'Unknown'} - ₹${product.regularPrice}`,
      timestamp: product.createdAt,
      status: product.approvalStatus
    })),
    sellers: recentSellers.map(seller => ({
      id: seller._id,
      type: 'seller',
      title: `New seller: ${seller.shopName}`,
      description: `Registration from ${seller.ownerName} - ${seller.email}`,
      timestamp: seller.createdAt,
      status: seller.approvalStatus
    }))
  };

  // Combine and sort all activities by timestamp
  const allActivities = [
    ...recentActivity.orders,
    ...recentActivity.products,
    ...recentActivity.sellers
  ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, limit);

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "✅ Recent activity retrieved successfully",
    {
      activities: allActivities,
      total: allActivities.length
    }
  );
});

/**
 * Get sales analytics for charts
 */
exports.getSalesAnalytics = asyncHandler(async (req, res) => {
  if (!canViewSalesAnalytics(req.adminUser)) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.FORBIDDEN,
      "Access denied. Insufficient permissions",
      ERROR_CODES.AUTH_ACCESS_DENIED
    );
  }

  const { period = '30d' } = req.query;

  let startDate;
  const endDate = new Date();

  switch (period) {
    case '7d':
      startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      startDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case '1y':
      startDate = new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  // Get daily sales data
  const salesData = await Order.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
        status: { $in: SUCCESSFUL_SALES_STATUSES }
      }
    },
    {
      $group: {
        _id: {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" },
          day: { $dayOfMonth: "$createdAt" }
        },
        totalRevenue: { $sum: "$totalAmount" },
        orderCount: { $sum: 1 }
      }
    },
    {
      $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 }
    }
  ]);

  // Format data for charts
  const chartData = salesData.map(item => ({
    date: `${item._id.year}-${String(item._id.month).padStart(2, '0')}-${String(item._id.day).padStart(2, '0')}`,
    revenue: item.totalRevenue,
    orders: item.orderCount
  }));

  return sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "✅ Sales analytics retrieved successfully",
    {
      period,
      data: chartData,
      totalRevenue: chartData.reduce((sum, item) => sum + item.revenue, 0),
      totalOrders: chartData.reduce((sum, item) => sum + item.orders, 0)
    }
  );
});
