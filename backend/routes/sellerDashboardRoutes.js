const express = require("express");
const router = express.Router();
const verifySeller = require("../middleware/verifySeller");
const { getSellerDashboardStats, getSellerAnalytics } = require("../controllers/sellerDashboardController");

// Apply seller verification middleware to all routes
router.use(verifySeller);

// 📊 Get seller dashboard statistics
router.get("/stats", getSellerDashboardStats);

// 📈 Get seller analytics
router.get("/analytics", getSellerAnalytics);

module.exports = router;
