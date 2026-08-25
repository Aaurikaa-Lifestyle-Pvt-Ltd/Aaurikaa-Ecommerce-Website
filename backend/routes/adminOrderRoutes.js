const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const ReturnRequest = require('../models/ReturnRequest');
const orderFulfillmentService = require('../services/orderFulfillmentService');
const { toPaymentVisibilityDTO } = require('../services/paymentVisibilityService');
const { loadAfterSalesSummaryMapByOrderIds } = require('../utils/afterSalesListingSummary');
const {
  listConfirmationQueue,
  patchConfirmationStatus,
} = require('../controllers/admin/manualConfirmationController');
const {
  isAllowedStatusTransition,
  orderRequiresShipping,
} = require('../utils/orderFulfillmentGuards');
const { verifyAdmin, loadAdminContext, requirePermission } = require('../utils/adminAuthChain');
const { streamOrderInvoicePdf } = require('../services/invoiceDownloadService');

function attachPaymentVisibility(orderDoc) {
  const obj = orderDoc && typeof orderDoc.toObject === 'function' ? orderDoc.toObject() : orderDoc;
  return {
    ...obj,
    paymentVisibility: toPaymentVisibilityDTO(orderDoc),
  };
}

router.use(verifyAdmin, loadAdminContext);

router.get("/", requirePermission("orders", "view"), async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("buyer", "firstName lastName email phone")
      .populate({
        path: "items.product",
        select: "name title price salePrice seller sku images",
        populate: { path: "seller", select: "shopName firstName lastName" },
      })
      .sort({ createdAt: -1 });

    const afterSalesMap = await loadAfterSalesSummaryMapByOrderIds(
      orders.map((o) => o._id),
      ReturnRequest
    );

    res.json({
      success: true,
      orders: orders.map((order) => ({
        ...attachPaymentVisibility(order),
        afterSales: afterSalesMap.get(String(order._id)) || null,
      })),
      count: orders.length
    });
  } catch (err) {
    console.error("❌ Admin Order Fetch Error:", err);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
});

router.get(
  "/manual-confirmations",
  requirePermission("order_confirmations", "view"),
  listConfirmationQueue
);
router.patch(
  "/:id/manual-confirmation",
  requirePermission("order_confirmations", "manage"),
  patchConfirmationStatus
);

router.get("/:id/invoice", requirePermission("orders", "view"), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("buyer")
      .populate("items.product", "name mainImage regularPrice salePrice hsnCode");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (!order.items || order.items.length === 0) {
      return res.status(400).json({ message: "Invalid order - No items found" });
    }

    if (!order.totalAmount || order.totalAmount <= 0) {
      return res.status(400).json({ message: "Invalid order - Invalid total amount" });
    }

    await streamOrderInvoicePdf(res, order);
  } catch (err) {
    console.error("Admin invoice error:", err);
    res.status(500).json({ message: "Invoice generation failed" });
  }
});

router.get("/:id", requirePermission("orders", "view"), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("buyer", "firstName lastName email phone")
      .populate({
        path: "items.product",
        select: "name title price salePrice seller sku images mainImage",
        populate: { path: "seller", select: "shopName firstName lastName" },
      });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const afterSalesMap = await loadAfterSalesSummaryMapByOrderIds([order._id], ReturnRequest);
    res.json({
      success: true,
      order: {
        ...attachPaymentVisibility(order),
        afterSales: afterSalesMap.get(String(order._id)) || null,
      },
    });
  } catch (err) {
    console.error("❌ Admin Order Detail Error:", err);
    res.status(500).json({ message: "Failed to fetch order" });
  }
});

router.put('/:id/status', requirePermission("orders", "manage"), async (req, res) => {
  try {
    const { status } = req.body;

    const validStatuses = [
      'pending',
      'pending_verification',
      'paid',
      'failed',
      'cancelled',
      'shipped',
      'delivered',
      'processing'
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: '❌ Invalid status value' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: '❌ Order not found' });
    }

    const currentStatus = order.status;
    if (currentStatus !== status) {
      if (!isAllowedStatusTransition(order, currentStatus, status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status transition from ${currentStatus} to ${status}`
        });
      }
    }

    order.status = status;
    order.updatedAt = new Date();
    await order.save();

    if (orderRequiresShipping(order)) {
      await orderFulfillmentService.maybeSyncShiprocket(order._id).catch((e) =>
        console.error('Shiprocket sync:', e)
      );
    }

    const updatedOrder = await Order.findById(order._id)
      .populate('buyer', 'firstName lastName email phone')
      .populate({
        path: 'items.product',
        select: 'name title price salePrice seller sku',
        populate: { path: 'seller', select: 'shopName firstName lastName' },
      });

    res.json({
      message: '✅ Order status updated',
      order: attachPaymentVisibility(updatedOrder)
    });

  } catch (err) {
    console.error("❌ Admin Order Status Update Error:", err);
    res.status(500).json({ message: "❌ Failed to update order status" });
  }
});

module.exports = router;
