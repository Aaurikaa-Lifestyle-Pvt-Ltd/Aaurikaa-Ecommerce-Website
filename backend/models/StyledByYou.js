const mongoose = require("mongoose");

const styledByYouSchema = new mongoose.Schema(
  {
    mediaType: { type: String, enum: ["image", "video"], default: "image" },
    imageUrl: { type: String, trim: true, default: "" },
    imageAlt: { type: String, trim: true, default: "", maxlength: 200 },
    videoUrl: { type: String, trim: true, default: "" },
    creatorName: { type: String, trim: true, default: "", maxlength: 120 },
    caption: { type: String, trim: true, default: "", maxlength: 1000 },
    productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    externalUrl: { type: String, trim: true, default: "" },
    isActive: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

styledByYouSchema.index({ isActive: 1, displayOrder: 1 });

module.exports = mongoose.model("StyledByYou", styledByYouSchema);
