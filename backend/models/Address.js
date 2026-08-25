const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema({
  // User reference (can be shopper, seller, or admin)
  user: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'userType'
  },
  userType: {
    type: String,
    required: true,
    enum: ['Shopper', 'Seller', 'Admin']
  },
  
  // Address type
  type: {
    type: String,
    required: true,
    enum: ['home', 'work', 'billing', 'shipping', 'other'],
    default: 'home'
  },
  
  // Address details
  addressLine1: {
    type: String,
    required: [true, "Address line 1 is required"],
    trim: true,
    maxlength: [100, "Address line 1 cannot exceed 100 characters"]
  },
  addressLine2: {
    type: String,
    trim: true,
    maxlength: [100, "Address line 2 cannot exceed 100 characters"]
  },
  landmark: {
    type: String,
    trim: true,
    maxlength: [50, "Landmark cannot exceed 50 characters"]
  },
  
  // Location references
  country: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Country',
    required: [true, "Country is required"]
  },
  state: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'State',
    required: [true, "State is required"]
  },
  district: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'District',
    required: [true, "District is required"]
  },
  city: {
    type: String,
    required: [true, "City is required"],
    trim: true,
    maxlength: [50, "City name cannot exceed 50 characters"]
  },
  pincode: {
    type: String,
    required: [true, "Pincode is required"],
    trim: true,
    validate: {
      validator: function(v) {
        // Basic pincode validation (6 digits for India, flexible for other countries)
        return /^[0-9]{4,10}$/.test(v);
      },
      message: "Pincode must be 4-10 digits"
    }
  },
  
  // Contact information
  contactName: {
    type: String,
    required: [true, "Contact name is required"],
    trim: true,
    maxlength: [50, "Contact name cannot exceed 50 characters"]
  },
  contactPhone: {
    type: String,
    required: [true, "Contact phone is required"],
    trim: true,
    validate: {
      validator: function(v) {
        // Basic phone validation (10-15 digits)
        return /^[0-9]{10,15}$/.test(v);
      },
      message: "Phone number must be 10-15 digits"
    }
  },
  contactEmail: {
    type: String,
    trim: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        if (!v) return true; // Optional field
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: "Invalid email format"
    }
  },
  
  // Address status
  isDefault: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Additional metadata
  instructions: {
    type: String,
    trim: true,
    maxlength: [200, "Delivery instructions cannot exceed 200 characters"]
  },
  
  // Geolocation (optional)
  coordinates: {
    latitude: {
      type: Number,
      min: -90,
      max: 90
    },
    longitude: {
      type: Number,
      min: -180,
      max: 180
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
addressSchema.index({ user: 1, userType: 1 });
addressSchema.index({ user: 1, userType: 1, isDefault: 1 });
addressSchema.index({ user: 1, userType: 1, type: 1 });
addressSchema.index({ country: 1, state: 1, district: 1 });
addressSchema.index({ pincode: 1 });

// Virtual for full address
addressSchema.virtual('fullAddress').get(function() {
  const parts = [
    this.addressLine1,
    this.addressLine2,
    this.landmark,
    this.city,
    this.pincode
  ].filter(Boolean);
  
  return parts.join(', ');
});

// Virtual for location hierarchy
addressSchema.virtual('location', {
  ref: 'Country',
  localField: 'country',
  foreignField: '_id',
  justOne: true
});

// Pre-save middleware to ensure only one default address per user
addressSchema.pre('save', async function(next) {
  if (this.isDefault && this.isModified('isDefault')) {
    // Remove default flag from other addresses of the same user
    await this.constructor.updateMany(
      { 
        user: this.user, 
        userType: this.userType, 
        _id: { $ne: this._id } 
      },
      { isDefault: false }
    );
  }
  next();
});

// Static method to get default address for a user
addressSchema.statics.getDefaultAddress = function(userId, userType) {
  return this.findOne({ 
    user: userId, 
    userType: userType, 
    isDefault: true, 
    isActive: true 
  }).populate('country state district');
};

// Static method to get all addresses for a user
addressSchema.statics.getUserAddresses = function(userId, userType) {
  return this.find({ 
    user: userId, 
    userType: userType, 
    isActive: true 
  }).populate('country state district').sort({ isDefault: -1, createdAt: -1 });
};

// Instance method to set as default
addressSchema.methods.setAsDefault = async function() {
  this.isDefault = true;
  return this.save();
};

// Instance method to deactivate
addressSchema.methods.deactivate = async function() {
  this.isActive = false;
  if (this.isDefault) {
    this.isDefault = false;
  }
  return this.save();
};

module.exports = mongoose.model("Address", addressSchema);
