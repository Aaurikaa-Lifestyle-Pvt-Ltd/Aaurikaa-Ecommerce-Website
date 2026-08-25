const express = require("express");
const router = express.Router();
const commissionController = require("../controllers/commissionController");
const { verifyAdmin, loadAdminContext, requirePermission } = require("../utils/adminAuthChain");

router.use(verifyAdmin, loadAdminContext);

router.get("/", requirePermission("finance", "view"), commissionController.getCommissions);
router.get("/stats", requirePermission("finance", "view"), commissionController.getCommissionStats);
router.get("/pending", requirePermission("finance", "view"), commissionController.getPendingCommissions);
router.get("/:id", requirePermission("finance", "view"), commissionController.getCommissionById);
router.post("/", requirePermission("finance", "manage"), commissionController.createCommission);
router.patch("/:id/approve", requirePermission("finance", "approve"), commissionController.approveCommission);
router.patch("/:id/paid", requirePermission("finance", "pay"), commissionController.markCommissionAsPaid);
router.patch("/:id/dispute", requirePermission("finance", "manage"), commissionController.disputeCommission);
router.patch("/:id/resolve", requirePermission("finance", "manage"), commissionController.resolveDispute);
router.post("/bulk-approve", requirePermission("finance", "approve"), commissionController.bulkApproveCommissions);

module.exports = router;
