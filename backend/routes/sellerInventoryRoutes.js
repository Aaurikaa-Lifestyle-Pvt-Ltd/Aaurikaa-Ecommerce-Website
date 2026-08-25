// backend/routes/sellerInventoryRoutes.js

const express = require("express");
const router = express.Router();

// Import controllers
const {
  getLowStockProducts,
  getInventorySummary,
  updateProductStock,
  getStockMovementHistory,
  getInventoryAlerts
} = require("../controllers/sellerInventoryController");

// Import middleware
const verifySeller = require("../middleware/verifySeller");

// =========================
// 🎯 Seller Inventory Routes
// =========================

/**
 * @route   GET /api/seller/inventory/low-stock
 * @desc    Get low stock products (Priority 21)
 * @access  Private (Seller)
 */
router.get("/low-stock", verifySeller, getLowStockProducts);

/**
 * @route   GET /api/seller/inventory/summary
 * @desc    Get inventory summary with statistics (Priority 21)
 * @access  Private (Seller)
 */
router.get("/summary", verifySeller, getInventorySummary);

/**
 * @route   PUT /api/seller/inventory/products/:productId/stock
 * @desc    Update product stock (Priority 21)
 * @access  Private (Seller)
 */
router.put("/products/:productId/stock", verifySeller, updateProductStock);

/**
 * @route   GET /api/seller/inventory/movements
 * @desc    Get stock movement history (Priority 21)
 * @access  Private (Seller)
 */
router.get("/movements", verifySeller, getStockMovementHistory);

/**
 * @route   GET /api/seller/inventory/alerts
 * @desc    Get inventory alerts and notifications (Priority 21)
 * @access  Private (Seller)
 */
router.get("/alerts", verifySeller, getInventoryAlerts);

module.exports = router;
