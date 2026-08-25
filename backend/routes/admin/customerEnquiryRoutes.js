const express = require('express');
const router = express.Router();
const {
  listEnquiries,
  getEnquiryStats,
  getEnquiryById,
  patchEnquiry,
} = require('../../controllers/admin/customerEnquiryController');
const { verifyAdmin, loadAdminContext, requirePermission } = require('../../utils/adminAuthChain');

router.use(verifyAdmin, loadAdminContext);

router.get('/stats', requirePermission('support', 'view'), getEnquiryStats);
router.get('/', requirePermission('support', 'view'), listEnquiries);
router.get('/:id', requirePermission('support', 'view'), getEnquiryById);
router.patch('/:id', requirePermission('support', 'manage'), patchEnquiry);

module.exports = router;
