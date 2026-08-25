const mongoose = require('mongoose');

const EMAIL_REGEX = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;

const SOURCES = ['contact', 'well-wisher'];
const CATEGORIES = [
  'feature', 'bug', 'experience', 'seller', 'product', 'website',
  'payment', 'delivery', 'support', 'policy', 'other',
];
const STATUSES = ['submitted', 'in_review', 'resolved', 'closed'];

const submitterSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    match: [EMAIL_REGEX, 'Please provide a valid email address'],
  },
  phone: { type: String, trim: true, default: '' },
  anonymous: { type: Boolean, default: false },
}, { _id: false });

const statusHistorySchema = new mongoose.Schema({
  status: { type: String, required: true, enum: STATUSES },
  previousStatus: { type: String, default: null },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  changedAt: { type: Date, required: true, default: Date.now },
  note: { type: String, default: null, maxlength: 1000 },
}, { _id: false });

function generateEnquiryNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  return `ENQ-${year}${month}${day}-${random}`;
}

const customerEnquirySchema = new mongoose.Schema({
  enquiryNumber: {
    type: String,
    unique: true,
    required: true,
    default: generateEnquiryNumber,
  },
  source: {
    type: String,
    required: true,
    enum: SOURCES,
  },
  category: {
    type: String,
    enum: CATEGORIES,
  },
  subject: {
    type: String,
    trim: true,
    maxlength: 200,
  },
  message: {
    type: String,
    required: true,
    trim: true,
    minlength: 10,
    maxlength: 5000,
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
  },
  submitter: {
    type: submitterSchema,
    required: true,
  },
  shopper: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shopper',
    default: null,
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
  },
  orderInvoiceNumber: {
    type: String,
  },
  status: {
    type: String,
    enum: STATUSES,
    default: 'submitted',
  },
  adminNotes: {
    type: String,
    maxlength: 1000,
  },
  statusHistory: {
    type: [statusHistorySchema],
    default: [],
  },
  resolvedAt: { type: Date },
  closedAt: { type: Date },
}, { timestamps: true });

customerEnquirySchema.index({ enquiryNumber: 1 }, { unique: true });
customerEnquirySchema.index({ status: 1, createdAt: -1 });
customerEnquirySchema.index({ shopper: 1, createdAt: -1 });
customerEnquirySchema.index({ source: 1, category: 1, createdAt: -1 });
customerEnquirySchema.index({ order: 1 });
customerEnquirySchema.index({ 'submitter.email': 1 });
customerEnquirySchema.index({ createdAt: -1 });

module.exports = mongoose.model('CustomerEnquiry', customerEnquirySchema);
module.exports.SOURCES = SOURCES;
module.exports.CATEGORIES = CATEGORIES;
module.exports.STATUSES = STATUSES;
module.exports.EMAIL_REGEX = EMAIL_REGEX;
