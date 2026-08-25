const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/keyFeatureCatalogueController');
const { verifyAdmin, loadAdminContext, requirePermission } = require('../utils/adminAuthChain');

const catalogManage = [
  verifyAdmin,
  loadAdminContext,
  requirePermission('catalog', 'manage'),
];

/** Authoring forms (admin + seller) — active catalogue list. */
router.get('/', ctrl.listCatalogue);

/** Admin bootstrap / re-sync from spreadsheet baseline. */
router.post('/seed', ...catalogManage, ctrl.seedCatalogue);

/** Admin extensibility. */
router.post('/', ...catalogManage, ctrl.createCatalogueEntry);
router.patch('/:id', ...catalogManage, ctrl.updateCatalogueEntry);

module.exports = router;
