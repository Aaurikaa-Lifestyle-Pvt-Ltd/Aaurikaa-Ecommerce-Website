const mongoose = require("mongoose");

const SpinAttemptSchema = new mongoose.Schema(
  {
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SpinCampaign",
      required: true,
    },
    shopperId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shopper",
      required: true,
    },
    segmentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    outcome: {
      type: String,
      enum: ["win", "lose", "no_reward"],
      required: true,
    },
    couponId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon",
      default: null,
    },
    couponCode: { type: String, default: null },
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  { timestamps: true }
);

SpinAttemptSchema.index({ campaignId: 1, shopperId: 1 }, { unique: true });
SpinAttemptSchema.index({ campaignId: 1, createdAt: -1 });
SpinAttemptSchema.index({ shopperId: 1, createdAt: -1 });

module.exports =
  mongoose.models.SpinAttempt || mongoose.model("SpinAttempt", SpinAttemptSchema);
