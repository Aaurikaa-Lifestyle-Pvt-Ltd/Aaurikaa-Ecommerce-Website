// backend/models/brand.js
const mongoose = require('mongoose');

const brandSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Brand name is required"],
    unique: true,
    trim: true,
    minlength: [2, "Brand name must be at least 2 characters long"],
    maxlength: [50, "Brand name cannot exceed 50 characters"],
    validate: {
      validator: function(v) {
        return /^[a-zA-Z0-9\s\-&.]+$/.test(v);
      },
      message: "Brand name can only contain letters, numbers, spaces, hyphens, ampersands, and periods"
    }
  },
  logo: {
    type: String,
    validate: {
      validator: function(v) {
        if (!v) return true; // Optional field
        return /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(v);
      },
      message: "Logo must be a valid image file (jpg, jpeg, png, gif, webp, svg)"
    }
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, "Description cannot exceed 500 characters"]
  },
  website: {
    type: String,
    validate: {
      validator: function(v) {
        if (!v) return true; // Optional field
        return /^https?:\/\/.+\..+/.test(v);
      },
      message: "Website must be a valid URL starting with http:// or https://"
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  sortOrder: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index for better query performance
brandSchema.index({ name: 1 });
brandSchema.index({ isActive: 1 });
brandSchema.index({ sortOrder: 1 });
// Global search entity resolution: active brands by name
brandSchema.index({ isActive: 1, name: 1 });

// Virtual for product count (if you have a Product model that references brands)
brandSchema.virtual('productCount', {
  ref: 'Product',
  localField: '_id',
  foreignField: 'brand',
  count: true
});

// Pre-save middleware to ensure name is properly formatted
brandSchema.pre('save', function(next) {
  if (this.isModified('name')) {
    this.name = this.name.trim();
  }
  next();
});

// Static method to find active brands
brandSchema.statics.findActive = function() {
  return this.find({ isActive: true }).sort({ sortOrder: 1, name: 1 });
};

// Instance method to deactivate brand
brandSchema.methods.deactivate = function() {
  this.isActive = false;
  return this.save();
};

// Instance method to activate brand
brandSchema.methods.activate = function() {
  this.isActive = true;
  return this.save();
};

module.exports = mongoose.model('Brand', brandSchema);
