const mongoose = require("mongoose");

const CouponTemplateSchema = new mongoose.Schema(
  {
    discountType: {
      type: String,
      enum: ["percentage", "fixed"],
      required: true,
    },
    discountValue: { type: Number, required: true },
    minOrder: { type: Number, default: 0 },
    freeShipping: { type: Boolean, default: false },
    /** Days from spin win until coupon expires (admin-configured). */
    validityDays: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const SpinSegmentSchema = new mongoose.Schema({
  label: { type: String, required: true, trim: true },
  type: {
    type: String,
    enum: ["coupon", "lose", "no_reward"],
    required: true,
  },
  weight: { type: Number, required: true, min: 0 },
  displayMessage: { type: String, default: "" },
  couponTemplate: { type: CouponTemplateSchema, default: null },
});

const SpinCampaignSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    status: {
      type: String,
      enum: ["draft", "active", "ended", "disabled"],
      default: "draft",
    },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    headline: { type: String, default: "" },
    description: { type: String, default: "" },
    /** Prefix for generated coupon codes (admin-configured). */
    couponCodePrefix: { type: String, default: "", trim: true, maxlength: 20 },
    segments: {
      type: [SpinSegmentSchema],
      validate: {
        validator(segments) {
          return Array.isArray(segments) && segments.length > 0;
        },
        message: "At least one segment is required",
      },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
  },
  { timestamps: true }
);

SpinCampaignSchema.index({ status: 1, startDate: 1, endDate: 1 });

module.exports =
  mongoose.models.SpinCampaign || mongoose.model("SpinCampaign", SpinCampaignSchema);
