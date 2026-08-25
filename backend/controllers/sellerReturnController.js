const {
  listSellerReturnQueue,
  getSellerReturnDetail,
  reviewSellerDecision,
  confirmSellerReceipt,
  selectSellerResolution,
  retrySellerReturnPickup,
} = require("../services/sellerReturnService");
const {
  sendShopperSellerDecisionUpdate,
  sendShopperResolutionRecorded,
  sendShopperPickupScheduled,
  sendShopperReceiptConfirmed,
  sendShopperWalletCredited,
} = require("../services/returnNotificationService");

/**
 * GET /api/seller/returns — paginated seller after-sales queue.
 */
exports.listSellerReturns = async (req, res) => {
  try {
    const sellerId = req.user._id || req.user.id;
    const { page, limit, status } = req.query;
    const result = await listSellerReturnQueue({
      sellerId,
      page,
      limit,
      status,
    });

    res.json({
      success: true,
      requests: result.requests,
      pagination: result.pagination,
    });
  } catch (err) {
    console.error("❌ Seller return queue error:", err);
    res.status(500).json({ message: "Failed to fetch after-sales queue" });
  }
};

/**
 * GET /api/seller/returns/:id — case detail with order/evidence context.
 */
exports.getSellerReturn = async (req, res) => {
  try {
    const sellerId = req.user._id || req.user.id;
    const result = await getSellerReturnDetail(req.params.id, sellerId);

    if (result.notFound) {
      return res.status(404).json({ message: result.message || "After-sales case not found" });
    }
    if (result.forbidden) {
      return res.status(403).json({ message: result.message || "Access denied" });
    }

    res.json({ success: true, request: result.request });
  } catch (err) {
    console.error("❌ Seller return detail error:", err);
    res.status(500).json({ message: "Failed to fetch after-sales case" });
  }
};

/**
 * PATCH /api/seller/returns/:id/review — accept or reject.
 * Body: { action: "accept"|"reject", returnRequired?: boolean, resolution?: string, note?: string }
 */
exports.patchSellerReview = async (req, res) => {
  try {
    const sellerId = req.user._id || req.user.id;
    const { action, returnRequired, resolution, reasonCode, reasonNote, note } =
      req.body || {};

    const result = await reviewSellerDecision({
      requestId: req.params.id,
      sellerId,
      action,
      returnRequired,
      resolution,
      reasonCode,
      reasonNote,
      note,
    });

    if (result.invalid) {
      return res.status(400).json({ message: result.message });
    }
    if (result.notFound) {
      return res.status(404).json({ message: result.message || "After-sales case not found" });
    }
    if (result.forbidden) {
      return res.status(403).json({ message: result.message || "Access denied" });
    }
    if (result.notAllowed) {
      return res.status(400).json({ message: result.message });
    }
    if (result.conflict) {
      return res.status(409).json({ message: result.message });
    }

    try {
      await sendShopperSellerDecisionUpdate(result.request, result.request?.order?._id, {
        action: result.decision,
      });
    } catch (emailError) {
      console.error("Error sending seller decision notification email:", emailError);
    }

    if (
      result.decision === "accept" &&
      result.logistics?.scheduled &&
      result.request?.returnRequired
    ) {
      try {
        await sendShopperPickupScheduled(result.request, result.request?.order?._id);
      } catch (emailError) {
        console.error("Error sending pickup scheduled notification email:", emailError);
      }
    }

    if (result.refundOrchestration?.processed) {
      try {
        await sendShopperWalletCredited(result.request, result.request?.order?._id, {
          amount: result.refundOrchestration.amount,
        });
      } catch (emailError) {
        console.error("Error sending wallet credit notification email:", emailError);
      }
    }

    res.json({
      success: true,
      message: result.decision === "accept" ? "Case accepted" : "Case rejected",
      request: result.request,
      logistics: result.logistics || null,
    });
  } catch (err) {
    console.error("❌ Seller return review error:", err);
    res.status(500).json({ message: "Failed to update seller review" });
  }
};

/**
 * PATCH /api/seller/returns/:id/confirm-receipt
 * Body: { note?: string }
 */
exports.patchSellerConfirmReceipt = async (req, res) => {
  try {
    const sellerId = req.user._id || req.user.id;
    const { note } = req.body || {};

    const result = await confirmSellerReceipt({
      requestId: req.params.id,
      sellerId,
      note,
    });

    if (result.invalid) {
      return res.status(400).json({ message: result.message });
    }
    if (result.notFound) {
      return res.status(404).json({ message: result.message || "After-sales case not found" });
    }
    if (result.forbidden) {
      return res.status(403).json({ message: result.message || "Access denied" });
    }
    if (result.notAllowed) {
      return res.status(400).json({ message: result.message });
    }
    if (result.conflict) {
      return res.status(409).json({ message: result.message });
    }

    try {
      await sendShopperReceiptConfirmed(result.request, result.request?.order?._id);
    } catch (emailError) {
      console.error("Error sending receipt confirmation notification email:", emailError);
    }

    res.json({
      success: true,
      message: "Receipt confirmed",
      request: result.request,
    });
  } catch (err) {
    console.error("❌ Seller confirm receipt error:", err);
    res.status(500).json({ message: "Failed to confirm receipt" });
  }
};

/**
 * PATCH /api/seller/returns/:id/resolution
 * Body: { resolution: "refund"|"replacement"|"repair"|"rejected", note?: string }
 */
exports.patchSellerResolution = async (req, res) => {
  try {
    const sellerId = req.user._id || req.user.id;
    const { resolution, reasonCode, reasonNote, note } = req.body || {};

    const result = await selectSellerResolution({
      requestId: req.params.id,
      sellerId,
      resolution,
      reasonCode,
      reasonNote,
      note,
    });

    if (result.invalid) {
      return res.status(400).json({ message: result.message });
    }
    if (result.notFound) {
      return res.status(404).json({ message: result.message || "After-sales case not found" });
    }
    if (result.forbidden) {
      return res.status(403).json({ message: result.message || "Access denied" });
    }
    if (result.notAllowed) {
      return res.status(400).json({ message: result.message });
    }
    if (result.conflict) {
      return res.status(409).json({ message: result.message });
    }

    try {
      await sendShopperResolutionRecorded(result.request, result.request?.order?._id);
    } catch (emailError) {
      console.error("Error sending resolution notification email:", emailError);
    }

    if (result.refundOrchestration?.processed) {
      try {
        await sendShopperWalletCredited(result.request, result.request?.order?._id, {
          amount: result.refundOrchestration.amount,
        });
      } catch (emailError) {
        console.error("Error sending wallet credit notification email:", emailError);
      }
    }

    res.json({
      success: true,
      message: result.refundOrchestration?.processed
        ? "Resolution recorded and refund credited to shopper wallet"
        : "Resolution recorded",
      request: result.request,
      refundOrchestration: result.refundOrchestration || null,
    });
  } catch (err) {
    console.error("❌ Seller resolution error:", err);
    res.status(500).json({ message: "Failed to record resolution" });
  }
};

/**
 * POST /api/seller/returns/:id/retry-pickup — retry failed reverse logistics scheduling.
 */
exports.postSellerRetryPickup = async (req, res) => {
  try {
    const sellerId = req.user._id || req.user.id;
    const result = await retrySellerReturnPickup({
      requestId: req.params.id,
      sellerId,
    });

    if (result.invalid) {
      return res.status(400).json({ message: result.message });
    }
    if (result.notFound) {
      return res.status(404).json({ message: result.message || "After-sales case not found" });
    }
    if (result.forbidden) {
      return res.status(403).json({ message: result.message || "Access denied" });
    }
    if (result.notAllowed) {
      return res.status(400).json({ message: result.message });
    }
    if (result.conflict) {
      return res.status(409).json({
        message: result.message || "Pickup scheduling already in progress",
        request: result.request || null,
        logistics: result.logistics || null,
      });
    }

    if (result.logistics?.scheduled) {
      try {
        await sendShopperPickupScheduled(result.request, result.request?.order?._id);
      } catch (emailError) {
        console.error("Error sending pickup scheduled notification email:", emailError);
      }
    }

    const success = !!result.logistics?.scheduled || !!result.logistics?.alreadyScheduled;
    res.status(success ? 200 : 502).json({
      success,
      message: result.logistics?.scheduled
        ? result.logistics?.recovered
          ? "Return pickup recovered and linked"
          : "Return pickup scheduled"
        : result.logistics?.alreadyScheduled
          ? "Return pickup already scheduled"
          : result.logistics?.message || "Failed to schedule return pickup",
      request: result.request,
      logistics: result.logistics || null,
    });
  } catch (err) {
    console.error("❌ Seller retry pickup error:", err);
    res.status(500).json({ message: "Failed to retry return pickup" });
  }
};
