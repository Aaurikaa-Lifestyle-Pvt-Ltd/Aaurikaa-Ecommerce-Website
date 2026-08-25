const express = require('express');
const router = express.Router();
const homepageGrid4x4Controller = require('../../controllers/homepageGrid4x4Controller');
const { r2Uploads, handleUploadError } = require('../../middleware/secureUpload');
const { withAdminAuth } = require('../../utils/adminAuthChain');

const homepageView = withAdminAuth('homepage', 'view');
const homepageManage = withAdminAuth('homepage', 'manage');

router.get('/', ...homepageView, homepageGrid4x4Controller.getGrid4x4Admin);
router.put(
  '/',
  ...homepageManage,
  r2Uploads.grid4x4Form(),
  handleUploadError,
  homepageGrid4x4Controller.updateGrid4x4
);

module.exports = router;
