const mongoose = require('mongoose');
const {
  ORDER_SHIPPING_APPLICABILITY_VALUES,
  EFFECTIVE_SHIPPING_APPLICABILITY_VALUES,
  EFFECTIVE_SHIPPING_VISIBILITY_VALUES,
  SHIPPING_RESOLUTION_SOURCES,
} = require('../constants/shippingConstants');

const orderSchema = new mongoose.Schema({
  // Invoice Information
  invoiceNumber: {
    type: String,
    unique: true,
    required: true,
    default: function () {
      // Generate invoice number: INV-YYYYMMDD-XXXXXX
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
      return `INV-${year}${month}${day}-${random}`;
    }
  },

  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shopper',
    required: true,
  },

  /**
   * Client checkout attempt key (Idempotency-Key header / body.idempotencyKey).
   * Unique per buyer when set — orders without a key remain allowed (backward compatible).
   */
  checkoutIdempotencyKey: {
    type: String,
    required: false,
    default: undefined,
    maxlength: 128,
  },

  // Billing Information (flat fields for checkout + logistics; address may be string or legacy object)
  billingDetails: {
    name: { type: String, required: false },
    email: { type: String, required: false },
    phone: { type: String, required: false },
    address: { type: mongoose.Schema.Types.Mixed, required: false },
    city: { type: String, required: false },
    state: { type: String, required: false },
    pincode: { type: String, required: false },
    country: { type: String, required: false, default: 'India' },
    firstName: { type: String, required: false },
    lastName: { type: String, required: false },
  },

  // Shipping Information
  shippingDetails: {
    name: { type: String, required: false },
    email: { type: String, required: false },
    phone: { type: String, required: false },
    address: { type: mongoose.Schema.Types.Mixed, required: false },
    city: { type: String, required: false },
    state: { type: String, required: false },
    pincode: { type: String, required: false },
    country: { type: String, required: false, default: 'India' },
    firstName: { type: String, required: false },
    lastName: { type: String, required: false },
    instructions: { type: String, default: '' },
  },

  // Unified Shipping Engine v2 Fields
  shippingCharge: {
    type: Number,
    required: [true, "Shipping charge is required"],
    default: 0
  },
  shippingMethod: {
    type: String, // e.g., "flat", "free", "conditional_free"
    default: "manual"
  },
  shippingProvider: {
    type: String,
    enum: [null, "manual", "shiprocket", "fedex", "delhivery"],
    default: null,
  },
  shippingApplicability: {
    type: String,
    enum: ORDER_SHIPPING_APPLICABILITY_VALUES,
    default: undefined,
  },
  shippableItemCount: {
    type: Number,
    default: undefined,
  },
  nonShippableItemCount: {
    type: Number,
    default: undefined,
  },
  shippingEngineInput: {
    shippableWeightG: { type: Number },
    shippableSubtotal: { type: Number },
  },
  shippingRuleSnapshot: {
    type: mongoose.Schema.Types.Mixed, // Stores the rule applied at the time of order
    default: undefined
  },
  shippingZoneSnapshot: {
    type: mongoose.Schema.Types.Mixed, // Stores the zone details at the time of order
    default: undefined
  },

  items: [
    {
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
      },
      quantity: {
        type: Number,
        required: true,
        default: 1,
      },
      price: {
        type: Number,
        required: true,
      },
      // Bulk discount information
      originalPrice: {
        type: Number,
        required: true,
      },
      bulkDiscount: {
        applied: {
          type: Boolean,
          default: false,
        },
        discountAmount: {
          type: Number,
          default: 0,
        },
        discountPercentage: {
          type: Number,
          default: 0,
        },
        tierUsed: {
          minQuantity: Number,
          maxQuantity: Number,
          discountType: String,
          discountValue: Number,
        },
      },
      // Variant information (Phase 3 - Optional, Additive)
      variantCombination: {
        type: mongoose.Schema.Types.Mixed,
        default: undefined,
      },
      variantKey: {
        type: String,
        default: undefined,
      },
      variantSku: {
        type: String,
        default: undefined,
      },
      variantPriceSnapshot: {
        type: Number,
        default: undefined,
      },
      variantStockSnapshot: {
        type: Number,
        default: undefined,
      },
      image: {
        type: String,
        default: undefined,
      },
      lineShippingApplicability: {
        type: String,
        enum: EFFECTIVE_SHIPPING_APPLICABILITY_VALUES,
        default: undefined,
      },
      effectiveShippingApplicability: {
        type: String,
        enum: EFFECTIVE_SHIPPING_APPLICABILITY_VALUES,
        default: undefined,
      },
      effectiveShippingType: {
        type: String,
        default: undefined,
      },
      shippingResolutionSource: {
        type: String,
        enum: SHIPPING_RESOLUTION_SOURCES,
        default: undefined,
      },
      lineShippingVisibility: {
        type: String,
        enum: EFFECTIVE_SHIPPING_VISIBILITY_VALUES,
        default: undefined,
      },
      effectiveShippingVisibility: {
        type: String,
        enum: EFFECTIVE_SHIPPING_VISIBILITY_VALUES,
        default: undefined,
      },
      shippingVisibilityResolutionSource: {
        type: String,
        enum: SHIPPING_RESOLUTION_SOURCES,
        default: undefined,
      },
    }
  ],

  totalAmount: {
    type: Number,
    required: true,
  },

  // Bulk discount summary
  bulkDiscountSummary: {
    totalOriginalAmount: {
      type: Number,
      default: 0,
    },
    totalDiscountAmount: {
      type: Number,
      default: 0,
    },
    totalDiscountPercentage: {
      type: Number,
      default: 0,
    },
    itemsWithBulkDiscount: {
      type: Number,
      default: 0,
    },
  },

  // Coupon information
  coupon: {
    code: {
      type: String,
      default: null,
    },
    discountAmount: {
      type: Number,
      default: 0,
    },
    couponData: {
      discountType: String,
      discountValue: Number,
      freeShipping: Boolean,
      minOrder: Number,
    },
  },

  /**
   * SEC-005 — coupon quota state. Discount may be applied on the order without
   * incrementing Coupon.usedCount until consumption (payment success / COD).
   */
  couponLifecycle: {
    state: {
      type: String,
      enum: ['none', 'applied', 'consumed', 'released'],
      default: 'none',
    },
    consumedAt: { type: Date, default: null },
    releasedAt: { type: Date, default: null },
  },

  /**
   * SEC-004 — inventory claim state against Product.stock / variantStock.
   * reserved = decremented; committed = purchase confirmed; released/returned = restored.
   */
  inventoryLifecycle: {
    state: {
      type: String,
      enum: ['none', 'reserved', 'committed', 'released', 'returned'],
      default: 'none',
    },
    reservedAt: { type: Date, default: null },
    committedAt: { type: Date, default: null },
    releasedAt: { type: Date, default: null },
    returnedAt: { type: Date, default: null },
  },

  // Tax information
  tax: {
    totalTaxableAmount: {
      type: Number,
      default: 0,
    },
    totalTaxAmount: {
      type: Number,
      default: 0,
    },
    totalTaxAdded: {
      type: Number,
      default: 0,
    },
    // Top-level tax aggregates (Objective 4.5)
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    ugst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
    taxType: { type: String }, // e.g., "inclusive", "exclusive", "mixed"

    taxSummary: [{
      taxType: {
        type: String,
        enum: ['GST', 'VAT', 'CGST', 'SGST', 'IGST', 'UGST', 'Shipping GST'],
        default: 'GST'
      },
      taxRate: {
        type: Number,
        default: 18
      },
      taxableAmount: {
        type: Number,
        default: 0
      },
      taxAmount: {
        type: Number,
        default: 0
      },
      // Individual tax components for this summary line
      cgst: { type: Number, default: 0 },
      sgst: { type: Number, default: 0 },
      ugst: { type: Number, default: 0 },
      igst: { type: Number, default: 0 },

      taxBreakdown: {
        CGST: {
          rate: Number,
          amount: Number
        },
        SGST: {
          rate: Number,
          amount: Number
        },
        IGST: {
          rate: Number,
          amount: Number
        },
        UGST: {
          rate: Number,
          amount: Number
        }
      }
    }],
    shippingTax: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined
    },
    taxBreakdownSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined
    },
    compliance: {
      isValid: {
        type: Boolean,
        default: true
      },
      errors: [String],
      warnings: [String]
    }
  },

  paymentMethod: {
    type: String,
    enum: ['upi_manual', 'cod', 'stripe', 'razorpay', 'phonepe', 'upi', 'bank'],
    default: 'cod',
  },

  upiTxnId: {
    type: String,
    default: null,
  },

  paymentStatus: {
    type: String,
    enum: ['pending', 'success', 'failed'],
    default: 'pending',
  },

  paymentTransactionId: {
    type: String,
    default: null,
  },

  paymentDetails: {
    paymentType: {
      type: String,
      enum: ["ONLINE", "COD", "OFFLINE"],
    },
    gateway: { type: String, default: null },
    channel: { type: String, default: null },
    transactionId: { type: String, default: null },
    paymentStatus: {
      type: String,
      enum: ["PAID", "PENDING", "FAILED", "PROCESSING"],
    },
    paidAt: { type: Date, default: null },
  },

  status: {
    type: String,
    enum: [
      'pending',              // awaiting payment (Phase 1 checkout)
      'pending_verification', // legacy: ইউপিআই চেক বাকি
      'paid',                 // সফল পেমেন্ট
      'processing',           // প্যাকিং/প্রসেসিং চলছে
      'shipped',              // শিপ হয়েছে
      'delivered',            // ডেলিভার হয়েছে
      'cancelled',            // ইউজার ক্যান্সেল করেছে
      'failed'                // পেমেন্ট বা অন্য কারণে ব্যর্থ
    ],
    default: 'pending_verification',
  },

  deliveredAt: {
    type: Date,
    default: null,
  },

  // Order Fulfillment Fields (Priority 9 & 11)
  trackingNumber: {
    type: String,
    default: null,
  },

  // Multi-seller: Each seller's items get a separate shipment
  shiprocketShipments: [{
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller' },
    sellerName: String,
    shiprocketOrderId: String,
    shiprocketShipmentId: String,
    shiprocketLabelUrl: String,
    trackingNumber: String,
    status: { type: String, default: 'pending' },
    createdAt: { type: Date, default: Date.now }
  }],

  // Legacy fields (kept for backward compatibility with existing orders)
  shiprocketOrderId: {
    type: String,
    default: null,
  },

  shiprocketShipmentId: {
    type: String,
    default: null,
  },

  shiprocketLabelUrl: {
    type: String,
    default: null,
  },

  sellerNotes: {
    type: String,
    default: null,
  },

  updatedAt: {
    type: Date,
    default: Date.now,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },

  testFlag: {
    type: Boolean,
    default: false,
    index: true,
  },

  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Shopper",
    default: null,
  },

  cancellationReasonCode: {
    type: String,
    default: null,
  },

  cancellationReasonText: {
    type: String,
    default: null,
  },

  cancelledAt: {
    type: Date,
    default: null,
  },

  /**
   * `sale` is a paid customer order. `replacement` is an outbound fulfilment
   * order created from an approved after-sales replacement (no new payment).
   */
  fulfilmentKind: {
    type: String,
    enum: ["sale", "replacement"],
    default: "sale",
  },

  sourceOrder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Order",
    default: null,
  },

  sourceReturnRequest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ReturnRequest",
    default: null,
  },

  manualConfirmationStatus: {
    type: String,
    enum: ["CALL_PENDING", "CONFIRMED", "REJECTED", "UNABLE_TO_REACH"],
  },

  manualConfirmationEligible: {
    type: Boolean,
    default: null,
  },

  manualConfirmationAt: {
    type: Date,
    default: null,
  },

  manualConfirmationBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Admin",
    default: null,
  },

  manualConfirmationNotes: {
    type: String,
    default: null,
  },
});

orderSchema.index(
  { buyer: 1, checkoutIdempotencyKey: 1 },
  {
    unique: true,
    name: 'buyer_checkoutIdempotencyKey_unique',
    partialFilterExpression: {
      checkoutIdempotencyKey: { $exists: true, $type: 'string', $gt: '' },
    },
  }
);

orderSchema.post('init', function rememberDeliveredAt() {
  this.$locals.persistedDeliveredAt = this.deliveredAt
    ? new Date(this.deliveredAt)
    : null;
});

orderSchema.pre('save', function captureDeliveredAt(next) {
  const persistedDeliveredAt = this.$locals.persistedDeliveredAt;
  if (
    !this.isNew &&
    this.isModified('deliveredAt') &&
    persistedDeliveredAt
  ) {
    this.deliveredAt = persistedDeliveredAt;
  }

  if (
    !this.deliveredAt &&
    this.status === 'delivered' &&
    (this.isNew || this.isModified('status'))
  ) {
    this.deliveredAt = new Date();
  }
  next();
});

orderSchema.post('save', function rememberSavedDeliveredAt(doc) {
  doc.$locals.persistedDeliveredAt = doc.deliveredAt
    ? new Date(doc.deliveredAt)
    : null;
});

module.exports = mongoose.model('Order', orderSchema);
