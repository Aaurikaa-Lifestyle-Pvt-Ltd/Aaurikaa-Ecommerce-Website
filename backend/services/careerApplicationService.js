const crypto = require('crypto');
const Career = require('../models/Career');
const CareerApplication = require('../models/CareerApplication');
const {
  APPLICATION_STATUSES,
  generateApplicationNumber,
} = require('../models/CareerApplication');
const { EMAIL_REGEX } = require('../models/CustomerEnquiry');
const { isPubliclyVisible } = require('./careerService');

const ADMIN_NOTES_MAX = 1000;
const COVER_LETTER_MAX = 5000;

const OPEN_APPLICATION_STATUSES = ['submitted', 'in_review', 'shortlisted'];

const ALLOWED_TRANSITIONS = {
  submitted: ['in_review', 'shortlisted', 'rejected', 'withdrawn', 'closed'],
  in_review: ['shortlisted', 'rejected', 'withdrawn', 'closed'],
  shortlisted: ['hired', 'rejected', 'withdrawn', 'closed'],
  rejected: ['closed'],
  hired: ['closed'],
  withdrawn: ['closed'],
  closed: [],
};

function assertValidStatusTransition(from, to) {
  if (!from || !to || from === to) {
    return { valid: false, message: 'Invalid status transition' };
  }
  const allowed = ALLOWED_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    return { valid: false, message: `Cannot transition from "${from}" to "${to}"` };
  }
  return { valid: true };
}

function appendStatusHistory(application, entry) {
  application.statusHistory.push({
    status: entry.status,
    previousStatus: entry.previousStatus ?? null,
    changedBy: entry.changedBy ?? null,
    changedAt: entry.changedAt || new Date(),
    note: entry.note ?? null,
  });
}

function sanitizeResumeForResponse(resume) {
  if (!resume) return null;
  const obj = resume.toObject ? resume.toObject() : resume;
  return {
    originalFilename: obj.originalFilename,
    mimeType: obj.mimeType,
    sizeBytes: obj.sizeBytes,
    uploadedAt: obj.uploadedAt,
  };
}

function toAdminListDTO(application) {
  const obj = application.toObject ? application.toObject() : application;
  return {
    _id: obj._id,
    applicationNumber: obj.applicationNumber,
    career: obj.career,
    careerTitle: obj.careerTitle,
    careerSlug: obj.careerSlug,
    applicant: obj.applicant,
    status: obj.status,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
    hasResume: Boolean(obj.resume && obj.resume.storageKey),
  };
}

function toAdminDetailDTO(application) {
  const obj = application.toObject ? application.toObject() : application;
  return {
    ...obj,
    resume: sanitizeResumeForResponse(obj.resume),
  };
}

function validateCreatePayload(payload) {
  const errors = [];

  if (!payload.careerId) {
    errors.push('careerId is required.');
  }

  const applicant = payload.applicant || {};
  if (!applicant.name || !String(applicant.name).trim()) {
    errors.push('Applicant name is required.');
  }
  if (!applicant.email || !EMAIL_REGEX.test(applicant.email)) {
    errors.push('A valid applicant email is required.');
  }

  if (payload.coverLetter && String(payload.coverLetter).length > COVER_LETTER_MAX) {
    errors.push(`Cover letter must not exceed ${COVER_LETTER_MAX} characters.`);
  }

  if (!payload.resume || !payload.resume.storageKey) {
    errors.push('Resume is required.');
  }

  if (errors.length > 0) {
    return { valid: false, message: errors.join(' ') };
  }

  return { valid: true };
}

async function hasOpenApplication(careerId, email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return false;

  const existing = await CareerApplication.findOne({
    career: careerId,
    'applicant.email': normalized,
    status: { $in: OPEN_APPLICATION_STATUSES },
  }).select('_id').lean();

  return Boolean(existing);
}

async function validateCareerForSubmission(career) {
  if (!career) {
    return { valid: false, statusCode: 404, message: 'Career posting not found.' };
  }
  if (!isPubliclyVisible(career)) {
    return { valid: false, statusCode: 400, message: 'This position is not accepting applications.' };
  }
  return { valid: true };
}

function hashClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = req.ip
    || (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : null)
    || req.socket?.remoteAddress
    || '';
  if (!ip) return null;

  const salt = process.env.IP_HASH_SALT || 'anbazar-career-application';
  return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}

function toSubmitResponseDTO(application) {
  return {
    applicationNumber: application.applicationNumber,
    status: application.status,
    createdAt: application.createdAt,
  };
}

function buildFakeHoneypotResponse() {
  return {
    applicationNumber: generateApplicationNumber(),
    status: 'submitted',
    createdAt: new Date().toISOString(),
  };
}

async function createCareerApplication(payload, context = {}) {
  if (payload.website && String(payload.website).trim()) {
    return { honeypot: true };
  }

  const validation = validateCreatePayload(payload);
  if (!validation.valid) {
    return { invalid: true, message: validation.message };
  }

  const career = await Career.findById(payload.careerId).lean();
  const careerCheck = await validateCareerForSubmission(career);
  if (!careerCheck.valid) {
    return {
      invalid: true,
      statusCode: careerCheck.statusCode,
      message: careerCheck.message,
    };
  }

  const email = String(payload.applicant.email).trim().toLowerCase();
  if (await hasOpenApplication(payload.careerId, email)) {
    return {
      invalid: true,
      statusCode: 409,
      message: 'You already have an open application for this position.',
    };
  }

  const now = new Date();
  const applicationData = {
    applicationNumber: payload.applicationNumber || generateApplicationNumber(),
    career: career._id,
    careerTitle: career.title,
    careerSlug: career.slug,
    applicant: {
      name: String(payload.applicant.name).trim(),
      email,
      phone: payload.applicant.phone ? String(payload.applicant.phone).trim() : '',
    },
    coverLetter: payload.coverLetter ? String(payload.coverLetter).trim() : '',
    resume: payload.resume,
    status: 'submitted',
    statusHistory: [],
    source: 'careers_apply',
    ipHash: context.ipHash || null,
    userAgent: context.userAgent || null,
  };

  if (context.shopperId) {
    applicationData.shopper = context.shopperId;
  }

  const application = new CareerApplication(applicationData);
  appendStatusHistory(application, {
    status: 'submitted',
    previousStatus: null,
    changedBy: null,
    changedAt: now,
    note: null,
  });

  await application.save();

  return { application };
}

async function getApplicationStats() {
  const counts = await CareerApplication.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const stats = { total: 0 };
  APPLICATION_STATUSES.forEach((s) => { stats[s] = 0; });

  counts.forEach(({ _id, count }) => {
    stats[_id] = count;
    stats.total += count;
  });

  return stats;
}

function buildAdminApplicationFilter(filters = {}) {
  const query = {};

  if (filters.status && APPLICATION_STATUSES.includes(filters.status)) {
    query.status = filters.status;
  }

  if (filters.careerId) {
    query.career = filters.careerId;
  }

  if (filters.dateFrom || filters.dateTo) {
    query.createdAt = {};
    if (filters.dateFrom) {
      query.createdAt.$gte = new Date(filters.dateFrom);
    }
    if (filters.dateTo) {
      const end = new Date(filters.dateTo);
      end.setHours(23, 59, 59, 999);
      query.createdAt.$lte = end;
    }
  }

  if (filters.q) {
    const regex = new RegExp(
      String(filters.q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      'i'
    );
    query.$or = [
      { applicationNumber: regex },
      { careerTitle: regex },
      { careerSlug: regex },
      { 'applicant.email': regex },
      { 'applicant.name': regex },
    ];
  }

  return query;
}

async function listApplicationsForAdmin({ filters = {}, pagination = {} } = {}) {
  const page = Math.max(1, parseInt(pagination.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(pagination.limit, 10) || 20));
  const skip = (page - 1) * limit;
  const query = buildAdminApplicationFilter(filters);

  const [totalCount, applications] = await Promise.all([
    CareerApplication.countDocuments(query),
    CareerApplication.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('career', 'title slug status'),
  ]);

  return {
    applications: applications.map(toAdminListDTO),
    pagination: {
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit) || 0,
      totalCount,
    },
  };
}

async function getApplicationById(id) {
  const application = await CareerApplication.findById(id)
    .populate('career', 'title slug status location employmentType')
    .populate('shopper', 'firstName lastName email');

  if (!application) {
    return { notFound: true };
  }

  return { application: toAdminDetailDTO(application) };
}

async function updateApplication(id, { adminId, status, adminNotes }) {
  const application = await CareerApplication.findById(id);
  if (!application) {
    return { notFound: true };
  }

  const previousStatus = application.status;
  let statusChanged = false;

  if (status !== undefined && status !== null && status !== '') {
    if (!APPLICATION_STATUSES.includes(status)) {
      return { invalid: true, message: 'Invalid status value.' };
    }

    if (status !== application.status) {
      const transition = assertValidStatusTransition(application.status, status);
      if (!transition.valid) {
        return { invalid: true, message: transition.message };
      }

      application.status = status;
      statusChanged = true;

      if (status === 'hired' && !application.resolvedAt) {
        application.resolvedAt = new Date();
      }
      if (status === 'closed' && !application.closedAt) {
        application.closedAt = new Date();
      }

      appendStatusHistory(application, {
        status,
        previousStatus,
        changedBy: adminId,
        changedAt: new Date(),
        note: adminNotes || null,
      });
    }
  }

  if (adminNotes !== undefined) {
    application.adminNotes = String(adminNotes || '').slice(0, ADMIN_NOTES_MAX);
  }

  await application.save();

  return {
    application: toAdminDetailDTO(application),
    statusChanged,
    previousStatus,
  };
}

async function getApplicationResumeForDownload(id) {
  const application = await CareerApplication.findById(id).select('resume applicationNumber').lean();
  if (!application) {
    return { notFound: true };
  }
  if (!application.resume?.storageKey) {
    return { notFound: true, message: 'Resume not found for this application.' };
  }

  return {
    storageKey: application.resume.storageKey,
    originalFilename: application.resume.originalFilename,
    mimeType: application.resume.mimeType,
    applicationNumber: application.applicationNumber,
  };
}

module.exports = {
  APPLICATION_STATUSES,
  OPEN_APPLICATION_STATUSES,
  ALLOWED_TRANSITIONS,
  ADMIN_NOTES_MAX,
  COVER_LETTER_MAX,
  generateApplicationNumber,
  assertValidStatusTransition,
  appendStatusHistory,
  sanitizeResumeForResponse,
  toAdminListDTO,
  toAdminDetailDTO,
  toSubmitResponseDTO,
  buildFakeHoneypotResponse,
  validateCreatePayload,
  hasOpenApplication,
  validateCareerForSubmission,
  createCareerApplication,
  hashClientIp,
  getApplicationStats,
  listApplicationsForAdmin,
  getApplicationById,
  updateApplication,
  getApplicationResumeForDownload,
};
