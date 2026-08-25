const express = require('express');
const router = express.Router();
const {
  getApplicationStats,
  listApplications,
  getApplicationById,
  patchApplication,
  downloadResume,
} = require('../../controllers/admin/careerApplicationController');
const { verifyAdmin, loadAdminContext, requirePermission } = require('../../utils/adminAuthChain');

router.use(verifyAdmin, loadAdminContext);

router.get('/stats', requirePermission('support', 'view'), getApplicationStats);
router.get('/', requirePermission('support', 'view'), listApplications);
router.get('/:id/resume', requirePermission('support', 'view'), downloadResume);
router.get('/:id', requirePermission('support', 'view'), getApplicationById);
router.patch('/:id', requirePermission('support', 'manage'), patchApplication);

module.exports = router;
