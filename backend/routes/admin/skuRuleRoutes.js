const express = require("express");
const router = express.Router();
const skuRuleCtrl = require("../../controllers/admin/skuRuleController");
const { verifyAdmin, loadAdminContext, requirePermission } = require("../../utils/adminAuthChain");

router.use(verifyAdmin, loadAdminContext);

router.get("/", requirePermission("catalog_config", "view"), skuRuleCtrl.getAllRules);
router.get("/active", requirePermission("catalog_config", "view"), skuRuleCtrl.getActiveRule);
router.post("/", requirePermission("catalog_config", "manage"), skuRuleCtrl.createRule);
router.put("/:id", requirePermission("catalog_config", "manage"), skuRuleCtrl.updateRule);
router.delete("/:id", requirePermission("catalog_config", "manage"), skuRuleCtrl.deleteRule);

module.exports = router;
