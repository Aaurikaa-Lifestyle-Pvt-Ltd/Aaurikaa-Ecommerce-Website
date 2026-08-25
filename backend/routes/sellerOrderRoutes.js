const express = require("express");
const router = express.Router();

// Import controllers
const {
  getSellerOrders,
  updateOrderStatus,
  getOrderTracking
} = require("../controllers/sellerOrderController");

// Import middleware
const verifySeller = require("../middleware/verifySeller");

// =========================
// 🎯 Seller Order Routes
// =========================

/**
 * @route   GET /api/orders/seller
 * @desc    Get seller's orders (Priority 3)
 * @access  Private (Seller)
 */
router.get("/", verifySeller, getSellerOrders);

/**
 * @route   PUT /api/orders/seller/:orderId/status
 * @desc    Update order status (Priority 4)
 * @access  Private (Seller)
 */
router.put("/:orderId/status", verifySeller, updateOrderStatus);

/**
 * @route   GET /api/orders/seller/:orderId/tracking
 * @desc    Get order tracking information (Priority 11)
 * @access  Private (Seller)
 */
router.get("/:orderId/tracking", verifySeller, getOrderTracking);

module.exports = router;