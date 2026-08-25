const mongoose = require("mongoose");
const { parseBulkDiscount } = require("../utils/bulkDiscountParser");
const { buildSlugWithRandomSuffix } = require("../utils/slugUtils");

/* ---------- Sub-Schemas ---------- */
const variantSchema = new mongoose.Schema(
  { type: { type: String, required: true }, values: [String] },
  { _id: false }
);

const featureSchema = new mongoose.Schema(
  {
    key: String,
    value: String,
    /** Catalogue identity (KeyFeatureCatalogue.code). Omitted on legacy rows. */
    code: { type: String, default: undefined },
    /** Multi-select values. Omitted for single-value and legacy rows. */
    values: { type: [String], default: undefined },
  },
  { _id: false }
);

const qaSchema = new mongoose.Schema(
  { question: String, answer: String },
  { _id: false }
);

const usageSchema = new mongoose.Schema(
  { title: String, instruction: String },
  { _id: false }
);

// Note: reviewSchema removed - reviews are now in separate Review collection
// This allows reviews to persist even when products are deleted

/* ---------- Main Product Schema ---------- */
const productSchema = new mongoose.Schema(
  {
    // Basic Info
    name: { type: String, required: true },
    slug: { type: String, unique: true, index: true }, // ✅ Added slug
    sku: { type: String, unique: true, required: true }, // ✅ ইউনিক আইডেন্টিফায়ার

    // Relations
    brand: { type: mongoose.Schema.Types.ObjectId, ref: "Brand" },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "Seller" },
    admin: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" }, // Keep for legacy/published tracking
    ownerUserId: { type: mongoose.Schema.Types.ObjectId }, // ✅ Fixed: User-scoped ownership (admin or seller)
    sellerShop: { type: mongoose.Schema.Types.ObjectId, ref: "Seller" }, // Changed from SellerShop to Seller

    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
    subcategory: { type: mongoose.Schema.Types.ObjectId, ref: "Subcategory" },
    childCategory: { type: mongoose.Schema.Types.ObjectId, ref: "ChildCategory" },

    // WS-1 / 1.6 — additional taxonomy paths (additive; default empty)
    secondaryCategories: {
      type: [
        {
          category: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
          subcategory: { type: mongoose.Schema.Types.ObjectId, ref: "Subcategory" },
          childCategory: { type: mongoose.Schema.Types.ObjectId, ref: "ChildCategory" },
          _id: false,
        },
      ],
      default: [],
    },

    // Pricing & Stock
    regularPrice: { type: Number, required: true },
    salePrice: { type: Number },
    stock: { type: Number, default: 0 },

    // Bulk Discount & Tiered Pricing
    bulkDiscount: {
      enabled: { type: Boolean, default: false },
      tiers: [{
        minQuantity: { type: Number, required: true, min: 1 },
        maxQuantity: { type: Number, min: 1 },
        discountType: {
          type: String,
          enum: ['percentage', 'fixed'],
          required: true
        },
        discountValue: { type: Number, required: true, min: 0 },
        price: { type: Number, min: 0 } // Calculated price after discount
      }]
    },

    // Dimensions
    length: Number,
    width: Number,
    height: Number,
    weight: Number,

    // Tax & Shipping
    // Shipping Slab (WeightClass) — pricing classification; product.weight remains logistics-only.
    // Required on Publish. Drafts and the operator Product CSV may omit it.
    // Schema stays nullable for migration safety.
    weightClass: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WeightClass",
      default: null,
    },
    taxRate: { type: Number, default: 0 }, // ✅ ট্যাক্স রেট (in %)
    taxIncluded: { type: Boolean, default: false }, // ✅ প্রাইসে ট্যাক্স আছে কিনা
    deliveryTime: String,

    /**
     * WS-3 / 1.4 — optional product-level trust flag.
     * Omitted/false on existing products: Genuine Product indicator is not shown.
     */
    genuineProduct: { type: Boolean, default: false },

    /**
     * WS-3 / 1.4 — structured warranty (not PDP-only free text).
     * Displayed only when available is true (and/or duration/terms present).
     */
    warranty: {
      available: { type: Boolean, default: false },
      duration: { type: String, default: "", maxlength: 120 },
      coverage: { type: String, default: "", maxlength: 500 },
      terms: { type: String, default: "", maxlength: 4000 },
    },

    /**
     * WS-3 / 1.4 — structured manufacturer conditions.
     * Displayed when any nested field is non-empty.
     * details = Manufacturer Details body; countryOfOrigin / marketedBy /
     * grievanceRedressal are jewellery-content enrichment (optional).
     */
    manufacturerConditions: {
      summary: { type: String, default: "", maxlength: 500 },
      details: { type: String, default: "", maxlength: 100000 },
      countryOfOrigin: { type: String, default: "", maxlength: 500 },
      marketedBy: { type: String, default: "", maxlength: 500 },
      grievanceRedressal: { type: String, default: "", maxlength: 4000 },
    },

    /**
     * Optional product-level return policy override.
     * inherit = use seller default; override = product fields apply.
     * No platform fallback.
     */
    returnPolicyMode: {
      type: String,
      enum: ["inherit", "override"],
      default: "inherit",
      set: (v) => (typeof v === "string" ? v.toLowerCase() : v),
    },
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
    returnConditions: {
      type: String,
      default: null,
      maxlength: 2000,
    },

    // Descriptions
    shortDesc: String,
    longDesc: String,
    usageInstructions: [usageSchema], // Optional "How to Use" content for PDP
    // Structured sections (new architecture)
    featuresContent: { type: String, default: "" },
    usageSafetyContent: { type: String, default: "" },

    // Media
    mainImage: String,
    mainImageId: { type: mongoose.Schema.Types.ObjectId, ref: "Media" },
    galleryImages: [String],
    galleryImageIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Media" }],
    video: String,
    videoId: { type: mongoose.Schema.Types.ObjectId, ref: "Media" },

    // Variants / Features / Q&A
    variants: [variantSchema],
    features: [featureSchema],
    qandas: [qaSchema],

    // Cross Promotions
    upsellSkus: [String],
    crossSellSkus: [String],
    boughtTogetherSkus: [String],

    // Flags & Status
    isFeatured: { type: Boolean, default: false },
    salesCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["draft", "published", "inactive", "archived", "trash"],
      default: "draft",
    },
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: undefined, // No default - only set when product is published
      required: false, // Optional - drafts don't need approval status
    },

    // SEO
    tags: [String], // ✅ Multiple tags allowed
    metaTitle: String,
    metaDescription: String,
    metaKeywords: String, // Optional SEO keywords
    seo: {
      primaryKeyword: {
        type: String,
        trim: true,
        maxlength: 120,
        index: true,
        default: undefined
      }
    },

    // HSN Code
    hsnCode: String, // Optional HSN code

    // Reviews & Ratings (aggregated, not embedded)
    // Reviews are stored in separate Review collection for persistence
    avgRating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },

    // Variant Infrastructure (Phase 1 - Optional, Additive)
    // Source of truth for allowed variant combinations (derived from variants array)
    variantDefinitions: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined, // Explicitly undefined to avoid default object
    },
    // Variant-level pricing: { variantKey: { price: Number, salePrice: Number } }
    variantPricing: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },
    // Variant-level stock: { variantKey: Number }
    variantStock: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },
    // Variant-level media: { variantKey: { mainImage: String, galleryImages: [String], video: String } }
    variantMedia: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },
    // Variant-level SKU: { variantKey: String } - Mandatory unique SKU for each variant combination
    variantSku: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },
    // Tracking for Bulk Imports (SRS 4.3.1)
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ImportBatch",
      index: true,
    },
    importDecision: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
      index: true
    },
  },
  { timestamps: true }
);

/* ---------- Note: Rating updates now handled by ratingAggregationService ---------- */
/* ---------- Reviews are in separate Review collection, not embedded ---------- */

/* ---------- Bulk Discount Calculation Method ---------- */
productSchema.methods.calculateBulkPrice = function (quantity) {
  if (!this.bulkDiscount.enabled || !this.bulkDiscount.tiers || this.bulkDiscount.tiers.length === 0) {
    return this.regularPrice;
  }

  // Find the appropriate tier for the given quantity
  const applicableTier = this.bulkDiscount.tiers.find(tier => {
    const meetsMin = quantity >= tier.minQuantity;
    const meetsMax = !tier.maxQuantity || quantity <= tier.maxQuantity;
    return meetsMin && meetsMax;
  });

  if (applicableTier) {
    return applicableTier.price;
  }

  // If no tier matches, return regular price
  return this.regularPrice;
};

productSchema.methods.getBulkDiscountInfo = function (quantity) {
  if (!this.bulkDiscount.enabled || !this.bulkDiscount.tiers || this.bulkDiscount.tiers.length === 0) {
    return null;
  }

  const applicableTier = this.bulkDiscount.tiers.find(tier => {
    const meetsMin = quantity >= tier.minQuantity;
    const meetsMax = !tier.maxQuantity || quantity <= tier.maxQuantity;
    return meetsMin && meetsMax;
  });

  if (applicableTier) {
    return {
      tier: applicableTier,
      originalPrice: this.regularPrice,
      discountedPrice: applicableTier.price,
      savings: this.regularPrice - applicableTier.price,
      savingsPercentage: ((this.regularPrice - applicableTier.price) / this.regularPrice) * 100
    };
  }

  return null;
};

// Note: Review-based rating updates removed - handled by ratingAggregationService
// Reviews are now in separate Review collection

/* ---------- Ensure ownerUserId for delete/trash (safety net) ---------- */
productSchema.pre("save", function (next) {
  if (this.ownerUserId == null && this.seller) {
    this.ownerUserId = this.seller;
  }
  
  // Auto-generate slug from title
  if ((this.isModified("name") || !this.slug) && this.name) {
    // Append random string to ensure uniqueness (centralized utility)
    this.slug = buildSlugWithRandomSuffix(this.name);
  }
  
  next();
});

/* ---------- Bulk Discount Validation ---------- */
productSchema.pre("save", function (next) {
  if (this.isModified("bulkDiscount") && this.bulkDiscount) {
    // Use shared utility to parse and clean bulkDiscount data
    this.bulkDiscount = parseBulkDiscount(this.bulkDiscount);

    if (this.bulkDiscount.enabled) {
      // Validate bulk discount tiers
      if (!this.bulkDiscount.tiers || this.bulkDiscount.tiers.length === 0) {
        return next(new Error("Bulk discount tiers are required when bulk discount is enabled"));
      }

      // Sort tiers by minQuantity
      this.bulkDiscount.tiers.sort((a, b) => a.minQuantity - b.minQuantity);

      // Validate tier structure
      for (let i = 0; i < this.bulkDiscount.tiers.length; i++) {
        const tier = this.bulkDiscount.tiers[i];

        // Validate minQuantity is less than maxQuantity (if maxQuantity exists)
        if (tier.maxQuantity && tier.minQuantity >= tier.maxQuantity) {
          return next(new Error(`Tier ${i + 1}: minQuantity must be less than maxQuantity`));
        }

        // Validate discount value limits
        if (tier.discountType === 'percentage' && tier.discountValue > 100) {
          return next(new Error(`Tier ${i + 1}: Percentage discount cannot exceed 100%`));
        }

        if (tier.discountType === 'fixed' && tier.discountValue >= this.regularPrice) {
          return next(new Error(`Tier ${i + 1}: Fixed discount cannot exceed regular price`));
        }

        // Calculate and set the discounted price
        if (tier.discountType === 'percentage') {
          tier.price = this.regularPrice * (1 - tier.discountValue / 100);
        } else {
          tier.price = Math.max(0, this.regularPrice - tier.discountValue);
        }

        // Validate no overlapping quantity ranges
        if (i > 0) {
          const prevTier = this.bulkDiscount.tiers[i - 1];
          if (prevTier.maxQuantity && tier.minQuantity <= prevTier.maxQuantity) {
            return next(new Error(`Tier ${i + 1}: Quantity ranges cannot overlap with previous tier`));
          }
        }
      }
    }
  }
  next();
});

// Index for featured products (Objective 4.9 – homepage / API)
productSchema.index({ isFeatured: 1 });
// Index for best sellers (Objective 4.9)
productSchema.index({ salesCount: -1 });
// Compound indexes for filtered product queries (homepage bundle, listing)
productSchema.index({ status: 1, approvalStatus: 1, createdAt: -1 });
productSchema.index({ status: 1, approvalStatus: 1, isFeatured: 1 });
productSchema.index({ status: 1, approvalStatus: 1, salesCount: -1 });
productSchema.index({ status: 1, approvalStatus: 1, category: 1 });
productSchema.index({ status: 1, approvalStatus: 1, seller: 1, salesCount: -1 });

// Scope J — admin/seller product listing pagination & filters
productSchema.index({ ownerUserId: 1, status: 1, createdAt: -1 });
productSchema.index({ seller: 1, status: 1, createdAt: -1 });
productSchema.index({ status: 1, createdAt: -1 });
productSchema.index({ brand: 1, status: 1, createdAt: -1 });
productSchema.index({ category: 1, status: 1, createdAt: -1 });
productSchema.index({ subcategory: 1, status: 1, createdAt: -1 });
// Global search: tag-filtered lookups on published/approved products
productSchema.index({ status: 1, approvalStatus: 1, tags: 1 });

function scheduleRestockNotificationCheck(productId) {
  if (!productId) return;
  setImmediate(() => {
    const { processRestockNotificationsForProduct } = require("../services/stockNotificationService");
    processRestockNotificationsForProduct(productId).catch((err) => {
      console.error("❌ Restock notification processing error:", err.message);
    });
  });
}

productSchema.post("save", function postSaveRestockCheck(doc) {
  if (doc?._id) scheduleRestockNotificationCheck(doc._id);
});

productSchema.post("findOneAndUpdate", function postUpdateRestockCheck(doc) {
  if (doc?._id) scheduleRestockNotificationCheck(doc._id);
});

module.exports = mongoose.model("Product", productSchema);
