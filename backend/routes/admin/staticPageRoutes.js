const express = require('express');
const router = express.Router();
const staticPageController = require('../../controllers/staticPageController');
const { verifyAdmin, loadAdminContext, requirePermission } = require('../../utils/adminAuthChain');

router.use(verifyAdmin, loadAdminContext);

router.get('/', requirePermission('cms', 'view'), staticPageController.listRegistry);
router.get('/:pageKey', requirePermission('cms', 'view'), staticPageController.getByPageKeyAdmin);
router.put('/:pageKey', requirePermission('cms', 'manage'), staticPageController.upsertByPageKey);

module.exports = router;
