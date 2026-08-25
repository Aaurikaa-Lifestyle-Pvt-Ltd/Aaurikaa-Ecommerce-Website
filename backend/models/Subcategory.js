const mongoose = require("mongoose");

const faqItemSchema = new mongoose.Schema(
  { question: String, answer: String },
  { _id: false }
);

const subCategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Category",
    required: true,
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
    default: undefined, // undefined allows inheriting from parent Category
    min: [0, "Tax rate cannot be negative"],
    max: [100, "Tax rate cannot exceed 100"]
  },
  taxType: {
    type: String,
    default: 'GST',
    enum: ['GST', 'VAT', 'NONE']
  },
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound unique: same slug allowed under different categories, not twice under same category
subCategorySchema.index({ slug: 1, category: 1 }, { unique: true });
// Scope J — taxonomy hierarchy lookups
subCategorySchema.index({ category: 1 });
// Global search entity resolution by name
subCategorySchema.index({ name: 1 });

// Virtual for child categories
subCategorySchema.virtual('childCategories', {
  ref: 'ChildCategory',
  localField: '_id',
  foreignField: 'subcategory'
});

// Pre-save middleware to generate slug
subCategorySchema.pre('save', function (next) {
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

module.exports = mongoose.models.Subcategory || mongoose.model("Subcategory", subCategorySchema);
