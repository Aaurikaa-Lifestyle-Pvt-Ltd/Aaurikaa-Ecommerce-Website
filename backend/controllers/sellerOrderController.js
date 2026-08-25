const Order = require("../models/Order");
const Product = require("../models/Product");
const Commission = require("../models/Commission");
const SellerLedger = require("../models/SellerLedger");
const pickupLocationService = require("../services/pickupLocationService");
const orderFulfillmentService = require("../services/orderFulfillmentService");
const { sendErrorResponse, sendSuccessResponse, ERROR_MESSAGES, ERROR_CODES, HTTP_STATUS, asyncHandler } = require("../utils/errorHandler");
const { calculateCommission } = require("../utils/calculateCommission");
const { validateSellerLedgerIntegrity } = require("../utils/financialIntegrityValidator");
const mongoose = require("mongoose");
const { toPaymentVisibilityDTO } = require("../services/paymentVisibilityService");
const { buildManualConfirmationMapForOrders } = require("../services/manualConfirmationService");
const {
  isAllowedStatusTransition,
  requiresTrackingForStatus,
  buildSellerFulfillmentDTO,
  orderRequiresShipping,
} = require("../utils/orderFulfillmentGuards");
const ReturnRequest = require("../models/ReturnRequest");
const { loadAfterSalesSummaryMapByOrderIds } = require("../utils/afterSalesListingSummary");

const normalizeApiStatus = (status) => {
  if (status === null || status === undefined) return status;
  if (typeof status !== "string") return status;

  const v = status.trim();
  const lower = v.toLowerCase();

  if (lower === "pending_verification") return "pending_verification";
  if (lower === "pending") return "pending";
  if (lower === "paid") return "paid";
  if (lower === "processing") return "processing";
  if (lower === "shipped") return "shipped";
  if (lower === "delivered") return "delivered";
  if (lower === "cancelled" || lower === "canceled") return "cancelled";
  if (lower === "failed") return "failed";

  // Unknown values will be rejected by later validation.
  return v;
};

// =========================
// 📦 Get Seller Orders
// =========================
exports.getSellerOrders = asyncHandler(async (req, res) => {
  try {
    const sellerId = req.user._id;

    if (!sellerId) {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "Invalid seller ID", ERROR_CODES.INVALID_INPUT);
    }

    // Get seller's products
    const sellerProducts = await Product.find({ seller: sellerId }).select('_id');
    const productIds = sellerProducts.map(p => p._id.toString());

    if (productIds.length === 0) {
      return sendSuccessResponse(res, HTTP_STATUS.OK, "No products found for seller", {
        orders: [],
        count: 0
      });
    }

    // Get orders containing seller's products
    const orders = await Order.find({
      'items.product': { $in: sellerProducts.map(p => p._id) }
    })
      .populate('buyer', 'firstName lastName email phone')
      .populate({
        path: 'items.product',
        select: 'name title price salePrice seller sku',
        model: 'Product'
      })
      .sort({ createdAt: -1 });

    const manualConfirmationMap = await buildManualConfirmationMapForOrders(orders);
    const afterSalesMap = await loadAfterSalesSummaryMapByOrderIds(
      orders.map((o) => o._id),
      ReturnRequest
    );

    // Filter orders to only include seller's items
    const sellerOrders = orders.map(order => {
      const sellerItems = order.items
        .filter(item => {
          let itemProductId;
          if (!item.product) return false;
          if (item.product._id) {
            itemProductId = item.product._id.toString();
          } else if (item.product.toString) {
            itemProductId = item.product.toString();
          } else {
            return false;
          }
          return productIds.includes(itemProductId);
        })
        .map(item => {
          let itemObj;
          if (typeof item.toObject === 'function') {
            itemObj = item.toObject();
          } else {
            itemObj = { ...item };
          }

          if (item.product && typeof item.product === 'object' && item.product._id) {
            itemObj.product = {
              _id: item.product._id,
              name: item.product.name || item.product.title || 'Product',
              sku: item.product.sku || null
            };
          }
          return itemObj;
        });

      const sellerRevenue = sellerItems.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 0)), 0);
      const orderObj = order.toObject();

      return {
        ...orderObj,
        items: sellerItems,
        totalAmount: sellerRevenue,
        paymentVisibility: toPaymentVisibilityDTO(order),
        manualConfirmation: manualConfirmationMap.get(String(order._id)) || {
          status: null,
          eligible: false,
        },
        sellerFulfillment: buildSellerFulfillmentDTO(orderObj, productIds),
        afterSales: afterSalesMap.get(String(order._id)) || null,
      };
    }).filter(order => order.items && order.items.length > 0);

    sendSuccessResponse(res, HTTP_STATUS.OK, "Seller orders retrieved successfully", {
      orders: sellerOrders,
      count: sellerOrders.length
    });

  } catch (error) {
    console.error("Get seller orders error:", error);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "Failed to retrieve seller orders", ERROR_CODES.INTERNAL_ERROR);
  }
});

// =========================
// 🔄 Update Order Status
// =========================
exports.updateOrderStatus = asyncHandler(async (req, res) => {
  try {
    const sellerId = req.user._id;
    const { orderId } = req.params;
    const { status, trackingNumber, notes } = req.body;

    if (!sellerId) {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "Invalid seller ID", ERROR_CODES.INVALID_INPUT);
    }

    const sellerProducts = await Product.find({ seller: sellerId }).select('_id');
    const productIds = sellerProducts.map(p => p._id.toString());

    const order = await Order.findById(orderId);
    if (!order) {
      return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, "Order not found", ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    const hasSellerProducts = order.items.some(item =>
      productIds.includes(item.product.toString())
    );

    if (!hasSellerProducts) {
      return sendErrorResponse(res, HTTP_STATUS.FORBIDDEN, "This order does not contain your products", ERROR_CODES.ACCESS_DENIED);
    }

    if (status) {
      const normalizedStatus = normalizeApiStatus(status);
      const validStatuses = [
        "pending",
        "pending_verification",
        "paid",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
        "failed",
      ];

      if (!validStatuses.includes(normalizedStatus)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status value",
        });
      }

      const currentStatus = order.status;
      if (currentStatus !== normalizedStatus) {
        if (
          !isAllowedStatusTransition(order, currentStatus, normalizedStatus, productIds)
        ) {
          return res.status(400).json({
            success: false,
            message: `Invalid status transition from ${currentStatus} to ${normalizedStatus}`,
          });
        }

        if (
          requiresTrackingForStatus(order, productIds, normalizedStatus) &&
          !trackingNumber &&
          !order.trackingNumber
        ) {
          return res.status(400).json({
            success: false,
            message: "Tracking number is required before marking order as shipped",
          });
        }
      }

      order.status = normalizedStatus;
    }

    if (trackingNumber) {
      order.trackingNumber = trackingNumber;
    }

    if (notes !== null && notes !== undefined) {
      order.sellerNotes = notes;
    }

    await order.save();

    if (orderRequiresShipping(order)) {
      await orderFulfillmentService.maybeSyncShiprocket(order._id).catch((e) =>
        console.error("Shiprocket sync:", e)
      );
    }

    // Commission & Ledger Logic for 'delivered' status (atomic when MongoDB is replica set)
    if (status && status.toLowerCase() === 'delivered') {
      const sellerItems = order.items.filter(item =>
        productIds.includes(item.product.toString())
      );

      const runDeliveryCommissionLedger = async (session = null) => {
        for (const item of sellerItems) {
          let existingQuery = Commission.findOne({
            order: order._id,
            product: item.product,
            seller: sellerId
          });
          if (session) existingQuery = existingQuery.session(session);
          const existingCommission = await existingQuery;

          if (!existingCommission) {
            const product = await Product.findById(item.product).select('category');
            const categoryId = product ? product.category : null;
            const orderAmount = (item.price || 0) * (item.quantity || 1);
            const commissionData = await calculateCommission(sellerId, categoryId, orderAmount);

            const now = new Date();
            const commission = new Commission({
              order: order._id,
              seller: sellerId,
              product: item.product,
              category: categoryId,
              orderAmount: orderAmount,
              commissionRate: commissionData.commissionRate,
              commissionAmount: commissionData.commissionAmount,
              commissionType: commissionData.commissionType,
              appliedRule: commissionData.appliedRule,
              status: 'approved',
              period: { year: now.getFullYear(), month: now.getMonth() + 1 }
            });
            await commission.save(session ? { session } : {});

            const sellerNetAmount = Math.round((orderAmount - commissionData.commissionAmount) * 100) / 100;
            let ledgerQuery = SellerLedger.findOne({ seller: sellerId }).sort({ createdAt: -1 });
            if (session) ledgerQuery = ledgerQuery.session(session);
            const lastLedgerEntry = await ledgerQuery;
            const currentBalance = lastLedgerEntry ? lastLedgerEntry.balanceAfter : 0;
            const newBalance = currentBalance + sellerNetAmount;

            await SellerLedger.create([{
              seller: sellerId,
              type: 'commission_earned',
              amount: sellerNetAmount,
              balanceAfter: newBalance,
              reference: { model: 'Commission', id: commission._id },
              description: `Commission earned from Order #${order.invoiceNumber || order._id} (Rule: ${commissionData.appliedRule})`
            }], session ? { session } : {});
          }
        }
      };

      let session;
      try {
        session = await mongoose.startSession();
        await session.withTransaction(() => runDeliveryCommissionLedger(session));
        validateSellerLedgerIntegrity(sellerId).catch(() => {});
      } catch (txErr) {
        const isStandalone = /replica set|transaction numbers|only allowed on a replica set member or mongos/i.test(txErr.message || '');
        if (isStandalone) {
          try {
            await runDeliveryCommissionLedger();
            validateSellerLedgerIntegrity(sellerId).catch(() => {});
          } catch (fallbackErr) {
            console.error("❌ Commission/Ledger Processing failed:", fallbackErr);
          }
        } else {
          console.error("❌ Commission/Ledger Processing failed:", txErr);
        }
      } finally {
        if (session) await session.endSession().catch(() => {});
      }
    }

    sendSuccessResponse(res, HTTP_STATUS.OK, "Order status updated successfully", {
      orderId: order._id,
      status: order.status,
      trackingNumber: order.trackingNumber,
      updatedAt: order.updatedAt
    });

  } catch (error) {
    console.error("Update order status error:", error);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "Failed to update order status", ERROR_CODES.INTERNAL_ERROR);
  }
});

// =========================
// 📍 Get Order Tracking Info
// =========================
exports.getOrderTracking = asyncHandler(async (req, res) => {
  try {
    const sellerId = req.user._id;
    const { orderId } = req.params;

    if (!sellerId) {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "Invalid seller ID", ERROR_CODES.INVALID_INPUT);
    }

    const sellerProducts = await Product.find({ seller: sellerId }).select('_id');
    const productIds = sellerProducts.map(p => p._id.toString());

    const order = await Order.findById(orderId)
      .populate('buyer', 'firstName lastName email phone')
      .populate('items.product', 'name price seller');

    if (!order) {
      return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, "Order not found", ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    const hasSellerProducts = order.items.some(item =>
      productIds.includes(item.product._id.toString())
    );

    if (!hasSellerProducts) {
      return sendErrorResponse(res, HTTP_STATUS.FORBIDDEN, "This order does not contain your products", ERROR_CODES.ACCESS_DENIED);
    }

    const sellerItems = order.items.filter(item =>
      productIds.includes(item.product._id.toString())
    );

    const trackingInfo = {
      orderId: order._id,
      orderNumber: order.invoiceNumber,
      status: order.status,
      trackingNumber: order.trackingNumber || null,
      buyer: order.buyer,
      items: sellerItems,
      totalAmount: sellerItems.reduce((sum, item) => sum + (item.price * item.quantity), 0),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt || order.createdAt
    };

    sendSuccessResponse(res, HTTP_STATUS.OK, "Order tracking info retrieved successfully", trackingInfo);

  } catch (error) {
    console.error("Get order tracking error:", error);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "Failed to retrieve order tracking info", ERROR_CODES.INTERNAL_ERROR);
  }
});