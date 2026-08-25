/**
 * Approved Point M financial policy (Phase A decisions codified for Phase D).
 *
 * Trigger: commission/ledger reversal runs on refund completion only.
 * Scope: full-order — every commission tied to the order is reversed per seller line item.
 */

const RETURN_REFUND_FINANCIAL_POLICY = {
  /** When seller-side financial reversal is recognized. */
  reversalTrigger: "refund_completion",

  /** Full-order return reverses all order commissions (multi-seller, per line item). */
  reversalScope: "full_order",

  /** Each commission record is reversed independently (multi-seller allocation). */
  multiSellerAllocation: "per_commission",

  /** Customer refund proceeds; no seller ledger movement when no commission exists. */
  noCommissionBehavior: "skip_seller_reversal",

  /**
   * Terminal paid commissions cannot change status — debit seller ledger only (clawback).
   * Customer refund is platform-operational; seller balance is reduced via ledger.
   */
  paidCommissionBehavior: "ledger_clawback_only",

  /** locked → approved (unlock) before approved → cancelled. */
  lockedCommissionBehavior: "unlock_then_cancel",

  /** Pending payouts containing affected commissions are auto-rejected (funds restored). */
  pendingPayoutBehavior: "auto_reject",

  /**
   * Approved-but-unpaid payouts cannot be rejected by schema — unlock commissions,
   * complete reversal, and surface payout IDs for admin review.
   */
  approvedPayoutBehavior: "unlock_and_warn",

  /** disputed → cancelled is valid when reversing on refund completion. */
  disputedCommissionBehavior: "cancel",

  /** Seller ledger may go negative when clawing back post-payout earnings. */
  allowNegativeSellerBalance: true,
};

module.exports = {
  RETURN_REFUND_FINANCIAL_POLICY,
};
