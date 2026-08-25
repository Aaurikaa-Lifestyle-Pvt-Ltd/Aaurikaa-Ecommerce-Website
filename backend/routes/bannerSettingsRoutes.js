const express = require('express');
const router = express.Router();
const bannerSettingsController = require('../controllers/bannerSettingsController');
const { upload: uploadBanner, handleUploadError } = require('../middleware/uploadBanner');
const { withAdminAuth } = require('../utils/adminAuthChain');

router.get('/', bannerSettingsController.getBannerSettings);
router.put(
  '/',
  ...withAdminAuth('homepage', 'manage'),
  uploadBanner,
  handleUploadError,
  bannerSettingsController.updateBannerSettings
);

module.exports = router;
