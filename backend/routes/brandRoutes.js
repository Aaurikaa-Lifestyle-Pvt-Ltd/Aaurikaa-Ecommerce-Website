const express = require('express');
const router = express.Router();
const brandCtrl = require('../controllers/brandController');
const { upload, handleUploadError } = require('../middleware/uploadBrand');
const verifySeller = require('../middleware/verifySeller');
const { verifyAdmin, loadAdminContext, requirePermission } = require('../utils/adminAuthChain');

router.post(
  '/',
  verifyAdmin,
  loadAdminContext,
  requirePermission('taxonomy', 'manage'),
  upload,
  handleUploadError,
  brandCtrl.addBrand
);
router.post('/seller', verifySeller, brandCtrl.addBrandSeller);
router.get('/', brandCtrl.getBrands);
router.put(
  '/:id',
  verifyAdmin,
  loadAdminContext,
  requirePermission('taxonomy', 'manage'),
  upload,
  handleUploadError,
  brandCtrl.updateBrand
);
router.delete(
  '/:id',
  verifyAdmin,
  loadAdminContext,
  requirePermission('taxonomy', 'manage'),
  brandCtrl.deleteBrand
);

module.exports = router;
