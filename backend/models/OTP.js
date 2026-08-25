// backend/models/OTP.js

const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      index: true
    },
    otp: {
      type: String,
      required: true
    },
    purpose: {
      type: String,
      enum: ["registration", "password_reset"],
      required: true
    },
    userType: {
      type: String,
      enum: ["admin", "seller", "shopper"],
      required: true
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 } // MongoDB TTL index
    },
    isUsed: {
      type: Boolean,
      default: false
    },
    attempts: {
      type: Number,
      default: 0,
      max: 3
    }
  },
  { timestamps: true }
);

// Index for efficient queries
otpSchema.index({ email: 1, purpose: 1, userType: 1 });

module.exports = mongoose.model("OTP", otpSchema);
