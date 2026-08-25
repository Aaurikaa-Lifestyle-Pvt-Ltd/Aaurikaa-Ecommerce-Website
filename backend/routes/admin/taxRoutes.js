const express = require("express");
const router = express.Router();
const taxController = require("../../controllers/admin/taxController");
const { verifyAdmin, loadAdminContext, requirePermission } = require("../../utils/adminAuthChain");

router.use(verifyAdmin, loadAdminContext);

router.post("/", requirePermission("catalog_config", "manage"), taxController.createTax);
router.get("/", requirePermission("catalog_config", "view"), taxController.getTaxes);
router.put("/:id", requirePermission("catalog_config", "manage"), taxController.updateTax);
router.delete("/:id", requirePermission("catalog_config", "manage"), taxController.deleteTax);

module.exports = router;
