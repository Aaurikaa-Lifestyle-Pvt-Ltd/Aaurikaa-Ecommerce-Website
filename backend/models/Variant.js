// models/Variant.js

const mongoose = require("mongoose");

const variantValueSchema = new mongoose.Schema({
  value: {
    type: String,
    required: [true, "Variant value is required"],
    trim: true,
    minlength: [1, "Variant value must be at least 1 character long"],
    maxlength: [50, "Variant value cannot exceed 50 characters"]
  },
  displayName: {
    type: String,
    trim: true,
    maxlength: [100, "Display name cannot exceed 100 characters"]
  },
  code: {
    type: String,
    trim: true,
    uppercase: true,
    validate: {
      validator: function(v) {
        if (!v) return true; // Optional field
        return /^#[0-9A-F]{6}$/i.test(v); // Hex color format
      },
      message: "Color code must be a valid hex color (e.g., #FF0000)"
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
}, { _id: true });

const variantSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Variant name is required"],
    trim: true,
    minlength: [2, "Variant name must be at least 2 characters long"],
    maxlength: [50, "Variant name cannot exceed 50 characters"],
    validate: {
      validator: function(v) {
        return /^[a-zA-Z0-9\s\-&.]+$/.test(v);
      },
      message: "Variant name can only contain letters, numbers, spaces, hyphens, ampersands, and periods"
    }
  },
  values: [variantValueSchema],
  isActive: {
    type: Boolean,
    default: true
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, "Description cannot exceed 500 characters"]
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index for better query performance
variantSchema.index({ name: 1 });
variantSchema.index({ isActive: 1 });
variantSchema.index({ sortOrder: 1 });

// Virtual for active values count
variantSchema.virtual('activeValuesCount', {
  ref: 'Variant',
  localField: 'values',
  foreignField: 'values',
  count: true
});

// Pre-save middleware to set displayName if not provided
variantSchema.pre('save', function(next) {
  if (this.isModified('values')) {
    this.values.forEach((value, index) => {
      if (!value.displayName) {
        value.displayName = value.value;
      }
      if (value.sortOrder === undefined || value.sortOrder === null) {
        value.sortOrder = index;
      }
    });
  }
  
  next();
});

// Static method to find active variants
variantSchema.statics.findActive = function() {
  return this.find({ isActive: true }).sort({ sortOrder: 1, name: 1 });
};

// Static method to find variant by name
variantSchema.statics.findByName = function(name) {
  return this.findOne({ name: new RegExp(name, 'i'), isActive: true });
};

// Instance method to add value
variantSchema.methods.addValue = function(valueData) {
  this.values.push(valueData);
  return this.save();
};

// Instance method to remove value
variantSchema.methods.removeValue = function(valueId) {
  this.values = this.values.filter(value => value._id.toString() !== valueId);
  return this.save();
};

// Instance method to update value
variantSchema.methods.updateValue = function(valueId, updateData) {
  const value = this.values.id(valueId);
  if (value) {
    Object.assign(value, updateData);
    return this.save();
  }
  throw new Error('Value not found');
};

// Instance method to deactivate variant
variantSchema.methods.deactivate = function() {
  this.isActive = false;
  return this.save();
};

// Instance method to activate variant
variantSchema.methods.activate = function() {
  this.isActive = true;
  return this.save();
};

module.exports = mongoose.model("Variant", variantSchema);
