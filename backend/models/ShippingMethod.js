const mongoose = require('mongoose');

const shippingMethodSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, "Shipping method name is required"],
    trim: true,
    minlength: [2, "Shipping method name must be at least 2 characters long"],
    maxlength: [50, "Shipping method name cannot exceed 50 characters"],
    unique: true
  },
  cost: { 
    type: Number, 
    required: [true, "Shipping cost is required"],
    min: [0, "Shipping cost cannot be negative"],
    max: [10000, "Shipping cost cannot exceed ₹10,000"],
    set: function(value) {
      return Math.round(value * 100) / 100; // Round to 2 decimal places
    }
  },
  zones: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'ShippingZone',
    validate: {
      validator: async function(zoneId) {
        const zone = await mongoose.model('ShippingZone').findById(zoneId);
        return zone && zone.active;
      },
      message: 'Referenced shipping zone does not exist or is inactive'
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: [200, "Description cannot exceed 200 characters"]
  },
  estimatedDays: {
    min: {
      type: Number,
      min: [1, "Minimum delivery days must be at least 1"],
      max: [30, "Minimum delivery days cannot exceed 30"]
    },
    max: {
      type: Number,
      min: [1, "Maximum delivery days must be at least 1"],
      max: [30, "Maximum delivery days cannot exceed 30"]
    }
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

// Indexes for better query performance
shippingMethodSchema.index({ name: 1 });
shippingMethodSchema.index({ isActive: 1 });
shippingMethodSchema.index({ sortOrder: 1 });

// Virtual for formatted cost
shippingMethodSchema.virtual('formattedCost').get(function() {
  return `₹${this.cost.toFixed(2)}`;
});

// Virtual for delivery time range
shippingMethodSchema.virtual('deliveryTimeRange').get(function() {
  if (this.estimatedDays && this.estimatedDays.min && this.estimatedDays.max) {
    if (this.estimatedDays.min === this.estimatedDays.max) {
      return `${this.estimatedDays.min} day${this.estimatedDays.min > 1 ? 's' : ''}`;
    }
    return `${this.estimatedDays.min}-${this.estimatedDays.max} days`;
  }
  return 'Standard delivery';
});

// Pre-save middleware to validate estimated days
shippingMethodSchema.pre('save', function(next) {
  if (this.estimatedDays && this.estimatedDays.min && this.estimatedDays.max) {
    if (this.estimatedDays.min > this.estimatedDays.max) {
      return next(new Error('Minimum delivery days cannot be greater than maximum delivery days'));
    }
  }
  next();
});

// Static method to get active shipping methods
shippingMethodSchema.statics.getActiveMethods = function() {
  return this.find({ isActive: true })
    .populate('zones', 'name code active')
    .sort({ sortOrder: 1, name: 1 });
};

// Static method to get methods for specific zone
shippingMethodSchema.statics.getMethodsForZone = function(zoneId) {
  return this.find({ 
    isActive: true,
    $or: [
      { zones: { $in: [zoneId] } },
      { zones: { $size: 0 } } // Methods with no specific zones (available everywhere)
    ]
  })
  .populate('zones', 'name code active')
  .sort({ sortOrder: 1, name: 1 });
};

// Instance method to activate/deactivate
shippingMethodSchema.methods.toggleActive = async function() {
  this.isActive = !this.isActive;
  return this.save();
};

module.exports = mongoose.model('ShippingMethod', shippingMethodSchema);


