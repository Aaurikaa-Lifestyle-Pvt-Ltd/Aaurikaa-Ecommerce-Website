// models/Shopper.js
const mongoose = require("mongoose");
const { sanitizeShopperArrayFields } = require("../utils/sanitizeShopperArrays");

const shopperSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String },
    // Google-only accounts always get a random bcrypt hash at creation (unusable for password login).
    // Password-auth accounts keep a real hash. Field stays required so existing bcrypt.compare paths stay safe.
    password: { type: String, required: true },
    googleId: { type: String, unique: true, sparse: true },
    role: { type: String, default: "shopper" },
    profileImage: { type: String, default: "" },
    otp: { type: String },              // ✅ OTP for password reset
    otpExpiry: { type: Date },          // ✅ OTP expiry time
    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }], // ✅ Shopper's wishlist
    cart: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        quantity: { type: Number, default: 1 },
        variantCombination: { type: mongoose.Schema.Types.Mixed, default: undefined }, // Optional variant selection
        variantKey: { type: String, default: undefined }, // Normalized variant key for identity matching
        variantPriceSnapshot: { type: Number, default: undefined }, // Snapshot of variant price at add-to-cart time
        image: { type: String, default: undefined }, // Snapshot of variant/product image at add-to-cart time
      },
    ], // ✅ Shopper's cart
    compareList: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        addedAt: { type: Date, default: Date.now }
      }
    ], // ✅ Shopper's compare list
  },
  { timestamps: true }
);

shopperSchema.pre("save", function (next) {
  sanitizeShopperArrayFields(this);
  next();
});

module.exports = mongoose.model("Shopper", shopperSchema);
