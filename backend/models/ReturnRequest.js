const mongoose = require("mongoose");
const {
  RETURN_REASON_CODES,
  ISSUE_CATEGORIES,
  MAX_RETURN_EVIDENCE_FILES,
  RETURN_EVIDENCE_MEDIA_TYPES,
  LEGACY_RETURN_STATUSES,
  AFTER_SALES_LIFECYCLE_STATUSES,
  RETURN_STATUSES,
  RETURN_RESOLUTIONS,
  ALL_RESOLUTION_REASON_CODES,
  CASE_FLOW_VERSIONS,
  ACTIVE_RETURN_STATUSES,
  ACTOR_ROLES,
  REVERSE_LOGISTICS_PROVIDERS,
  REVERSE_LOGISTICS_STATUSES,
} = require("../constants/returnRequestConstants");
const {
  snapshotResolutionHistory,
  assertResolutionHistoryAppendOnly,
} = require("../utils/afterSalesCaseSpine");

const statusHistoryEntrySchema = new mongoose.Schema(
  {
    fromStatus: { type: String, default: null },
    toStatus: { type: String, required: true },
    changedAt: { type: Date, default: Date.now },
    /** Actor id (admin, seller, or shopper depending on changedByRole). */
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    changedByRole: {
      type: String,
      default: null,
      validate: {
        validator(value) {
          return value == null || ACTOR_ROLES.includes(value);
        },
        message: (props) => `\`${props.value}\` is not a valid actor role`,
      },
    },
    changedBySeller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Seller",
      default: null,
    },
    note: { type: String, default: null, maxlength: 1000 },
  },
  { _id: false }
);

const resolutionHistoryEntrySchema = new mongoose.Schema(
  {
    fromResolution: { type: String, default: null },
    toResolution: {
      type: String,
      enum: RETURN_RESOLUTIONS,
      required: true,
    },
    changedAt: { type: Date, default: Date.now },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    changedByRole: {
      type: String,
      enum: ACTOR_ROLES,
      default: "system",
    },
    note: { type: String, default: null, maxlength: 1000 },
    reasonCode: {
      type: String,
      default: null,
      validate: {
        validator(value) {
          return value == null || ALL_RESOLUTION_REASON_CODES.includes(value);
        },
        message: (props) => `\`${props.value}\` is not a valid resolution reason code`,
      },
    },
    reasonNote: { type: String, default: null, maxlength: 1000 },
  },
  { _id: false }
);

const evidenceEntrySchema = new mongoose.Schema(
  {
    url: { type: String, required: true, maxlength: 2000 },
    mediaType: {
      type: String,
      enum: RETURN_EVIDENCE_MEDIA_TYPES,
      required: true,
    },
    fileName: { type: String, default: null, maxlength: 255 },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

/** Conditional reverse pickup / tracking (Phase 3). Additive; null when no physical return. */
const reverseLogisticsSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      default: null,
      validate: {
        validator(value) {
          return value == null || REVERSE_LOGISTICS_PROVIDERS.includes(value);
        },
        message: (props) => `\`${props.value}\` is not a valid reverse logistics provider`,
      },
    },
    status: {
      type: String,
      default: null,
      validate: {
        validator(value) {
          return value == null || REVERSE_LOGISTICS_STATUSES.includes(value);
        },
        message: (props) => `\`${props.value}\` is not a valid reverse logistics status`,
      },
    },
    shiprocketOrderId: { type: String, default: null },
    shiprocketShipmentId: { type: String, default: null },
    awbCode: { type: String, default: null },
    trackingUrl: { type: String, default: null, maxlength: 2000 },
    courierName: { type: String, default: null, maxlength: 255 },
    pickupScheduledAt: { type: Date, default: null },
    lastTrackedAt: { type: Date, default: null },
    lastProviderStatus: { type: String, default: null, maxlength: 255 },
    lastError: { type: String, default: null, maxlength: 2000 },
    retryCount: { type: Number, default: 0, min: 0 },
    /** Deterministic carrier channel order id (RET-…) used for idempotent create/recovery. */
    externalOrderKey: { type: String, default: null, maxlength: 50 },
    /** Wall-clock when a scheduling claim was taken (stale claims can be reclaimed). */
    schedulingClaimedAt: { type: Date, default: null },
  },
  { _id: false }
);

const returnRequestSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    buyer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shopper",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: RETURN_STATUSES,
      default: "pending_review",
      required: true,
    },
    /**
     * Business outcome. Null/undefined until selected (or inferred for legacy dual-read).
     * Independent of Status.
     */
    resolution: {
      type: String,
      default: null,
      validate: {
        validator(value) {
          return value == null || RETURN_RESOLUTIONS.includes(value);
        },
        message: (props) => `\`${props.value}\` is not a valid resolution`,
      },
    },
    /**
     * legacy = admin refund workflow; after_sales = seller-owned case path.
     * Existing documents default to legacy for compatibility.
     */
    caseFlow: {
      type: String,
      enum: CASE_FLOW_VERSIONS,
      default: "legacy",
      required: true,
    },
    /**
     * Whether physical return / reverse logistics is required.
     * null = unset (typical for legacy cases).
     */
    returnRequired: {
      type: Boolean,
      default: null,
    },
    reasonCode: {
      type: String,
      enum: RETURN_REASON_CODES,
      required: true,
    },
    reasonText: {
      type: String,
      default: null,
      maxlength: 500,
    },
    /**
     * Need Help issue category (analytics). Synced with reasonCode on create.
     * Optional on legacy documents.
     */
    issueCategory: {
      type: String,
      default: null,
      validate: {
        validator(value) {
          return value == null || ISSUE_CATEGORIES.includes(value);
        },
        message: (props) => `\`${props.value}\` is not a valid issue category`,
      },
    },
    /** Supporting images/videos uploaded during Need Help intake. */
    evidence: {
      type: [evidenceEntrySchema],
      default: [],
      validate: {
        validator(value) {
          return !Array.isArray(value) || value.length <= MAX_RETURN_EVIDENCE_FILES;
        },
        message: `At most ${MAX_RETURN_EVIDENCE_FILES} evidence files are allowed`,
      },
    },
    adminReturnNote: {
      type: String,
      default: null,
      maxlength: 1000,
    },
    adminRefundNote: {
      type: String,
      default: null,
      maxlength: 1000,
    },
    /** Seller operational note (review / receipt / resolution). */
    sellerNote: {
      type: String,
      default: null,
      maxlength: 1000,
    },
    /**
     * Structured resolution reason (enum/code) + optional free-text note.
     * Required whenever Resolution is set to refund/replacement/repair/rejected.
     */
    resolutionReasonCode: {
      type: String,
      default: null,
      validate: {
        validator(value) {
          return value == null || ALL_RESOLUTION_REASON_CODES.includes(value);
        },
        message: (props) => `\`${props.value}\` is not a valid resolution reason code`,
      },
    },
    resolutionReasonNote: {
      type: String,
      default: null,
      maxlength: 1000,
    },
    /**
     * One-time shopper appeal after seller resolution (Module B).
     * Admin decision from under_admin_review is final — no second appeal.
     */
    appeal: {
      reason: { type: String, default: null, maxlength: 2000 },
      evidence: {
        type: [evidenceEntrySchema],
        default: undefined,
      },
      appealedAt: { type: Date, default: null },
      appealCount: { type: Number, default: 0, min: 0, max: 1 },
      windowEndsAt: { type: Date, default: null },
      adminDecision: {
        type: String,
        default: null,
        validate: {
          validator(value) {
            return value == null || ["uphold", "override"].includes(value);
          },
          message: (props) => `\`${props.value}\` is not a valid appeal admin decision`,
        },
      },
      adminDecidedAt: { type: Date, default: null },
    },
    /** SLA automation markers (seller reminder / admin escalation). */
    slaReminderSentAt: { type: Date, default: null },
    slaEscalatedAt: { type: Date, default: null },
    /** Set when seller confirms physical return receipt (after-sales path). */
    receiptConfirmedAt: { type: Date, default: null },
    /**
     * Reverse logistics linkage (Shiprocket return pickup + tracking).
     * Populated when returnRequired=true and pickup scheduling is attempted.
     */
    reverseLogistics: {
      type: reverseLogisticsSchema,
      default: null,
    },
    /**
     * True when Resolution is Replacement/Repair (record-only; manual follow-up).
     * Cleared/false for Refund and Rejected.
     */
    manualFollowUpRequired: {
      type: Boolean,
      default: false,
    },
    /** Outbound replacement Order created from this case (normal fulfilment path). */
    replacementOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },
    returnReviewedAt: { type: Date, default: null },
    refundReviewedAt: { type: Date, default: null },
    refundCompletedAt: { type: Date, default: null },
    /** Set when after-sales Refund resolution credits the shopper wallet (Phase 4). */
    walletCreditProcessedAt: { type: Date, default: null },
    walletCreditAmount: { type: Number, default: null },
    financialReversalProcessedAt: { type: Date, default: null },
    financialReversalSummary: {
      commissionsCancelled: { type: Number, default: 0 },
      commissionsClawedBack: { type: Number, default: 0 },
      ledgerReversalAmount: { type: Number, default: 0 },
      pendingPayoutsRejected: { type: Number, default: 0 },
      payoutsNeedingReview: [{ type: mongoose.Schema.Types.ObjectId, ref: "Payout" }],
      skippedNoCommission: { type: Boolean, default: false },
    },
    statusHistory: {
      type: [statusHistoryEntrySchema],
      default: [],
    },
    /** Immutable audit of Resolution changes (append-only). */
    resolutionHistory: {
      type: [resolutionHistoryEntrySchema],
      default: [],
    },
  },
  { timestamps: true }
);

returnRequestSchema.index({ order: 1, status: 1 });
returnRequestSchema.index({ caseFlow: 1, status: 1 });

// Database-level guard: at most one active return request per order
returnRequestSchema.index(
  { order: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ACTIVE_RETURN_STATUSES } },
    name: "unique_active_return_per_order",
  }
);

returnRequestSchema.pre("save", function validateReturnStatusTransition(next) {
  const {
    isAllowedReturnStatusTransition,
    isTerminalReturnStatus,
  } = require("../utils/returnStatusGuards");

  if (this.isNew) {
    return next();
  }

  if (!this.isModified("status")) {
    return next();
  }

  const oldStatus = this._originalStatus ?? this.status;
  const newStatus = this.status;

  if (oldStatus === newStatus) {
    return next();
  }

  if (isTerminalReturnStatus(oldStatus)) {
    return next(new Error(`Cannot transition from terminal status: ${oldStatus}`));
  }

  if (!isAllowedReturnStatusTransition(oldStatus, newStatus)) {
    return next(
      new Error(`Invalid return request status transition: ${oldStatus} → ${newStatus}`)
    );
  }

  return next();
});

returnRequestSchema.pre("save", function validateResolutionHistoryAppendOnly(next) {
  if (this.isNew) {
    return next();
  }

  if (!this.isModified("resolutionHistory")) {
    return next();
  }

  try {
    assertResolutionHistoryAppendOnly(
      this._originalResolutionHistorySnapshot,
      this.resolutionHistory
    );
  } catch (err) {
    return next(err);
  }

  return next();
});

returnRequestSchema.post("init", function captureOriginalReturnState() {
  this._originalStatus = this.status;
  this._originalResolutionHistorySnapshot = snapshotResolutionHistory(
    this.resolutionHistory
  );
});

returnRequestSchema.post("save", function refreshOriginalReturnState() {
  this._originalStatus = this.status;
  this._originalResolutionHistorySnapshot = snapshotResolutionHistory(
    this.resolutionHistory
  );
});

const ReturnRequest = mongoose.model("ReturnRequest", returnRequestSchema);

module.exports = ReturnRequest;
module.exports.RETURN_REASON_CODES = RETURN_REASON_CODES;
module.exports.ISSUE_CATEGORIES = ISSUE_CATEGORIES;
module.exports.MAX_RETURN_EVIDENCE_FILES = MAX_RETURN_EVIDENCE_FILES;
module.exports.RETURN_EVIDENCE_MEDIA_TYPES = RETURN_EVIDENCE_MEDIA_TYPES;
module.exports.RETURN_STATUSES = RETURN_STATUSES;
module.exports.LEGACY_RETURN_STATUSES = LEGACY_RETURN_STATUSES;
module.exports.AFTER_SALES_LIFECYCLE_STATUSES = AFTER_SALES_LIFECYCLE_STATUSES;
module.exports.RETURN_RESOLUTIONS = RETURN_RESOLUTIONS;
module.exports.CASE_FLOW_VERSIONS = CASE_FLOW_VERSIONS;
module.exports.ACTIVE_RETURN_STATUSES = ACTIVE_RETURN_STATUSES;
module.exports.ACTOR_ROLES = ACTOR_ROLES;
module.exports.REVERSE_LOGISTICS_PROVIDERS = REVERSE_LOGISTICS_PROVIDERS;
module.exports.REVERSE_LOGISTICS_STATUSES = REVERSE_LOGISTICS_STATUSES;
module.exports.ALL_RESOLUTION_REASON_CODES = ALL_RESOLUTION_REASON_CODES;
