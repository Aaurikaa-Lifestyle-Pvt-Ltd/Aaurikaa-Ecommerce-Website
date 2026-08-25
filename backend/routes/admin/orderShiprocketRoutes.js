const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/orderShiprocketController');
const { withAdminAuth } = require('../../utils/adminAuthChain');

router.use(...withAdminAuth('orders', 'fulfill'));

router.post('/:orderId/sync', controller.manualSync);
router.post('/:orderId/generate-awb', controller.generateAWB);
router.get('/:orderId/label', controller.getLabel);

module.exports = router;
