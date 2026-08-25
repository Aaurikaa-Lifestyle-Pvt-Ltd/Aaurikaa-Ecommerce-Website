const {
  createStockNotificationRequest,
  listStockNotificationRequests,
} = require("../services/stockNotificationService");

exports.createNotificationRequest = async (req, res) => {
  try {
    const shopperId = req.user?.id;
    const { productId, variantCombination } = req.body || {};

    if (!productId) {
      return res.status(400).json({ success: false, message: "productId is required." });
    }

    const result = await createStockNotificationRequest({
      shopperId,
      productId,
      variantCombination,
    });

    return res.status(result.statusCode).json({
      success: result.success,
      message: result.message,
      requestId: result.requestId,
      alreadyExists: result.alreadyExists || false,
    });
  } catch (err) {
    console.error("❌ Create stock notification error:", err);
    return res.status(500).json({ success: false, message: "Failed to create notification request." });
  }
};

exports.listNotificationRequests = async (req, res) => {
  try {
    const { status = "pending", page, limit } = req.query;
    const data = await listStockNotificationRequests({ status, page, limit });

    return res.status(200).json({
      success: true,
      ...data,
    });
  } catch (err) {
    console.error("❌ List stock notifications error:", err);
    return res.status(500).json({ success: false, message: "Failed to list notification requests." });
  }
};
