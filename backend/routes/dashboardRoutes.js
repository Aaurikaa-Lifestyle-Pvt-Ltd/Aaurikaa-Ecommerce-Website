const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { adminBaseAuth } = require('../utils/adminAuthChain');

/** Authenticated admins only — stats sections are filtered per module permissions in the controller. */
router.get('/stats', ...adminBaseAuth, dashboardController.getDashboardStats);
router.get('/activity', ...adminBaseAuth, dashboardController.getRecentActivity);
router.get('/analytics', ...adminBaseAuth, dashboardController.getSalesAnalytics);

module.exports = router;
