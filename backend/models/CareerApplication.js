const mongoose = require('mongoose');
const { EMAIL_REGEX } = require('./CustomerEnquiry');

const APPLICATION_STATUSES = [
  'submitted',
  'in_review',
  'shortlisted',
  'rejected',
  'hired',
  'withdrawn',
  'closed',
];

const applicantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: [EMAIL_REGEX, 'Please provide a valid email address'],
    },
    phone: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const resumeSchema = new mongoose.Schema(
  {
    storageKey: { type: String, required: true },
    originalFilename: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true, min: 0 },
    uploadedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false }
);

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, required: true, enum: APPLICATION_STATUSES },
    previousStatus: { type: String, default: null },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    changedAt: { type: Date, required: true, default: Date.now },
    note: { type: String, default: null, maxlength: 1000 },
  },
  { _id: false }
);

function generateApplicationNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  return `CAR-${year}${month}${day}-${random}`;
}

const careerApplicationSchema = new mongoose.Schema(
  {
    applicationNumber: {
      type: String,
      unique: true,
      required: true,
      default: generateApplicationNumber,
    },
    career: { type: mongoose.Schema.Types.ObjectId, ref: 'Career', required: true, index: true },
    careerTitle: { type: String, required: true, trim: true },
    careerSlug: { type: String, required: true, trim: true },
    applicant: { type: applicantSchema, required: true },
    coverLetter: { type: String, trim: true, maxlength: 5000, default: '' },
    resume: { type: resumeSchema, required: true },
    shopper: { type: mongoose.Schema.Types.ObjectId, ref: 'Shopper', default: null },
    status: {
      type: String,
      enum: APPLICATION_STATUSES,
      default: 'submitted',
      required: true,
    },
    adminNotes: { type: String, maxlength: 1000, default: '' },
    statusHistory: { type: [statusHistorySchema], default: [] },
    source: { type: String, default: 'careers_apply', trim: true },
    ipHash: { type: String, default: null },
    userAgent: { type: String, default: null, maxlength: 500 },
    resolvedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

careerApplicationSchema.index({ applicationNumber: 1 }, { unique: true });
careerApplicationSchema.index({ career: 1, createdAt: -1 });
careerApplicationSchema.index({ status: 1, createdAt: -1 });
careerApplicationSchema.index({ 'applicant.email': 1 });
careerApplicationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('CareerApplication', careerApplicationSchema);
module.exports.APPLICATION_STATUSES = APPLICATION_STATUSES;
module.exports.generateApplicationNumber = generateApplicationNumber;
