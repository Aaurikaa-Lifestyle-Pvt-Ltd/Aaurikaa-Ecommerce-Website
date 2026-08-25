const express = require('express');
const router = express.Router();
const cmsPageController = require('../../controllers/cmsPageController');
const { verifyAdmin, loadAdminContext, requirePermission } = require('../../utils/adminAuthChain');

router.use(verifyAdmin, loadAdminContext);

router.get('/', requirePermission('cms', 'view'), cmsPageController.listPages);
router.post('/', requirePermission('cms', 'manage'), cmsPageController.createPage);
router.get('/:id', requirePermission('cms', 'view'), cmsPageController.getPageById);
router.put('/:id', requirePermission('cms', 'manage'), cmsPageController.updatePage);
router.patch('/:id/status', requirePermission('cms', 'manage'), cmsPageController.updateStatus);
router.delete('/:id', requirePermission('cms', 'manage'), cmsPageController.trashPage);

module.exports = router;
