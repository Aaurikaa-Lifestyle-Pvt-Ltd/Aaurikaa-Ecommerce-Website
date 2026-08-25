const mongoose = require("mongoose");

const sellerSchema = new mongoose.Schema(
  {
    // Basic Info
    firstName: { type: String },
    lastName: { type: String },
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String },

    // Authentication
    password: { type: String }, // hashed password

    // Shop Info
    shopName: { type: String },
    shopUrl: { type: String, unique: true },

    // Address
    address: {
      address1: { type: String },
      address2: { type: String },
      pincode: { type: String },
      country: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Country"
      },
      state: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "State"
      },
      district: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "District"
      },
    },

    // Approval System
    isApproved: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false }, // Email verification status
    approvalHistory: [
      {
        status: {
          type: String,
          enum: ["approved", "rejected"],
          required: true,
        },
        reason: { type: String }, // Only for rejection
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
        updatedAt: { type: Date, default: Date.now },
      },
    ],

    // Role
    role: { type: String, default: "seller" },

    // Documents & Media

    profileImage: { type: String },
    shopImage: { type: String },
    aadhaarFront: { type: String },
    aadhaarBack: { type: String },
    tradeLicense: { type: String },
    panCard: { type: String },
    gst: { type: String },
    otherDocs: [{ type: String }],

    // Bank Account Details
    bankAccount: {
      accountHolderName: {
        type: String,
        trim: true
      },
      accountNumber: {
        type: String,
        trim: true,
        validate: {
          validator: function (v) {
            return !v || /^\d{9,18}$/.test(v);
          },
          message: "Account number must be 9-18 digits"
        }
      },
      accountNumberConfirm: {
        type: String,
        validate: {
          validator: function (v) {
            // Only validate if accountNumber is provided
            if (!this.bankAccount?.accountNumber) return true;
            return v === this.bankAccount.accountNumber;
          },
          message: "Account numbers do not match"
        }
      },
      ifscCode: {
        type: String,
        uppercase: true,
        trim: true,
        validate: {
          validator: function (v) {
            return !v || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v);
          },
          message: "Invalid IFSC code format"
        }
      },
      bankName: { type: String, trim: true },
      branch: { type: String, trim: true },
      accountType: {
        type: String,
        enum: ["Savings", "Current"],
        default: "Savings"
      },
      upiId: {
        type: String,
        trim: true,
        lowercase: true,
        validate: {
          validator: function (v) {
            return !v || /^[\w.-]+@[\w.-]+$/.test(v);
          },
          message: "Invalid UPI ID format"
        }
      }
    },

    paymentMethods: [
      {
        type: {
          type: String,
          enum: ['bank_transfer', 'upi', 'wallet'],
          required: true
        },
        details: {
          accountNumber: String,
          ifscCode: String,
          upiId: String,
          walletId: String,
          verified: { type: Boolean, default: false }
        },
        isDefault: { type: Boolean, default: false }
      }
    ],

    // Commission Settings
    commissionType: {
      type: String,
      enum: ['percentage', 'flat'],
      default: 'percentage'
    },
    commission: {
      type: Number, // Default commission for seller (percentage rate)
      default: 0,
      min: [0, "Commission cannot be negative"]
    },
    commissionAmount: {
      type: Number, // Used only when commissionType is 'flat'
      default: 0,
      min: [0, "Commission amount cannot be negative"]
    },
    categoryCommission: [
      {
        categoryId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Category",
          required: true
        },
        commissionType: {
          type: String,
          enum: ['percentage', 'flat'],
          required: true,
          default: 'percentage'
        },
        commissionRate: {
          type: Number, // For percentage type
          min: [0, "Commission rate cannot be negative"]
        },
        commissionAmount: {
          type: Number, // For flat type
          min: [0, "Commission amount cannot be negative"]
        }
      },
    ],

    // Seller Rating Aggregation (from product reviews)
    avgRating: {
      type: Number,
      default: 0
    },
    reviewCount: {
      type: Number,
      default: 0
    },
    ratingBreakdown: {
      fiveStar: { type: Number, default: 0 },
      fourStar: { type: Number, default: 0 },
      threeStar: { type: Number, default: 0 },
      twoStar: { type: Number, default: 0 },
      oneStar: { type: Number, default: 0 }
    },
    // Shiprocket Pickup Location
    pickupLocation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SellerPickupLocation"
    },

    /**
     * Seller default after-sales policy (mandatory commercial decision).
     * null = not yet configured (blocks eligibility / product publish).
     * No platform inherit — sellers must set these explicitly.
     */
    returnAllowed: {
      type: Boolean,
      default: null,
    },
    returnWindowDays: {
      type: Number,
      default: null,
      min: 1,
      max: 365,
      validate: {
        validator(value) {
          return value == null || Number.isInteger(value);
        },
        message: "Return window must be a whole number of days",
      },
    },
    /** Free-text return conditions (e.g. unused with tags, original packaging). */
    returnConditions: {
      type: String,
      default: null,
      maxlength: 2000,
    },
  },
  { timestamps: true }
);

// Global search entity resolution: approved sellers by shop name
sellerSchema.index({ isApproved: 1, shopName: 1 });

module.exports = mongoose.model("Seller", sellerSchema);
