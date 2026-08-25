const mongoose = require("mongoose");

const faqItemSchema = new mongoose.Schema(
  { question: String, answer: String },
  { _id: false }
);

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Category name is required"],
    unique: true,
    trim: true,
    minlength: [2, "Category name must be at least 2 characters long"],
    maxlength: [50, "Category name cannot exceed 50 characters"],
    validate: {
      validator: function (v) {
        return /^[a-zA-Z0-9\s\-&.]+$/.test(v);
      },
      message: "Category name can only contain letters, numbers, spaces, hyphens, ampersands, and periods"
    }
  },
  image: {
    type: String,
    validate: {
      validator: function (v) {
        if (!v) return true; // Optional field
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
  slug: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: function (v) {
        if (!v) return true; // Optional field
        return /^[a-z0-9\-]+$/.test(v);
      },
      message: "Slug can only contain lowercase letters, numbers, and hyphens"
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  parentCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null
  },
  level: {
    type: Number,
    default: 0,
    min: [0, "Level cannot be negative"]
  },
  // GST Engine v2 Fields
  taxRate: {
    type: Number,
    default: 0,
    min: [0, "Tax rate cannot be negative"],
    max: [100, "Tax rate cannot exceed 100"]
  },
  taxType: {
    type: String,
    default: 'GST',
    enum: ['GST', 'VAT', 'NONE']
  },
  showInMegaMenu: {
    type: Boolean,
    default: false
  },
  megaMenuOrder: {
    type: Number,
    default: 0
  },
  // Commission System v2 Fields
  commissionRate: {
    type: Number,
    min: [0, "Commission rate cannot be negative"],
    max: [100, "Commission rate cannot exceed 100"]
  },
  commissionType: {
    type: String,
    enum: ['percentage', 'flat'],
    default: 'percentage'
  },
  commissionAmount: {
    type: Number,
    min: [0, "Commission amount cannot be negative"]
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index for better query performance
categorySchema.index({ name: 1 });
categorySchema.index({ slug: 1 });
categorySchema.index({ isActive: 1 });
categorySchema.index({ sortOrder: 1 });
categorySchema.index({ parentCategory: 1 });
categorySchema.index({ level: 1 });
// Global search entity resolution: active categories by name
categorySchema.index({ isActive: 1, name: 1 });

// Virtual for subcategories
categorySchema.virtual('subcategories', {
  ref: 'Subcategory',
  localField: '_id',
  foreignField: 'category'
});

// Virtual for product count
categorySchema.virtual('productCount', {
  ref: 'Product',
  localField: '_id',
  foreignField: 'category',
  count: true
});

// Pre-save middleware to generate slug and set level
categorySchema.pre('save', function (next) {
  if (this.isModified('name') || !this.slug) {
    if (this.name) {
      this.name = this.name.trim();
      this.slug = this.name
        .toLowerCase()
        .replace(/[^a-z0-9\s\-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim('-');
    }
  }

  // Set level based on parent category
  if (this.parentCategory) {
    this.level = 1; // For now, assuming only 2 levels
  } else {
    this.level = 0;
  }

  next();
});

// Static method to find active categories
categorySchema.statics.findActive = function () {
  return this.find({ isActive: true }).sort({ sortOrder: 1, name: 1 });
};

// Static method to find root categories (no parent)
categorySchema.statics.findRootCategories = function () {
  return this.find({ parentCategory: null, isActive: true }).sort({ sortOrder: 1, name: 1 });
};

// Static method to find subcategories
categorySchema.statics.findSubcategories = function (parentId) {
  return this.find({ parentCategory: parentId, isActive: true }).sort({ sortOrder: 1, name: 1 });
};

// Instance method to deactivate category
categorySchema.methods.deactivate = function () {
  this.isActive = false;
  return this.save();
};

// Instance method to activate category
categorySchema.methods.activate = function () {
  this.isActive = true;
  return this.save();
};

module.exports = mongoose.model("Category", categorySchema);
