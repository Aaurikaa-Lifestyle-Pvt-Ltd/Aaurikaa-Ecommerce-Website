// backend/models/Offer.js

const mongoose = require("mongoose");

const offerSchema = new mongoose.Schema({
  text: { 
    type: String, 
    required: [true, 'Offer text is required'],
    trim: true,
    minlength: [3, 'Offer text must be at least 3 characters long'],
    maxlength: [500, 'Offer text cannot exceed 500 characters'],
    validate: {
      validator: function(v) {
        // Check for basic content validation
        return v && v.trim().length > 0 && !/^\s*$/.test(v);
      },
      message: 'Offer text cannot be empty or contain only whitespace'
    }
  },
  
  // Additional offer fields for better management
  title: {
    type: String,
    trim: true,
    maxlength: [100, 'Offer title cannot exceed 100 characters'],
    default: ''
  },
  
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Offer description cannot exceed 1000 characters'],
    default: ''
  },
  
  // Offer status and visibility
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Offer priority for display order
  priority: {
    type: Number,
    default: 0,
    min: [0, 'Priority cannot be negative'],
    max: [100, 'Priority cannot exceed 100']
  },
  
  // Offer type for categorization
  type: {
    type: String,
    enum: {
      values: ['discount', 'promotion', 'announcement', 'feature', 'other'],
      message: 'Offer type must be one of: discount, promotion, announcement, feature, other'
    },
    default: 'announcement'
  },
  
  // Offer validity period
  validFrom: {
    type: Date,
    default: Date.now
  },
  
  validTo: {
    type: Date,
    validate: {
      validator: function(v) {
        return !v || v > this.validFrom;
      },
      message: 'Valid to date must be after valid from date'
    }
  },
  
  // Target audience
  targetAudience: {
    type: String,
    enum: {
      values: ['all', 'new_customers', 'existing_customers', 'vip_customers'],
      message: 'Target audience must be one of: all, new_customers, existing_customers, vip_customers'
    },
    default: 'all'
  },
  
  // Offer metadata
  metadata: {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true
    },
    
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin'
    },
    
    tags: [{
      type: String,
      trim: true,
      maxlength: [50, 'Tag cannot exceed 50 characters']
    }],
    
    // Analytics fields
    viewCount: {
      type: Number,
      default: 0,
      min: [0, 'View count cannot be negative']
    },
    
    clickCount: {
      type: Number,
      default: 0,
      min: [0, 'Click count cannot be negative']
    }
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
offerSchema.index({ isActive: 1, priority: -1 });
offerSchema.index({ validFrom: 1, validTo: 1 });
offerSchema.index({ type: 1, targetAudience: 1 });
offerSchema.index({ 'metadata.createdBy': 1 });

// Virtual for checking if offer is currently valid
offerSchema.virtual('isCurrentlyValid').get(function() {
  const now = new Date();
  return this.isActive && 
         this.validFrom <= now && 
         (!this.validTo || this.validTo >= now);
});

// Pre-save middleware for validation
offerSchema.pre('save', function(next) {
  // Ensure title is set if not provided
  if (!this.title && this.text) {
    this.title = this.text.length > 50 ? this.text.substring(0, 47) + '...' : this.text;
  }
  
  // Set lastModifiedBy if not set
  if (this.isModified() && !this.metadata.lastModifiedBy) {
    this.metadata.lastModifiedBy = this.metadata.createdBy;
  }
  
  next();
});

// Static method to get active offers
// Optional type filter: pass a type string (e.g. 'announcement') or omit/null for all types.
// Treat missing/null validTo as open-ended (Admin create often stores null).
offerSchema.statics.getActiveOffers = function(type) {
  const now = new Date();
  const query = {
    isActive: true,
    validFrom: { $lte: now },
    $or: [
      { validTo: { $exists: false } },
      { validTo: null },
      { validTo: { $gte: now } }
    ]
  };
  if (type) {
    query.type = type;
  }
  return this.find(query).sort({ priority: -1, createdAt: -1 });
};

// Instance method to check if offer is valid for a specific date
offerSchema.methods.isValidForDate = function(date = new Date()) {
  return this.isActive && 
         this.validFrom <= date && 
         (!this.validTo || this.validTo >= date);
};

// Instance method to increment view count
offerSchema.methods.incrementViewCount = function() {
  this.metadata.viewCount += 1;
  return this.save();
};

// Instance method to increment click count
offerSchema.methods.incrementClickCount = function() {
  this.metadata.clickCount += 1;
  return this.save();
};

module.exports = mongoose.model("Offer", offerSchema);
