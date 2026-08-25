/**
 * Financial integrity validator (non-blocking, monitoring only).
 * Compares expected seller balance derived from Commission + ledger payout entries
 * with last SellerLedger.balanceAfter. Logs mismatch; never throws.
 */

const Commission = require("../models/Commission");
const SellerLedger = require("../models/SellerLedger");
const mongoose = require("mongoose");

/**
 * Validates that SellerLedger balance matches expected balance from Commission + payout ledger entries.
 * Expected = sum(orderAmount - commissionAmount) for approved/locked/paid commissions
 *            minus payout_requested debits plus payout_rejected credits.
 * @param {mongoose.Types.ObjectId} sellerId - Seller ID
 * @returns {Promise<void>} - Never throws; logs structured error on mismatch
 */
async function validateSellerLedgerIntegrity(sellerId) {
  try {
    if (!sellerId || !mongoose.Types.ObjectId.isValid(sellerId)) return;

    // 1. Aggregate seller net from Commission (approved, locked, paid)
    const commissionResult = await Commission.aggregate([
      {
        $match: {
          seller: sellerId,
          status: { $in: ["approved", "locked", "paid"] },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $subtract: ["$orderAmount", "$commissionAmount"] } },
        },
      },
    ]);

    const expectedFromCommissions =
      commissionResult.length > 0 ? commissionResult[0].total : 0;

    // 2. Ledger: payout_requested debits (amount is negative) and payout_rejected credits
    const ledgerSums = await SellerLedger.aggregate([
      { $match: { seller: sellerId } },
      {
        $group: {
          _id: "$type",
          sumAmount: { $sum: "$amount" },
        },
      },
    ]);

    const payoutRequestedDebit = Math.abs(
      ledgerSums.find((x) => x._id === "payout_requested")?.sumAmount || 0
    );
    const payoutRejectedCredit =
      ledgerSums.find((x) => x._id === "payout_rejected")?.sumAmount || 0;
    const commissionEarnedTotal =
      ledgerSums.find((x) => x._id === "commission_earned")?.sumAmount || 0;
    const commissionReversedDebit = Math.abs(
      ledgerSums.find((x) => x._id === "commission_reversed")?.sumAmount || 0
    );

    // Expected balance = commission earned + payout_rejected - |payout_requested| - |commission_reversed|
    const expectedBalance =
      commissionEarnedTotal +
      payoutRejectedCredit -
      payoutRequestedDebit -
      commissionReversedDebit;

    const lastEntry = await SellerLedger.findOne({ seller: sellerId })
      .sort({ createdAt: -1 })
      .lean();

    const ledgerBalance = lastEntry ? lastEntry.balanceAfter : 0;
    const difference = Math.round((expectedBalance - ledgerBalance) * 100) / 100;

    if (Math.abs(difference) > 0.01) {
      console.error(
        "[financialIntegrity] Seller ledger mismatch",
        JSON.stringify({
          sellerId: sellerId.toString(),
          expectedBalance,
          ledgerBalance,
          difference,
        })
      );
    }
  } catch (err) {
    // Non-blocking: do not throw
    console.error("[financialIntegrity] Validation error:", err.message);
  }
}

module.exports = {
  validateSellerLedgerIntegrity,
};
