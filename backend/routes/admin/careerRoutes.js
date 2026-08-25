const express = require('express');
const router = express.Router();
const {
  validateCreateCareerBody,
  validateUpdateCareerBody,
  validateStatusBody,
  validateReorderBody,
} = require('../../middleware/validation/careerValidation');
const {
  getCareerStats,
  listCareers,
  createCareer,
  getCareerById,
  updateCareer,
  patchCareerStatus,
  reorderCareers,
  deleteCareer,
} = require('../../controllers/admin/careerController');
const { verifyAdmin, loadAdminContext, requirePermission } = require('../../utils/adminAuthChain');

router.use(verifyAdmin, loadAdminContext);

router.get('/stats', requirePermission('support', 'view'), getCareerStats);
router.patch('/reorder', requirePermission('support', 'manage'), validateReorderBody, reorderCareers);
router.get('/', requirePermission('support', 'view'), listCareers);
router.post('/', requirePermission('support', 'manage'), validateCreateCareerBody, createCareer);
router.get('/:id', requirePermission('support', 'view'), getCareerById);
router.put('/:id', requirePermission('support', 'manage'), validateUpdateCareerBody, updateCareer);
router.patch('/:id/status', requirePermission('support', 'manage'), validateStatusBody, patchCareerStatus);
router.delete('/:id', requirePermission('support', 'manage'), deleteCareer);

module.exports = router;
