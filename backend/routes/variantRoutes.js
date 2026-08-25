const express = require("express");
const router = express.Router();
const variantController = require("../controllers/variantController");
const { verifyAdmin, loadAdminContext, requirePermission } = require("../utils/adminAuthChain");

router.get("/", variantController.getAllVariants);
router.post(
  "/",
  verifyAdmin,
  loadAdminContext,
  requirePermission("taxonomy", "manage"),
  variantController.createVariant
);
router.put(
  "/:id",
  verifyAdmin,
  loadAdminContext,
  requirePermission("taxonomy", "manage"),
  variantController.updateVariant
);
router.delete(
  "/:id",
  verifyAdmin,
  loadAdminContext,
  requirePermission("taxonomy", "manage"),
  variantController.deleteVariant
);

module.exports = router;
