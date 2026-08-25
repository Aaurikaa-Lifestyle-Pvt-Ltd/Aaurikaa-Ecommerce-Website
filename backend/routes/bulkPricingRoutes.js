const express = require('express');
const router = express.Router();
const {
  createOrUpdateBulkPricing,
  getBulkPricing,
  deleteBulkPricing,
  validateBulkPricing,
  getBulkPricingAnalytics,
  getProductsWithBulkPricing,
  testBulkPricingCalculation
} = require('../controllers/bulkPricingController');

const verifySeller = require('../middleware/verifySeller');
const { verifyAdmin, loadAdminContext, requirePermission } = require('../utils/adminAuthChain');

router.post(
  '/admin/products/:productId/bulk-pricing',
  verifyAdmin,
  loadAdminContext,
  requirePermission('catalog', 'manage'),
  createOrUpdateBulkPricing
);
router.delete(
  '/admin/products/:productId/bulk-pricing',
  verifyAdmin,
  loadAdminContext,
  requirePermission('catalog', 'manage'),
  deleteBulkPricing
);
router.get(
  '/admin/products/bulk-pricing',
  verifyAdmin,
  loadAdminContext,
  requirePermission('catalog', 'view'),
  getProductsWithBulkPricing
);

router.post('/seller/products/:productId/bulk-pricing', verifySeller, createOrUpdateBulkPricing);
router.delete('/seller/products/:productId/bulk-pricing', verifySeller, deleteBulkPricing);

router.get('/products/:productId/bulk-pricing', getBulkPricing);
router.post('/validate', validateBulkPricing);
router.get('/products/:productId/bulk-pricing/analytics', getBulkPricingAnalytics);
router.post('/products/:productId/bulk-pricing/test', testBulkPricingCalculation);

module.exports = router;
