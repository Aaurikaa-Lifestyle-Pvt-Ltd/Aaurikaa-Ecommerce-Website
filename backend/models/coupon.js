// models/Coupon.js
const mongoose = require("mongoose");

const CouponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },

    // Discount
    discountType: { type: String, enum: ["percentage", "fixed", "none"], default: "none" },
    discountValue: { type: Number, default: 0 },

    // Free shipping
    freeShipping: { type: Boolean, default: false },

    // Restrictions
    minOrder: { type: Number, default: 0 },
    validFrom: { type: Date },
    validTo: { type: Date },

    // Status
    isActive: { type: Boolean, default: true },

    // Usage tracking
    usageLimit: { type: Number, default: null }, // null = unlimited
    usedCount: { type: Number, default: 0 },
    usageHistory: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shopper' },
      orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
      usedAt: { type: Date, default: Date.now },
      discountAmount: Number,
      orderTotal: Number,
      ipAddress: String,
      userAgent: String
    }],

    // Per-user usage limits
    perUserLimit: { type: Number, default: null }, // null = unlimited per user
    userUsageCount: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shopper' },
      count: { type: Number, default: 0 },
      lastUsed: { type: Date, default: Date.now }
    }]
  },
  { timestamps: true }
);

// prevent OverwriteModelError on hot-reload / multiple imports
module.exports = mongoose.models.Coupon || mongoose.model("Coupon", CouponSchema);
