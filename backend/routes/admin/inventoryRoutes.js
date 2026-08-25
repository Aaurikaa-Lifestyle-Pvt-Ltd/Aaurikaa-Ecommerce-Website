const express = require("express");
const router = express.Router();
const inventoryController = require("../../controllers/admin/inventoryController");
const { withAdminAuth } = require("../../utils/adminAuthChain");

/**
 * Admin inventory list — Product stock/variantStock only.
 * No warehouse/GRN/transfers; does not expose seller inventory routes.
 */
router.get("/", ...withAdminAuth("catalog", "view"), inventoryController.listInventory);

module.exports = router;
