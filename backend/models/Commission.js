const mongoose = require("mongoose");

const commissionSchema = new mongoose.Schema({
  // Order reference
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: [true, "Order reference is required"],
    index: true
  },

  // Seller reference
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller',
    required: [true, "Seller reference is required"],
    index: true
  },

  // Product reference
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: [true, "Product reference is required"]
  },

  // Commission details
  orderAmount: {
    type: Number,
    required: [true, "Order amount is required"],
    min: [0, "Order amount cannot be negative"]
  },

  commissionRate: {
    type: Number,
    required: [true, "Commission rate is required"],
    min: [0, "Commission rate cannot be negative"],
    max: [100, "Commission rate cannot exceed 100%"]
  },

  commissionAmount: {
    type: Number,
    required: [true, "Commission amount is required"],
    min: [0, "Commission amount cannot be negative"]
  },

  commissionType: {
    type: String,
    enum: ['percentage', 'flat'],
    required: true,
    default: 'percentage'
  },

  // Commission status (State Machine)
  status: {
    type: String,
    enum: ['pending', 'approved', 'locked', 'paid', 'cancelled', 'disputed'],
    default: 'pending',
    index: true
  },

  // Traceability
  appliedRule: {
    type: String,
    enum: ['seller_category_override', 'seller_default', 'category_default', 'system_default'],
    required: true,
    default: 'system_default'
  },

  calculatedAt: {
    type: Date,
    required: true,
    default: Date.now,
    immutable: true
  },

  // Payment details
  paymentDate: {
    type: Date
  },

  paymentMethod: {
    type: String,
    enum: ['bank_transfer', 'upi', 'wallet', 'check'],
    default: 'bank_transfer'
  },

  paymentReference: {
    type: String,
    trim: true
  },

  // Payout reference when locked
  lockedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payout',
    index: true
  },

  // Commission type (legacy/internal)
  type: {
    type: String,
    enum: ['sale', 'referral', 'bonus', 'adjustment'],
    default: 'sale'
  },

  // Category-specific commission
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  },

  // Commission period (for reporting)
  period: {
    year: {
      type: Number,
      required: true,
      min: [2020, "Year must be 2020 or later"],
      max: [2030, "Year cannot exceed 2030"]
    },
    month: {
      type: Number,
      required: true,
      min: [1, "Month must be between 1-12"],
      max: [12, "Month must be between 1-12"]
    }
  },

  // Additional metadata
  notes: {
    type: String,
    trim: true,
    maxlength: [500, "Notes cannot exceed 500 characters"]
  },

  // Dispute information
  dispute: {
    reason: {
      type: String,
      trim: true
    },
    raisedBy: {
      type: String,
      enum: ['seller', 'admin']
    },
    raisedAt: {
      type: Date
    },
    resolvedAt: {
      type: Date
    },
    resolution: {
      type: String,
      trim: true
    }
  },

  // Audit fields
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },

  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },

  approvedAt: {
    type: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Financial Immutability and State Machine Guards
commissionSchema.pre('save', function (next) {
  if (this.isNew) {
    if (!this.period || !this.period.year) {
      const now = new Date();
      this.period = {
        year: now.getFullYear(),
        month: now.getMonth() + 1
      };
    }
    return next();
  }

  // Define valid state transitions
  const allowedTransitions = {
    'pending': ['approved', 'cancelled', 'disputed'],
    'approved': ['locked', 'cancelled'],
    'locked': ['approved', 'paid'],
    'paid': [],
    'cancelled': [],
    'disputed': ['approved', 'cancelled']
  };

  // Block modification of financial fields
  if (this.isModified('commissionAmount') ||
    this.isModified('commissionRate') ||
    this.isModified('orderAmount') ||
    this.isModified('commissionType') ||
    this.isModified('seller') ||
    this.isModified('product')) {
    return next(new Error('Financial and core fields are immutable after creation'));
  }

  // Validate status transitions
  if (this.isModified('status')) {
    const oldStatus = this._original?.status || 'pending';
    const newStatus = this.status;

    const validNext = allowedTransitions[oldStatus] || [];
    if (!validNext.includes(newStatus)) {
      return next(new Error(
        `Invalid commission status transition: ${oldStatus} → ${newStatus}`
      ));
    }
  }

  next();
});

// Track original values for state machine validation
commissionSchema.post('init', function () {
  this._original = this.toObject();
});

// Indexes for better query performance
commissionSchema.index({ seller: 1, status: 1 });
commissionSchema.index({ order: 1 });
commissionSchema.index({ 'period.year': 1, 'period.month': 1 });
commissionSchema.index({ status: 1, createdAt: 1 });
commissionSchema.index({ seller: 1, 'period.year': 1, 'period.month': 1 });

// Virtuals
commissionSchema.virtual('formattedAmount').get(function () {
  return `₹${this.commissionAmount.toFixed(2)}`;
});

commissionSchema.virtual('formattedOrderAmount').get(function () {
  return `₹${this.orderAmount.toFixed(2)}`;
});

commissionSchema.virtual('commissionPercentage').get(function () {
  return `${this.commissionRate.toFixed(2)}%`;
});

// Statics
commissionSchema.statics.getSellerCommissions = function (sellerId, year, month) {
  const query = { seller: sellerId };
  if (year) query['period.year'] = year;
  if (month) query['period.month'] = month;

  return this.find(query)
    .populate('order', 'orderNumber orderDate status')
    .populate('product', 'name price')
    .populate('category', 'name')
    .sort({ createdAt: -1 });
};

commissionSchema.statics.getSellerCommissionSummary = async function (sellerId, year, month) {
  const matchQuery = { seller: sellerId };
  if (year) matchQuery['period.year'] = year;
  if (month) matchQuery['period.month'] = month;

  return this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$commissionAmount' },
        totalOrderAmount: { $sum: '$orderAmount' }
      }
    }
  ]);
};

commissionSchema.statics.getPendingCommissions = function () {
  return this.find({ status: 'pending' })
    .populate('seller', 'name email')
    .populate('order', 'orderNumber orderDate')
    .populate('product', 'name')
    .sort({ createdAt: 1 });
};

commissionSchema.statics.getCommissionStats = async function (year, month) {
  const matchQuery = {};
  if (year) matchQuery['period.year'] = year;
  if (month) matchQuery['period.month'] = month;

  const stats = await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalCommissions: { $sum: 1 },
        totalAmount: { $sum: '$commissionAmount' },
        totalOrderAmount: { $sum: '$orderAmount' },
        averageRate: { $avg: '$commissionRate' },
        pendingCount: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        paidCount: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] } },
        disputedCount: { $sum: { $cond: [{ $eq: ['$status', 'disputed'] }, 1, 0] } }
      }
    }
  ]);

  return stats[0] || {
    totalCommissions: 0,
    totalAmount: 0,
    totalOrderAmount: 0,
    averageRate: 0,
    pendingCount: 0,
    paidCount: 0,
    disputedCount: 0
  };
};

// Instance methods
commissionSchema.methods.approve = async function (adminId) {
  this.status = 'approved';
  this.approvedBy = adminId;
  this.approvedAt = new Date();
  return this.save();
};

commissionSchema.methods.markAsPaid = async function (paymentMethod, paymentReference) {
  this.status = 'paid';
  this.paymentDate = new Date();
  this.paymentMethod = paymentMethod;
  this.paymentReference = paymentReference;
  return this.save();
};

commissionSchema.methods.raiseDispute = async function (reason, raisedBy) {
  this.status = 'disputed';
  this.dispute = {
    reason,
    raisedBy,
    raisedAt: new Date()
  };
  return this.save();
};

commissionSchema.methods.resolveDispute = async function (resolution) {
  this.dispute.resolvedAt = new Date();
  this.dispute.resolution = resolution;
  this.status = 'approved';
  return this.save();
};

module.exports = mongoose.model("Commission", commissionSchema);
