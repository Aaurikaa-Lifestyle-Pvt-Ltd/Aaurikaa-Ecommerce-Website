const express = require('express');
const {
  saveHomepageCategoryConfig,
  getHomepageCategoryConfigs,
} = require('../../controllers/admin/homepageCategoryController');
const { withAdminAuth } = require('../../utils/adminAuthChain');

const router = express.Router();

router.route('/').get(getHomepageCategoryConfigs);
router.route('/admin').post(...withAdminAuth('homepage', 'manage'), saveHomepageCategoryConfig);

module.exports = router;
