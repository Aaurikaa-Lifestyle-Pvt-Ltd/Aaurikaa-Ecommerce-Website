const mongoose = require("mongoose");

const stockNotificationRequestSchema = new mongoose.Schema(
  {
    shopper: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shopper",
      required: true,
      index: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    variantCombination: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },
    variantKey: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "notified", "cancelled"],
      default: "pending",
      index: true,
    },
    notifiedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

stockNotificationRequestSchema.index(
  { shopper: 1, product: 1, variantKey: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "pending" },
  }
);

stockNotificationRequestSchema.index({ product: 1, status: 1 });

module.exports = mongoose.model("StockNotificationRequest", stockNotificationRequestSchema);
