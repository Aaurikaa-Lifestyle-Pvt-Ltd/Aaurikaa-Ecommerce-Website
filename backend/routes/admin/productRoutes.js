const express = require("express");
const router = express.Router();

const {
  addProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  getProductStats,
  updateProductStatus,
  regenerateSku,
  autoSaveProduct,
  getLatestDraft,
  moveToTrash,
  restoreFromTrash,
  exportProducts,
  downloadProductImportTemplate,
  checkPrimaryKeywordAvailability,
} = require("../../controllers/adminProductController");
const productBackupCtrl = require("../../controllers/productBackupController");
const bulkImportCtrl = require("../../controllers/bulkProductImportController");

const adminProductUpload = require("../../middleware/adminProductUpload");
const bulkUpload = require("../../middleware/bulkUpload");
const { validateProduct } = require("../../middleware/validation");
const { verifyAdmin, loadAdminContext, requirePermission } = require("../../utils/adminAuthChain");

router.use(verifyAdmin, loadAdminContext);

router.post(
  "/",
  requirePermission("catalog", "manage"),
  adminProductUpload.upload,
  adminProductUpload.handleUploadError,
  validateProduct,
  addProduct
);

router.get("/", requirePermission("catalog", "view"), getAllProducts);
router.get("/export", requirePermission("catalog", "export"), exportProducts);
router.get("/import-template", requirePermission("catalog", "import"), downloadProductImportTemplate);
router.get("/export-json", requirePermission("catalog", "export"), productBackupCtrl.exportProductsJsonAdmin);
router.post("/import-json", requirePermission("catalog", "import"), productBackupCtrl.importProductsJsonAdmin);
router.get("/latest-draft", requirePermission("catalog", "view"), getLatestDraft);
router.get("/stats/overview", requirePermission("catalog", "view"), getProductStats);
router.get(
  "/primary-keyword/availability",
  requirePermission("catalog", "manage"),
  checkPrimaryKeywordAvailability
);
router.get("/:id", requirePermission("catalog", "view"), getProductById);

router.put(
  "/:id",
  requirePermission("catalog", "manage"),
  adminProductUpload.upload,
  adminProductUpload.handleUploadError,
  validateProduct,
  updateProduct
);

router.delete("/:id", requirePermission("catalog", "manage"), deleteProduct);
router.post("/auto-save", requirePermission("catalog", "manage"), autoSaveProduct);
router.put("/:id/trash", requirePermission("catalog", "manage"), moveToTrash);
router.put("/:id/restore", requirePermission("catalog", "manage"), restoreFromTrash);

router.post(
  "/bulk-upload/validate",
  requirePermission("catalog", "import"),
  bulkUpload.upload,
  bulkUpload.handleUploadError,
  bulkImportCtrl.validateBulkUploadAdmin
);
router.post(
  "/bulk-upload",
  requirePermission("catalog", "import"),
  bulkUpload.upload,
  bulkUpload.handleUploadError,
  bulkImportCtrl.bulkUploadAdmin
);

router.put("/:id/status", requirePermission("catalog", "manage"), updateProductStatus);
router.post("/:id/regenerate-sku", requirePermission("catalog", "manage"), regenerateSku);

module.exports = router;
