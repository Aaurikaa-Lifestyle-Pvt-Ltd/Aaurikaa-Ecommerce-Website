const mongoose = require("mongoose");

const ledgerSchema = new mongoose.Schema({
    seller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Seller',
        required: true,
        index: true
    },

    type: {
        type: String,
        enum: [
            'commission_earned',      // Commission created (pending status)
            'payout_requested',       // Funds locked for payout
            'payout_completed',       // Payout finalized
            'payout_rejected',        // Payout denied, funds released
            'commission_reversed'     // Order cancelled/refunded
        ],
        required: true
    },

    amount: {
        type: Number,
        required: true,
        immutable: true
    },

    balanceAfter: {
        type: Number,
        required: true,
        immutable: true
    },

    reference: {
        model: {
            type: String,
            enum: ['Commission', 'Payout', 'ReturnRequest']
        },
        id: mongoose.Schema.Types.ObjectId
    },

    description: String,

    createdAt: {
        type: Date,
        default: Date.now,
        immutable: true
    }
}, {
    timestamps: false // Only createdAt, no updates
});

// Unique constraint to prevent duplicate entries at same timestamp for the same seller
ledgerSchema.index({ seller: 1, createdAt: 1 }, { unique: true });

// Make entire document immutable - no updates or deletions allowed in code
ledgerSchema.pre('save', function (next) {
    if (!this.isNew) {
        return next(new Error('Ledger entries are immutable and cannot be modified'));
    }
    next();
});

// Prevent document deletion via middleware
ledgerSchema.pre('remove', function (next) {
    return next(new Error('Ledger entries cannot be deleted'));
});

module.exports = mongoose.model('SellerLedger', ledgerSchema);
