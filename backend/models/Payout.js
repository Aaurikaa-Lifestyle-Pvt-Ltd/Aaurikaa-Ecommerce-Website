const mongoose = require("mongoose");

const payoutSchema = new mongoose.Schema({
    seller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Seller',
        required: true,
        index: true
    },

    amount: {
        type: Number,
        required: true,
        min: [0, "Payout amount cannot be negative"],
        immutable: true
    },

    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'paid'],
        default: 'pending',
        index: true
    },

    paymentMethod: {
        type: {
            type: String,
            enum: ['bank_transfer', 'upi'],
            required: true
        },
        details: {
            accountNumber: String,
            ifscCode: String,
            upiId: String
        }
    },

    commissions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Commission'
    }],

    requestedAt: {
        type: Date,
        default: Date.now,
        immutable: true
    },

    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin'
    },

    approvedAt: Date,
    processedAt: Date,

    rejectionReason: String,

    transactionReference: String,

    notes: String
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Immutability guard for amount
payoutSchema.pre('save', function (next) {
    if (!this.isNew && this.isModified('amount')) {
        return next(new Error('Payout amount cannot be modified after creation'));
    }
    next();
});

// Track original values for state machine validation
payoutSchema.post('init', function () {
    this._original = this.toObject();
});

// State machine transition logic
payoutSchema.pre('save', function (next) {
    if (this.isNew) return next();

    const allowedTransitions = {
        'pending': ['approved', 'rejected'],
        'approved': ['paid'],
        'rejected': [],
        'paid': []
    };

    if (this.isModified('status')) {
        const oldStatus = this._original?.status || 'pending';
        const newStatus = this.status;
        const validNext = allowedTransitions[oldStatus] || [];

        if (!validNext.includes(newStatus)) {
            return next(new Error(`Invalid payout status transition: ${oldStatus} → ${newStatus}`));
        }
    }
    next();
});

module.exports = mongoose.model('Payout', payoutSchema);
