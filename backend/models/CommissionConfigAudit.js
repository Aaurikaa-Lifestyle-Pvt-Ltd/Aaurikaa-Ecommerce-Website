const mongoose = require("mongoose");

const commissionConfigAuditSchema = new mongoose.Schema({
    entityType: {
        type: String,
        enum: ['Category', 'Seller'],
        required: true
    },

    entityId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true
    },

    changes: [{
        field: String, // 'commissionRate', 'commissionType', etc.
        oldValue: mongoose.Schema.Types.Mixed,
        newValue: mongoose.Schema.Types.Mixed
    }],

    changedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
        required: true
    },

    reason: {
        type: String,
        trim: true
    },

    metadata: {
        ipAddress: String,
        userAgent: String
    }
}, {
    timestamps: { createdAt: true, updatedAt: false }
});

module.exports = mongoose.model('CommissionConfigAudit', commissionConfigAuditSchema);
