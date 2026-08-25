const mongoose = require("mongoose");

/**
 * Immutable shopper wallet ledger (credit-only MVP for after-sales refunds).
 * Separate from SellerLedger — shopper balances are not seller funds.
 */
const shopperWalletLedgerSchema = new mongoose.Schema(
  {
    shopper: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shopper",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["refund_credit"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      immutable: true,
    },
    balanceAfter: {
      type: Number,
      required: true,
      immutable: true,
    },
    reference: {
      model: {
        type: String,
        enum: ["ReturnRequest", "Order"],
      },
      id: mongoose.Schema.Types.ObjectId,
    },
    /** Prevents duplicate credits for the same after-sales refund. */
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    description: { type: String, default: null, maxlength: 500 },
    createdAt: {
      type: Date,
      default: Date.now,
      immutable: true,
    },
  },
  { timestamps: false }
);

shopperWalletLedgerSchema.index({ shopper: 1, createdAt: -1 });

shopperWalletLedgerSchema.pre("save", function preventLedgerMutation(next) {
  if (!this.isNew) {
    return next(new Error("Shopper wallet ledger entries are immutable"));
  }
  return next();
});

module.exports = mongoose.model("ShopperWalletLedger", shopperWalletLedgerSchema);
