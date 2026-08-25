const express = require("express");
const router = express.Router();

// Import controllers
const {
  getSellerPayoutSummary,
  addPaymentMethod,
  requestPayout,
  getPayoutHistory,
  updatePaymentMethod,
  deletePaymentMethod,
  getSellerLedger
} = require("../controllers/sellerPayoutController");

// Import middleware
const verifySeller = require("../middleware/verifySeller");
const { validatePayment, validateBankAccount } = require("../middleware/sellerValidation");

// =========================
// 🎯 Seller Payout Routes
// =========================

/**
 * @route   GET /api/seller/payouts/summary
 * @desc    Get seller payout summary (available balance, payment methods)
 * @access  Private (Seller)
 */
router.get("/summary", verifySeller, getSellerPayoutSummary);

/**
 * @route   POST /api/seller/payouts/payment-methods
 * @desc    Add a new payment method for payouts
 * @access  Private (Seller)
 */
router.post("/payment-methods", verifySeller, addPaymentMethod);

/**
 * @route   PUT /api/seller/payouts/payment-methods/:paymentMethodId
 * @desc    Update a payment method
 * @access  Private (Seller)
 */
router.put("/payment-methods/:paymentMethodId", verifySeller, updatePaymentMethod);

/**
 * @route   DELETE /api/seller/payouts/payment-methods/:paymentMethodId
 * @desc    Delete a payment method
 * @access  Private (Seller)
 */
router.delete("/payment-methods/:paymentMethodId", verifySeller, deletePaymentMethod);

/**
 * @route   POST /api/seller/payouts/request
 * @desc    Request a payout
 * @access  Private (Seller)
 */
router.post("/request", verifySeller, validatePayment, requestPayout);

/**
 * @route   GET /api/seller/payouts/history
 * @desc    Get payout history
 * @access  Private (Seller)
 */
router.get("/history", verifySeller, getPayoutHistory);

router.get("/ledger", verifySeller, getSellerLedger);

module.exports = router;
