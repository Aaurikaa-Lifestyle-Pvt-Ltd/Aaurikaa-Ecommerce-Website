const express = require("express");
const router = express.Router();
const shopperController = require("../../controllers/shopperController");
const shopperUpload = require("../../middleware/shopperUpload");
const { verifyAdmin, loadAdminContext, requirePermission } = require("../../utils/adminAuthChain");

router.use(verifyAdmin, loadAdminContext);

router.get("/", requirePermission("shoppers", "view"), shopperController.getAllShoppers);
router.post(
  "/",
  requirePermission("shoppers", "manage"),
  shopperUpload.upload,
  shopperUpload.handleUploadError,
  shopperController.createShopper
);
router.put(
  "/:id",
  requirePermission("shoppers", "manage"),
  shopperUpload.upload,
  shopperUpload.handleUploadError,
  shopperController.updateShopper
);
router.delete("/:id", requirePermission("shoppers", "manage"), shopperController.deleteShopper);

module.exports = router;
