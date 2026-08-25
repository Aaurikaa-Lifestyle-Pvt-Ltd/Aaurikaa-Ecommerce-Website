const express = require("express");
const router = express.Router();
const {
  getImportBatches,
  getBatchDetails,
  approveBatch,
  rejectBatch,
  approveProduct,
  rejectProduct,
} = require("../../controllers/admin/importBatchController");
const { cleanupOrphanBatches } = require("../../controllers/bulkProductImportController");
const { verifyAdmin, loadAdminContext, requirePermission } = require("../../utils/adminAuthChain");

router.use(verifyAdmin, loadAdminContext);

router.get("/", requirePermission("catalog", "view"), getImportBatches);
router.delete("/orphans/cleanup", requirePermission("catalog", "manage"), cleanupOrphanBatches);
router.get("/:id", requirePermission("catalog", "view"), getBatchDetails);
router.put("/:id/approve", requirePermission("catalog", "manage"), approveBatch);
router.put("/:id/reject", requirePermission("catalog", "manage"), rejectBatch);
router.post(
  "/:batchId/products/:productId/approve",
  requirePermission("catalog", "manage"),
  approveProduct
);
router.post(
  "/:batchId/products/:productId/reject",
  requirePermission("catalog", "manage"),
  rejectProduct
);

module.exports = router;
