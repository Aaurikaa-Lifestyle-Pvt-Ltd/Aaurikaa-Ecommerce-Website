const mongoose = require("mongoose");

const faqItemSchema = new mongoose.Schema(
  { question: String, answer: String },
  { _id: false }
);

const childCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Child category name is required"],
      trim: true,
    },
    subcategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subcategory",
      required: [true, "Subcategory reference is required"],
    },
    slug: {
      type: String,
      lowercase: true,
      trim: true,
    },
    image: {
      type: String,
      validate: {
        validator: function (v) {
          if (!v) return true;
          return /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(v);
        },
        message: "Image must be a valid image file (jpg, jpeg, png, gif, webp, svg)"
      }
    },
    description: {
      type: String,
      trim: true
    },
    title: {
      type: String,
      trim: true
    },
    faq: [faqItemSchema],
    // GST Engine v2 Fields
    taxRate: {
      type: Number,
      default: undefined,
      min: [0, "Tax rate cannot be negative"],
      max: [100, "Tax rate cannot exceed 100"]
    },
    taxType: {
      type: String,
      default: 'GST',
      enum: ['GST', 'VAT', 'NONE']
    },
  },
  {
    timestamps: true, // ✅ createdAt এবং updatedAt যুক্ত করবে
  }
);

// Compound unique: same slug allowed under different subcategories, not twice under same subcategory
childCategorySchema.index({ slug: 1, subcategory: 1 }, { unique: true });
// Scope J — taxonomy hierarchy lookups
childCategorySchema.index({ subcategory: 1 });
// Global search entity resolution by name
childCategorySchema.index({ name: 1 });

// Pre-save middleware to generate slug
childCategorySchema.pre('save', function (next) {
  if (this.isModified('name') || !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9\s\-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim('-');
  }
  next();
});

module.exports = mongoose.models.ChildCategory || mongoose.model("ChildCategory", childCategorySchema);
