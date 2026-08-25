const {
  getWalletSummary,
  listWalletTransactions,
} = require("../services/shopperWalletService");

/**
 * GET /api/shopper/wallet — current balance summary.
 */
exports.getWalletSummary = async (req, res) => {
  try {
    const shopperId = req.user.id || req.user._id;
    const summary = await getWalletSummary(shopperId);
    res.json({ success: true, wallet: summary });
  } catch (err) {
    console.error("Shopper wallet summary error:", err);
    res.status(500).json({ message: "Failed to load wallet balance" });
  }
};

/**
 * GET /api/shopper/wallet/transactions — paginated credit history.
 */
exports.listWalletTransactions = async (req, res) => {
  try {
    const shopperId = req.user.id || req.user._id;
    const { page, limit } = req.query;
    const result = await listWalletTransactions({ shopperId, page, limit });
    res.json({
      success: true,
      transactions: result.transactions,
      pagination: result.pagination,
    });
  } catch (err) {
    console.error("Shopper wallet transactions error:", err);
    res.status(500).json({ message: "Failed to load wallet transactions" });
  }
};
