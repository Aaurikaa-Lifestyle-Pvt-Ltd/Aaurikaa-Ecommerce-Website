const {
  listReturnReviewQueue,
  getReturnRequestDetail,
  reviewReturnRequest,
  reviewRefundRequest,
  completeRefundRequest,
  overrideAfterSalesCase,
} = require("../../services/adminReturnService");
const {
  sendShopperReturnReviewUpdate,
  sendShopperRefundReviewUpdate,
  sendShopperRefundCompleted,
  sendShopperAdminOverrideUpdate,
} = require("../../services/returnNotificationService");
const {
  reviewAfterSalesCase,
  confirmAfterSalesReceipt,
  resolveAfterSalesCase,
  retryAfterSalesPickup,
} = require("../../services/adminAfterSalesOpsService");

/**
 * GET /api/admin/returns — paginated return/refund review queue.
 */
exports.listReturnQueue = async (req, res) => {
  try {
    const { page, limit, status } = req.query;
    const result = await listReturnReviewQueue({ page, limit, status });

    res.json({
      success: true,
      requests: result.requests,
      pagination: result.pagination,
    });
  } catch (err) {
    console.error("❌ Admin return queue error:", err);
    res.status(500).json({ message: "Failed to fetch return review queue" });
  }
};

/**
 * GET /api/admin/returns/:id — single return request with order context.
 */
exports.getReturnRequest = async (req, res) => {
  try {
    const result = await getReturnRequestDetail(req.params.id);

    if (result.notFound) {
      return res.status(404).json({ message: result.message || "Return request not found" });
    }

    res.json({ success: true, request: result.request });
  } catch (err) {
    console.error("❌ Admin return detail error:", err);
    res.status(500).json({ message: "Failed to fetch return request" });
  }
};

/**
 * PATCH /api/admin/returns/:id/return-review — approve or reject return.
 */
exports.patchReturnReview = async (req, res) => {
  try {
    const adminId = req.user._id || req.user.id;
    const { action, note } = req.body || {};

    const result = await reviewReturnRequest({
      requestId: req.params.id,
      adminId,
      action,
      note,
    });

    if (result.invalid) {
      return res.status(400).json({ message: result.message });
    }
    if (result.notFound) {
      return res.status(404).json({ message: "Return request not found" });
    }
    if (result.notAllowed) {
      return res.status(400).json({ message: result.message });
    }
    if (result.conflict) {
      return res.status(409).json({ message: result.message });
    }

    try {
      await sendShopperReturnReviewUpdate(result.request, result.request?.order?._id, {
        action,
      });
    } catch (emailError) {
      console.error("Error sending return review notification email:", emailError);
    }

    res.json({
      success: true,
      message: "Return review updated",
      request: result.request,
    });
  } catch (err) {
    console.error("❌ Admin return review error:", err);
    res.status(500).json({ message: "Failed to update return review" });
  }
};

/**
 * PATCH /api/admin/returns/:id/refund-review — approve or reject refund.
 */
exports.patchRefundReview = async (req, res) => {
  try {
    const adminId = req.user._id || req.user.id;
    const { action, note } = req.body || {};

    const result = await reviewRefundRequest({
      requestId: req.params.id,
      adminId,
      action,
      note,
    });

    if (result.invalid) {
      return res.status(400).json({ message: result.message });
    }
    if (result.notFound) {
      return res.status(404).json({ message: "Return request not found" });
    }
    if (result.notAllowed) {
      return res.status(400).json({ message: result.message });
    }
    if (result.conflict) {
      return res.status(409).json({ message: result.message });
    }

    try {
      await sendShopperRefundReviewUpdate(result.request, result.request?.order?._id, {
        action,
      });
    } catch (emailError) {
      console.error("Error sending refund review notification email:", emailError);
    }

    res.json({
      success: true,
      message: "Refund review updated",
      request: result.request,
    });
  } catch (err) {
    console.error("❌ Admin refund review error:", err);
    res.status(500).json({ message: "Failed to update refund review" });
  }
};

/**
 * PATCH /api/admin/returns/:id/refund-complete — mark refund manually completed.
 */
exports.patchRefundComplete = async (req, res) => {
  try {
    const adminId = req.user._id || req.user.id;
    const { note } = req.body || {};

    const result = await completeRefundRequest({
      requestId: req.params.id,
      adminId,
      note,
    });

    if (result.invalid) {
      return res.status(400).json({ message: result.message });
    }
    if (result.notFound) {
      return res.status(404).json({ message: "Return request not found" });
    }
    if (result.notAllowed) {
      return res.status(400).json({ message: result.message });
    }
    if (result.conflict) {
      return res.status(409).json({ message: result.message });
    }
    if (result.financialFailed) {
      return res.status(422).json({ message: result.message });
    }

    try {
      await sendShopperRefundCompleted(result.request, result.request?.order?._id);
    } catch (emailError) {
      console.error("Error sending refund completion notification email:", emailError);
    }

    res.json({
      success: true,
      message: "Refund marked as completed",
      request: result.request,
      financialReversal: result.financialReversal || result.request?.financialReversalSummary || null,
    });
  } catch (err) {
    console.error("❌ Admin refund complete error:", err);
    res.status(500).json({ message: "Failed to mark refund complete" });
  }
};

/**
 * PATCH /api/admin/returns/:id/override — admin governance override/dispute on after-sales cases.
 */
exports.patchOverride = async (req, res) => {
  try {
    const adminId = req.user._id || req.user.id;
    const { action, resolution, reasonCode, reasonNote, note } = req.body || {};

    const result = await overrideAfterSalesCase({
      requestId: req.params.id,
      adminId,
      action,
      resolution,
      reasonCode,
      reasonNote,
      note,
    });

    if (result.invalid) {
      return res.status(400).json({ message: result.message });
    }
    if (result.notFound) {
      return res.status(404).json({ message: "Return request not found" });
    }
    if (result.notAllowed) {
      return res.status(400).json({ message: result.message });
    }
    if (result.conflict) {
      return res.status(409).json({ message: result.message });
    }

    try {
      await sendShopperAdminOverrideUpdate(result.request, result.request?.order?._id, {
        action: result.overrideAction,
        resolution,
      });
    } catch (emailError) {
      console.error("Error sending admin override notification email:", emailError);
    }

    res.json({
      success: true,
      message:
        result.overrideAction === "reopen"
          ? "Case reopened for seller review"
          : result.overrideAction === "uphold"
            ? "Seller decision upheld — case closed"
            : result.overrideAction === "override"
              ? "Appeal decided — seller resolution overridden"
              : "Resolution overridden",
      request: result.request,
      refundOrchestration: result.refundOrchestration || null,
      replacementFulfillment: result.replacementFulfillment || null,
    });
  } catch (err) {
    console.error("❌ Admin override error:", err);
    res.status(500).json({ message: "Failed to apply admin override" });
  }
};

function mapAfterSalesResult(res, result) {
  if (result.invalid) {
    return res.status(400).json({ message: result.message });
  }
  if (result.notFound) {
    return res.status(404).json({ message: result.message || "Return request not found" });
  }
  if (result.forbidden) {
    return res.status(403).json({ message: result.message || "Not allowed" });
  }
  if (result.notAllowed) {
    return res.status(400).json({ message: result.message });
  }
  if (result.conflict) {
    return res.status(409).json({ message: result.message });
  }
  return null;
}

/**
 * PATCH /api/admin/returns/:id/after-sales/review — accept or reject (existing after-sales engine).
 */
exports.patchAfterSalesReview = async (req, res) => {
  try {
    const { action, returnRequired, resolution, reasonCode, reasonNote, note } = req.body || {};
    const result = await reviewAfterSalesCase({
      requestId: req.params.id,
      action,
      returnRequired,
      resolution,
      reasonCode,
      reasonNote,
      note,
    });
    const mapped = mapAfterSalesResult(res, result);
    if (mapped) return mapped;
    res.json({
      success: true,
      request: result.request,
      logistics: result.logistics || null,
      replacementFulfillment: result.replacementFulfillment || null,
    });
  } catch (err) {
    console.error("❌ Admin after-sales review error:", err);
    res.status(500).json({ message: "Failed to review after-sales case" });
  }
};

/**
 * PATCH /api/admin/returns/:id/after-sales/confirm-receipt
 */
exports.patchAfterSalesConfirmReceipt = async (req, res) => {
  try {
    const result = await confirmAfterSalesReceipt({
      requestId: req.params.id,
      note: req.body?.note,
    });
    const mapped = mapAfterSalesResult(res, result);
    if (mapped) return mapped;
    res.json({ success: true, request: result.request });
  } catch (err) {
    console.error("❌ Admin after-sales receipt error:", err);
    res.status(500).json({ message: "Failed to confirm return receipt" });
  }
};

/**
 * PATCH /api/admin/returns/:id/after-sales/resolution — replacement / repair / reject only.
 */
exports.patchAfterSalesResolution = async (req, res) => {
  try {
    const { resolution, reasonCode, reasonNote, note } = req.body || {};
    const result = await resolveAfterSalesCase({
      requestId: req.params.id,
      resolution,
      reasonCode,
      reasonNote,
      note,
    });
    const mapped = mapAfterSalesResult(res, result);
    if (mapped) return mapped;
    res.json({
      success: true,
      request: result.request,
      replacementFulfillment: result.replacementFulfillment || null,
    });
  } catch (err) {
    console.error("❌ Admin after-sales resolution error:", err);
    res.status(500).json({ message: "Failed to record resolution" });
  }
};

/**
 * POST /api/admin/returns/:id/after-sales/retry-pickup
 */
exports.postAfterSalesRetryPickup = async (req, res) => {
  try {
    const result = await retryAfterSalesPickup({ requestId: req.params.id });
    const mapped = mapAfterSalesResult(res, result);
    if (mapped) return mapped;
    res.json({
      success: true,
      request: result.request,
      logistics: result.logistics || null,
    });
  } catch (err) {
    console.error("❌ Admin after-sales pickup retry error:", err);
    res.status(500).json({ message: "Failed to retry reverse pickup" });
  }
};

