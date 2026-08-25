const express = require("express");
const router = express.Router();
const sellerDocsUpload = require("../../middleware/sellerDocsUpload");
const ctrl = require("../../controllers/adminSellerController");
const { verifyAdmin, loadAdminContext, requirePermission } = require("../../utils/adminAuthChain");

router.use(verifyAdmin, loadAdminContext);

router.get("/", requirePermission("sellers", "view"), ctrl.getAll);
router.get("/:id", requirePermission("sellers", "view"), ctrl.getById);
router.post(
  "/",
  requirePermission("sellers", "manage"),
  sellerDocsUpload.upload,
  sellerDocsUpload.handleUploadError,
  ctrl.create
);
router.put(
  "/:id",
  requirePermission("sellers", "manage"),
  sellerDocsUpload.upload,
  sellerDocsUpload.handleUploadError,
  ctrl.update
);
router.delete("/:id", requirePermission("sellers", "manage"), ctrl.delete);
router.put("/:id/status", requirePermission("sellers", "manage"), ctrl.updateStatus);
router.put("/:id/commission", requirePermission("sellers", "manage"), ctrl.updateSellerCommission);
router.put("/:id/category-override", requirePermission("sellers", "manage"), ctrl.updateSellerCategoryOverride);
router.put("/approve/:id", requirePermission("sellers", "approve"), ctrl.updateSellerApproval);
router.post("/approve-bulk", requirePermission("sellers", "approve"), ctrl.bulkApproveSellers);

module.exports = router;
