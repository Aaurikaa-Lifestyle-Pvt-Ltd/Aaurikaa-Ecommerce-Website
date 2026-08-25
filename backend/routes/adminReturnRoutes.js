const express = require("express");
const router = express.Router();
const { verifyAdmin, loadAdminContext, requirePermission } = require("../utils/adminAuthChain");
const {
  listReturnQueue,
  getReturnRequest,
  patchReturnReview,
  patchRefundReview,
  patchRefundComplete,
  patchOverride,
  patchAfterSalesReview,
  patchAfterSalesConfirmReceipt,
  patchAfterSalesResolution,
  postAfterSalesRetryPickup,
} = require("../controllers/admin/adminReturnController");

router.use(verifyAdmin, loadAdminContext);

router.get("/", requirePermission("order_returns", "view"), listReturnQueue);
router.get("/:id", requirePermission("order_returns", "view"), getReturnRequest);
router.patch("/:id/return-review", requirePermission("order_returns", "manage"), patchReturnReview);
router.patch("/:id/refund-review", requirePermission("order_returns", "manage"), patchRefundReview);
router.patch("/:id/refund-complete", requirePermission("order_returns", "manage"), patchRefundComplete);
router.patch("/:id/override", requirePermission("order_returns", "manage"), patchOverride);
router.patch("/:id/after-sales/review", requirePermission("order_returns", "manage"), patchAfterSalesReview);
router.patch(
  "/:id/after-sales/confirm-receipt",
  requirePermission("order_returns", "manage"),
  patchAfterSalesConfirmReceipt
);
router.patch(
  "/:id/after-sales/resolution",
  requirePermission("order_returns", "manage"),
  patchAfterSalesResolution
);
router.post(
  "/:id/after-sales/retry-pickup",
  requirePermission("order_returns", "manage"),
  postAfterSalesRetryPickup
);

module.exports = router;
