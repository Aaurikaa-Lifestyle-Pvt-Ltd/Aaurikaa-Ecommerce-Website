const mongoose = require("mongoose");

const occasionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, trim: true, default: "", maxlength: 4000 },
    imageUrl: { type: String, trim: true, default: "" },
    imageAlt: { type: String, trim: true, default: "", maxlength: 200 },
    seoTitle: { type: String, trim: true, default: "", maxlength: 120 },
    seoDescription: { type: String, trim: true, default: "", maxlength: 320 },
    productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    isActive: { type: Boolean, default: false },
    showOnHome: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

occasionSchema.index({ isActive: 1, displayOrder: 1 });
occasionSchema.index({ isActive: 1, showOnHome: 1, displayOrder: 1 });

module.exports = mongoose.model("Occasion", occasionSchema);
