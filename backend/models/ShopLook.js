const mongoose = require("mongoose");

const shopLookSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, trim: true, default: "", maxlength: 4000 },
    imageUrl: { type: String, trim: true, default: "" },
    imageAlt: { type: String, trim: true, default: "", maxlength: 200 },
    mobileImageUrl: { type: String, trim: true, default: "" },
    mobileImageAlt: { type: String, trim: true, default: "", maxlength: 200 },
    ctaLabel: { type: String, trim: true, default: "", maxlength: 80 },
    ctaHref: { type: String, trim: true, default: "" },
    productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    isActive: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

shopLookSchema.index({ isActive: 1, displayOrder: 1 });

module.exports = mongoose.model("ShopLook", shopLookSchema);
