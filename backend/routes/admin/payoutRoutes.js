const express = require('express');
const router = express.Router();
const payoutController = require('../../controllers/admin/adminPayoutController');
const { verifyAdmin, loadAdminContext, requirePermission } = require('../../utils/adminAuthChain');

router.use(verifyAdmin, loadAdminContext);

router.get('/', requirePermission('finance', 'view'), payoutController.listPayoutRequests);
router.post('/:payoutId/approve', requirePermission('finance', 'approve'), payoutController.approvePayout);
router.post('/:payoutId/reject', requirePermission('finance', 'approve'), payoutController.rejectPayout);
router.post('/:payoutId/pay', requirePermission('finance', 'pay'), payoutController.markAsPaid);

module.exports = router;
