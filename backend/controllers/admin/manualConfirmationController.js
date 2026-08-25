const {
  listManualConfirmationQueue,
  updateManualConfirmationStatus,
} = require("../../services/manualConfirmationService");

/**
 * GET /api/admin/orders/manual-confirmations — paginated confirmation queue.
 */
exports.listConfirmationQueue = async (req, res) => {
  try {
    const { page, limit, status } = req.query;
    const result = await listManualConfirmationQueue({ page, limit, status });

    res.json({
      success: true,
      orders: result.orders,
      pagination: result.pagination,
    });
  } catch (err) {
    console.error("❌ Manual confirmation queue error:", err);
    res.status(500).json({ message: "Failed to fetch manual confirmation queue" });
  }
};

/**
 * PATCH /api/admin/orders/:id/manual-confirmation — update confirmation status.
 */
exports.patchConfirmationStatus = async (req, res) => {
  try {
    const adminId = req.user._id || req.user.id;
    const { id } = req.params;
    const { status, notes } = req.body || {};

    const result = await updateManualConfirmationStatus({
      orderId: id,
      adminId,
      status,
      notes,
    });

    if (result.invalid) {
      return res.status(400).json({ message: result.message });
    }

    if (result.notFound) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (result.notAllowed) {
      return res.status(400).json({ message: result.message });
    }

    res.json({
      success: true,
      message: "Manual confirmation status updated",
      orderId: id,
      manualConfirmation: result.manualConfirmation,
    });
  } catch (err) {
    console.error("❌ Manual confirmation update error:", err);
    res.status(500).json({ message: "Failed to update manual confirmation status" });
  }
};
