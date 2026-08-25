const express = require('express');
const router = express.Router();
const {
    getShopSidebarSettings,
    updateShopSidebarSettings
} = require('../controllers/shopSidebarSettingsController');
const { withAdminAuth } = require('../utils/adminAuthChain');

router.get('/', getShopSidebarSettings);
router.put('/', ...withAdminAuth('site_settings', 'manage'), updateShopSidebarSettings);

module.exports = router;
