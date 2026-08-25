const express = require('express');
const router = express.Router();
const sellerPickupLocationController = require('../../controllers/admin/sellerPickupLocationController');
const { verifyAdmin, loadAdminContext, requirePermission } = require('../../utils/adminAuthChain');

router.use(verifyAdmin, loadAdminContext);

router.post('/sync', requirePermission('catalog_config', 'manage'), sellerPickupLocationController.syncFromShiprocket);
router.get('/', requirePermission('catalog_config', 'view'), sellerPickupLocationController.getAllPickupLocations);
router.put('/:id/assign', requirePermission('catalog_config', 'manage'), sellerPickupLocationController.assignToSeller);
router.put('/:id/set-default', requirePermission('catalog_config', 'manage'), sellerPickupLocationController.setDefaultPickup);

module.exports = router;
