const mongoose = require("mongoose");

/**
 * Review Model
 * 
 * Standalone collection to persist reviews even when products are deleted.
 * Enforces one review per role per product via unique index.
 */
const reviewSchema = new mongoose.Schema(
  {
    // Product Reference (persists even if product deleted)
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true
    },
    productSku: {
      type: String,
      required: true,
      index: true  // For persistence after product deletion
    },
    
    // Seller Reference (for rating aggregation)
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Seller",
      required: true,
      index: true
    },
    
    // Reviewer Information
    reviewer: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'reviewer.roleModel'  // Dynamic ref based on role
      },
      role: {
        type: String,
        enum: ["shopper", "seller", "admin"],
        required: true
      },
      roleModel: {
        type: String,
        enum: ["Shopper", "Seller", "Admin"],
        required: true
      },
      name: String,  // Denormalized for display
      email: String  // Denormalized for display
    },
    
    // Review Content
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    comment: {
      type: String,
      default: ""
    },
    
    // Review Metadata
    isAuthoritative: {
      type: Boolean,
      default: false  // true for seller/admin reviews
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "approved"
    },

    // Moderation Metadata (populated by admin review moderation workflow)
    moderatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null
    },
    moderatedAt: {
      type: Date,
      default: null
    },
    rejectionReason: {
      type: String,
      default: null,
      maxlength: 500
    },

    // Purchase Verification (for shopper reviews)
    verifiedPurchase: {
      type: Boolean,
      default: false
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order"
    },
    
    // Timestamps
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

// Unique Index: Enforces one review per role per product
reviewSchema.index(
  { product: 1, "reviewer.userId": 1, "reviewer.role": 1 },
  { unique: true }
);

// Additional Indexes for performance
reviewSchema.index({ product: 1 }); // Fast product review lookup
reviewSchema.index({ seller: 1 }); // Fast seller rating aggregation
reviewSchema.index({ productSku: 1 }); // Persistence queries after deletion
reviewSchema.index({ status: 1 }); // Filter approved reviews
reviewSchema.index({ "reviewer.role": 1, isAuthoritative: 1 }); // Query authoritative reviews

// Pre-save middleware to update updatedAt
reviewSchema.pre("save", function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("Review", reviewSchema);



