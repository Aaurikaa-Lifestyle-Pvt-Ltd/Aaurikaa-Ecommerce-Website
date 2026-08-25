const express = require("express");
const router = express.Router();
const {
  getShippingMethods,
  addShippingMethod,
  updateShippingMethod,
  deleteShippingMethod,
} = require("../../controllers/admin/shippingController");
const { verifyAdmin, loadAdminContext, requirePermission } = require("../../utils/adminAuthChain");

router.use(verifyAdmin, loadAdminContext);

router.get("/", requirePermission("catalog_config", "view"), getShippingMethods);
router.post("/", requirePermission("catalog_config", "manage"), addShippingMethod);
router.put("/:id", requirePermission("catalog_config", "manage"), updateShippingMethod);
router.delete("/:id", requirePermission("catalog_config", "manage"), deleteShippingMethod);

module.exports = router;
