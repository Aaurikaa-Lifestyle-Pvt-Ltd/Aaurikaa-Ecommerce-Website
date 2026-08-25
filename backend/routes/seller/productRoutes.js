const express = require("express");
const router = express.Router();

// 📦 Controllers
const sellerProductCtrl = require("../../controllers/sellerProductController");
const bulkImportCtrl = require("../../controllers/bulkProductImportController");
const skuRuleCtrl = require("../../controllers/admin/skuRuleController");
const productBackupCtrl = require("../../controllers/productBackupController");

// 🛡️ Middleware
const verifySeller = require("../../middleware/verifySeller");
const sellerProductUpload = require("../../middleware/sellerProductUpload");
const bulkUpload = require("../../middleware/bulkUpload");
const { validateProduct } = require("../../middleware/validation");

// ===========================
// 🔐 Seller Product Routes
// ===========================

// ➕ Add New Product
router.post(
  "/add",
  verifySeller,
  sellerProductUpload.upload,
  sellerProductUpload.handleUploadError,
  validateProduct,
  sellerProductCtrl.addProduct
);

// ✏️ Update Product
router.put(
  "/:id",
  verifySeller,
  sellerProductUpload.upload,
  sellerProductUpload.handleUploadError,
  validateProduct,
  sellerProductCtrl.updateProduct
);

// 📦 Get All Products (by logged-in seller)
router.get("/all", verifySeller, sellerProductCtrl.getAllProducts);

// 🔍 Get My Products (owned by seller)
router.get("/my", verifySeller, sellerProductCtrl.getMyProducts);

// 📤 Bulk Upload Products (CSV)
router.post(
  "/bulk-upload/validate",
  verifySeller,
  bulkUpload.upload,
  bulkUpload.handleUploadError,
  bulkImportCtrl.validateBulkUploadSeller
);
router.post(
  "/bulk-upload",
  verifySeller,
  bulkUpload.upload,
  bulkUpload.handleUploadError,
  bulkImportCtrl.bulkUploadSeller
);

// 📥 Export Products (GET /api/seller/products/export)
router.get("/export", verifySeller, sellerProductCtrl.exportProducts);

// 📥 Export Backup (JSON) — additive; does not replace CSV export
router.get("/export-json", verifySeller, productBackupCtrl.exportProductsJsonSeller);

// 📤 Restore Backup (JSON) — 10MB body limit applied in server.js for this path only
router.post("/import-json", verifySeller, productBackupCtrl.importProductsJsonSeller);

// 📄 Get Latest Draft
router.get("/latest-draft", verifySeller, sellerProductCtrl.getLatestDraft);

// 🎫 SKU Rule (Active)
router.get("/sku-rule/active", verifySeller, skuRuleCtrl.getActiveRule);

// 🔍 Primary Keyword Availability (advisory — before /:id)
router.get(
  "/primary-keyword/availability",
  verifySeller,
  sellerProductCtrl.checkPrimaryKeywordAvailability
);

// 🔍 Get Single Product (owned by seller)
router.get("/:id", verifySeller, sellerProductCtrl.getProductById);

// 🚮 Move to Trash (PUT /api/admin/products/:id/trash)
router.put("/:id/trash", verifySeller, sellerProductCtrl.moveToTrash);

// 🗑️ Delete Product
router.delete("/:id", verifySeller, sellerProductCtrl.deleteProduct);

// 💾 Auto-Save Product
router.post("/auto-save", verifySeller, sellerProductCtrl.autoSaveProduct);


module.exports = router;
