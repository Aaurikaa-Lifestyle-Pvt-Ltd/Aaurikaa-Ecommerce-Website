const mongoose = require("mongoose");
const Order = require("../models/Order");
const Product = require("../models/Product");
const Commission = require("../models/Commission");
const Seller = require("../models/Seller");
const SellerLedger = require("../models/SellerLedger");
const Payout = require("../models/Payout");
const { sendErrorResponse, sendSuccessResponse, ERROR_MESSAGES, ERROR_CODES, HTTP_STATUS, asyncHandler } = require("../utils/errorHandler");
const { calculateSellerRevenue, getPricingSummary } = require("../utils/discountCalculator");
const { calculateCommission, syncDeliveries } = require("../utils/calculateCommission");

// =========================
// 📊 Get Seller Dashboard Statistics
// =========================
exports.getSellerDashboardStats = asyncHandler(async (req, res) => {
  try {
    const sellerId = req.user._id;

    // Validate seller ID
    if (!sellerId) {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "Invalid seller ID", ERROR_CODES.INVALID_INPUT);
    }

    const sellerObjectId = new mongoose.Types.ObjectId(sellerId.toString());
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    // Get seller's products with error handling
    let sellerProducts;
    try {
      sellerProducts = await Product.find({ seller: sellerId }).select('_id');
    } catch (dbError) {
      console.error("Database error fetching seller products:", dbError);
      return sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "Failed to fetch seller products", ERROR_CODES.DATABASE_ERROR);
    }

    const productIds = sellerProducts.map(p => p._id);

    // ✅ Sync delivered orders BEFORE reading balance (backfills commission + ledger for orders
    // marked delivered via admin/Shiprocket that never ran the seller status-update flow)
    if (productIds.length > 0) {
      await syncDeliveries(sellerId, productIds).catch(err => console.error("Sync Error:", err));
    }

    // Get Authoritative Balance from Ledger (after sync so delivered orders are included)
    const lastLedgerEntry = await SellerLedger.findOne({ seller: sellerId })
      .sort({ createdAt: -1 });
    const withdrawableBalance = lastLedgerEntry ? lastLedgerEntry.balanceAfter : 0;

    const activePayoutsResult = await Payout.aggregate([
      { $match: { seller: sellerObjectId, status: { $in: ['pending', 'approved'] } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const pendingPayouts = activePayoutsResult.length > 0 ? activePayoutsResult[0].total : 0;

    if (productIds.length === 0) {
      return sendSuccessResponse(res, HTTP_STATUS.OK, "Dashboard statistics retrieved", {
        activeOrders: 0,
        deliveredOrders: 0,
        withdrawableBalance,
        pendingPayouts,
        totalEarnings: 0,
        monthlyEarnings: [],
        recentOrders: [],
        topProducts: [],
        commissionSummary: { pending: 0, approved: 0, paid: 0, total: 0 }
      });
    }

    // Get orders for seller's products with error handling
    let orders;
    try {
      orders = await Order.find({
        'items.product': { $in: productIds }
      }).populate('items.product', 'name seller sku').populate('buyer', 'firstName lastName email');
    } catch (dbError) {
      console.error("Database error fetching orders:", dbError);
      return sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "Failed to fetch orders", ERROR_CODES.DATABASE_ERROR);
    }

    // Calculate order counts by status (case-insensitive)
    const activeOrders = orders.filter(order => {
      const status = (order.status || '').toLowerCase();
      return ['pending_verification', 'paid', 'processing', 'shipped'].includes(status);
    }).length;

    const deliveredOrders = orders.filter(order => {
      const status = (order.status || '').toLowerCase();
      return status === 'delivered';
    }).length;

    // Total EARNINGS = seller net (orderAmount - commissionAmount), not admin commission
    let totalCommissions;
    try {
      totalCommissions = await Commission.aggregate([
        { $match: { seller: sellerObjectId, status: { $in: ['pending', 'approved', 'locked', 'paid'] } } },
        { $group: { _id: null, total: { $sum: { $subtract: ['$orderAmount', '$commissionAmount'] } } } }
      ]);
    } catch (dbError) {
      console.error("Database error fetching total commissions:", dbError);
      return sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "Failed to fetch commission data", ERROR_CODES.DATABASE_ERROR);
    }

    const totalEarnings = totalCommissions.length > 0 ? totalCommissions[0].total : 0;

    // Calculate monthly earnings for the last 6 months with error handling
    const monthlyEarnings = [];
    try {
      for (let i = 5; i >= 0; i--) {
        const date = new Date(currentYear, currentMonth - 1 - i, 1);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const monthName = date.toLocaleString('default', { month: 'short' });

        const monthCommissions = await Commission.aggregate([
          {
            $match: {
              seller: sellerObjectId,
              'period.year': year,
              'period.month': month,
              status: { $in: ['pending', 'approved', 'locked', 'paid'] }
            }
          },
          { $group: { _id: null, total: { $sum: { $subtract: ['$orderAmount', '$commissionAmount'] } } } }
        ]);

        monthlyEarnings.push({
          month: monthName,
          earnings: monthCommissions.length > 0 ? monthCommissions[0].total : 0
        });
      }
    } catch (dbError) {
      console.error("Database error fetching monthly earnings:", dbError);
      // Continue with empty monthly earnings rather than failing completely
      for (let i = 5; i >= 0; i--) {
        const date = new Date(currentYear, currentMonth - 1 - i, 1);
        const monthName = date.toLocaleString('default', { month: 'short' });
        monthlyEarnings.push({
          month: monthName,
          earnings: 0
        });
      }
    }

    // Get recent orders (last 5)
    // Skip items whose product was hard-deleted (populate returns null)
    const recentOrders = orders
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5)
      .map(order => {
        // Calculate the total for THIS seller's items in this order
        const sellerItems = order.items.filter(item =>
          item.product &&
          productIds.some(pid => pid.toString() === item.product._id.toString())
        );
        const sellerTotal = sellerItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        return {
          id: order._id,
          orderNumber: order.invoiceNumber || order._id.toString().slice(-8),
          buyer: order.buyer ? `${order.buyer.firstName} ${order.buyer.lastName}` : 'Unknown',
          totalAmount: sellerTotal, // Seller-specific total
          fullOrderTotal: order.totalAmount,
          status: order.status,
          createdAt: order.createdAt,
          items: sellerItems
        };
      });

    // Get top products by order count
    // Skip items whose product was hard-deleted (populate returns null)
    const productOrderCounts = {};
    orders.forEach(order => {
      order.items.forEach(item => {
        if (!item.product || !item.product._id) return;
        const isSellerProduct = productIds.some(pid => pid.toString() === item.product._id.toString());
        if (isSellerProduct) {
          const productId = item.product._id.toString();
          if (!productOrderCounts[productId]) {
            productOrderCounts[productId] = {
              product: item.product,
              count: 0,
              revenue: 0
            };
          }
          productOrderCounts[productId].count += item.quantity;
          // Use standardized revenue calculation
          const itemRevenue = (item.product?.salePrice || item.price) * item.quantity;
          productOrderCounts[productId].revenue += itemRevenue;
        }
      });
    });

    const topProducts = Object.values(productOrderCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(item => ({
        id: item.product._id,
        name: item.product.name,
        sku: item.product.sku,
        orderCount: item.count,
        revenue: item.revenue
      }));

    // Get Paid Payouts (authoritative sum of successful transfers)
    const paidPayoutsResult = await Payout.aggregate([
      { $match: { seller: sellerObjectId, status: 'paid' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const lifetimePaid = paidPayoutsResult.length > 0 ? paidPayoutsResult[0].total : 0;

    // Get commission summary with error handling
    let commissionSummary;
    try {
      commissionSummary = await Commission.aggregate([
        { $match: { seller: sellerObjectId } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            total: { $sum: '$commissionAmount' }
          }
        }
      ]);
    } catch (dbError) {
      console.error("Database error fetching commission summary:", dbError);
      commissionSummary = [];
    }

    // Prepare intuitive summary for the user
    // We use authoritative sources for the buckets rather than just status grouping
    // because a single commission can be partially covered by a payout
    const summary = {
      pending: 0,
      approved: withdrawableBalance, // What they can actually take out now
      locked: pendingPayouts,        // What they already asked for
      paid: lifetimePaid,            // What they actually received
      total: totalEarnings           // Lifetime seller net earnings (orderAmount - commission)
    };

    // If there ARE pending commissions (from future logic or edge cases), add them
    const pendingComm = commissionSummary.find(item => item._id === 'pending');
    if (pendingComm) {
      summary.pending = pendingComm.total;
    }

    const dashboardData = {
      activeOrders,
      deliveredOrders,
      withdrawableBalance,
      pendingPayouts,
      totalEarnings,
      monthlyEarnings,
      recentOrders,
      topProducts,
      commissionSummary: summary
    };

    sendSuccessResponse(res, HTTP_STATUS.OK, "Dashboard statistics retrieved successfully", dashboardData);

  } catch (error) {
    console.error("Dashboard stats error:", error);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "Failed to fetch dashboard statistics", ERROR_CODES.INTERNAL_ERROR);
  }
});

// =========================
// 📈 Get Seller Analytics (Extended)
// =========================
exports.getSellerAnalytics = asyncHandler(async (req, res) => {
  try {
    const sellerId = req.user._id;
    const { period = '30d' } = req.query; // 7d, 30d, 90d, 1y

    // Validate seller ID
    if (!sellerId) {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "Invalid seller ID", ERROR_CODES.INVALID_INPUT);
    }

    // Validate period parameter
    const validPeriods = ['7d', '30d', '90d', '1y'];
    if (!validPeriods.includes(period)) {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "Invalid period parameter", ERROR_CODES.INVALID_INPUT);
    }

    // Calculate date range
    const now = new Date();
    let startDate;

    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get seller's products with error handling
    let sellerProducts;
    try {
      sellerProducts = await Product.find({ seller: sellerId }).select('_id');
    } catch (dbError) {
      console.error("Database error fetching seller products for analytics:", dbError);
      return sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "Failed to fetch seller products", ERROR_CODES.DATABASE_ERROR);
    }

    const productIds = sellerProducts.map(p => p._id);

    if (productIds.length === 0) {
      return sendSuccessResponse(res, HTTP_STATUS.OK, "Analytics retrieved", {
        salesTrend: [],
        conversionRate: 0,
        averageOrderValue: 0,
        totalRevenue: 0,
        orderCount: 0
      });
    }

    // Get orders in date range with error handling
    let orders;
    try {
      orders = await Order.find({
        'items.product': { $in: productIds },
        createdAt: { $gte: startDate }
      });
    } catch (dbError) {
      console.error("Database error fetching orders for analytics:", dbError);
      return sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "Failed to fetch orders", ERROR_CODES.DATABASE_ERROR);
    }

    // Calculate analytics
    // Use standardized pricing summary for total revenue
    const pricingSummary = getPricingSummary(orders, sellerId);
    const totalRevenue = pricingSummary.totalRevenue;

    const orderCount = orders.length;
    const averageOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;

    // Sales trend (daily for 7d, weekly for others)
    const salesTrend = [];
    const interval = period === '7d' ? 1 : 7; // days

    for (let i = 0; i < (period === '7d' ? 7 : Math.ceil((now - startDate) / (7 * 24 * 60 * 60 * 1000))); i++) {
      const date = new Date(startDate.getTime() + i * interval * 24 * 60 * 60 * 1000);
      const nextDate = new Date(date.getTime() + interval * 24 * 60 * 60 * 1000);

      const periodOrders = orders.filter(order =>
        order.createdAt >= date && order.createdAt < nextDate
      );

      // Use standardized pricing summary for period revenue
      const periodPricingSummary = getPricingSummary(periodOrders, sellerId);
      const periodRevenue = periodPricingSummary.totalRevenue;

      salesTrend.push({
        date: date.toISOString().split('T')[0],
        revenue: periodRevenue,
        orders: periodOrders.length
      });
    }

    const analytics = {
      salesTrend,
      conversionRate: 0, // TODO: Implement conversion rate calculation
      averageOrderValue,
      totalRevenue,
      orderCount
    };

    sendSuccessResponse(res, HTTP_STATUS.OK, "Analytics retrieved successfully", analytics);

  } catch (error) {
    console.error("Analytics error:", error);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "Failed to fetch analytics", ERROR_CODES.INTERNAL_ERROR);
  }
});
