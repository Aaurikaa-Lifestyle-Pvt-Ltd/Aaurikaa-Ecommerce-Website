const slugify = require('slugify');
const Career = require('../models/Career');
const {
  STATUSES,
  EMPLOYMENT_TYPES,
  extractPlainTextFromDescription,
} = require('../models/Career');
const { validateStructuredContent } = require('../utils/contentGovernance');
const { validateSEOMetadata, generateCareerSEOMetadata } = require('../utils/seoMetadata');

const ALLOWED_STATUS_TRANSITIONS = {
  draft: ['active', 'inactive', 'trashed'],
  active: ['inactive', 'trashed'],
  inactive: ['active', 'trashed'],
  trashed: ['inactive', 'active'],
};

const DEFAULT_LIST_SORT = { displayOrder: 1, createdAt: -1, _id: 1 };

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function isPubliclyVisible(career, now = new Date()) {
  if (!career || career.status !== 'active') return false;
  if (career.startDate && new Date(career.startDate) > now) return false;
  if (career.endDate && now > endOfDay(career.endDate)) return false;
  return true;
}

function getDisplayLabel(career, now = new Date()) {
  if (!career) return 'inactive';
  if (career.status === 'inactive') return 'inactive';
  if (career.status === 'draft' || career.status === 'trashed') return 'inactive';
  if (career.status === 'active') {
    return isPubliclyVisible(career, now) ? 'active' : 'closed';
  }
  return 'inactive';
}

function assertValidStatusTransition(from, to) {
  if (!from || !to || from === to) {
    return { valid: false, message: 'Invalid status transition' };
  }
  const allowed = ALLOWED_STATUS_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    return { valid: false, message: `Cannot transition from "${from}" to "${to}"` };
  }
  return { valid: true };
}

function parseDescription(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeDescription(value) {
  const parsed = parseDescription(value);
  if (!parsed) return null;
  return typeof value === 'string' ? value.trim() : JSON.stringify(parsed);
}

function validateDescription(value) {
  const parsed = parseDescription(value);
  if (!parsed) {
    return { valid: false, message: 'Description must be valid structured JSON' };
  }
  const validation = validateStructuredContent(parsed, 'CMS');
  if (!validation.isValid) {
    return {
      valid: false,
      message: 'Description content validation failed',
      details: { errors: validation.errors },
    };
  }
  return { valid: true, normalized: normalizeDescription(value) };
}

function validateSeoFields(payload) {
  const seoValidation = validateSEOMetadata({
    metaDescription: payload.metaDescription,
    ogTitle: payload.ogTitle,
    ogDescription: payload.ogDescription,
    twitterTitle: payload.twitterTitle,
    twitterDescription: payload.twitterDescription,
  });
  if (!seoValidation.isValid) {
    return { valid: false, message: seoValidation.errors.join('; ') };
  }
  return { valid: true };
}

function validateDisplayOrder(value) {
  if (value == null) {
    return { valid: true };
  }
  const order = Number(value);
  if (!Number.isInteger(order)) {
    return { valid: false, message: 'displayOrder must be an integer.' };
  }
  if (order < 0) {
    return { valid: false, message: 'displayOrder must be 0 or greater.' };
  }
  return { valid: true };
}

function resolveEffectiveDate(requestValue, existingValue) {
  if (requestValue !== undefined) {
    return requestValue ? new Date(requestValue) : null;
  }
  return existingValue ? new Date(existingValue) : null;
}

function validateEffectiveDateRange(effectiveStart, effectiveEnd) {
  if (effectiveStart && effectiveEnd && effectiveStart > effectiveEnd) {
    return { valid: false, message: 'startDate must be before or equal to endDate.' };
  }
  return { valid: true };
}

function validateCreatePayload(payload) {
  const errors = [];

  if (!payload.title || !String(payload.title).trim()) {
    errors.push('Title is required.');
  } else if (String(payload.title).length > 200) {
    errors.push('Title must not exceed 200 characters.');
  }

  const descValidation = validateDescription(payload.description);
  if (!descValidation.valid) {
    errors.push(descValidation.message);
  }

  if (payload.status && !STATUSES.includes(payload.status)) {
    errors.push(`Invalid status. Allowed: ${STATUSES.join(', ')}`);
  }

  if (payload.employmentType && !EMPLOYMENT_TYPES.includes(payload.employmentType)) {
    errors.push(`Invalid employmentType. Allowed: ${EMPLOYMENT_TYPES.join(', ')}`);
  }

  if (payload.displayOrder != null) {
    const orderCheck = validateDisplayOrder(payload.displayOrder);
    if (!orderCheck.valid) errors.push(orderCheck.message);
  }

  const seoCheck = validateSeoFields(payload);
  if (!seoCheck.valid) {
    errors.push(seoCheck.message);
  }

  const effectiveStart = payload.startDate ? new Date(payload.startDate) : null;
  const effectiveEnd = payload.endDate ? new Date(payload.endDate) : null;
  const dateCheck = validateEffectiveDateRange(effectiveStart, effectiveEnd);
  if (!dateCheck.valid) errors.push(dateCheck.message);

  if (errors.length > 0) {
    return { valid: false, message: errors.join(' ') };
  }

  return { valid: true, normalizedDescription: descValidation.normalized };
}

function validateUpdatePayload(payload, existing = null) {
  const errors = [];

  if (payload.title !== undefined) {
    if (!String(payload.title).trim()) errors.push('Title cannot be empty.');
    else if (String(payload.title).length > 200) errors.push('Title must not exceed 200 characters.');
  }

  if (payload.description !== undefined) {
    const descValidation = validateDescription(payload.description);
    if (!descValidation.valid) errors.push(descValidation.message);
  }

  if (payload.status !== undefined && !STATUSES.includes(payload.status)) {
    errors.push(`Invalid status. Allowed: ${STATUSES.join(', ')}`);
  }

  if (payload.employmentType !== undefined && !EMPLOYMENT_TYPES.includes(payload.employmentType)) {
    errors.push(`Invalid employmentType. Allowed: ${EMPLOYMENT_TYPES.join(', ')}`);
  }

  if (payload.displayOrder != null) {
    const orderCheck = validateDisplayOrder(payload.displayOrder);
    if (!orderCheck.valid) errors.push(orderCheck.message);
  }

  const seoCheck = validateSeoFields(payload);
  if (!seoCheck.valid) errors.push(seoCheck.message);

  if (payload.startDate !== undefined || payload.endDate !== undefined) {
    const effectiveStart = resolveEffectiveDate(payload.startDate, existing?.startDate);
    const effectiveEnd = resolveEffectiveDate(payload.endDate, existing?.endDate);
    const dateCheck = validateEffectiveDateRange(effectiveStart, effectiveEnd);
    if (!dateCheck.valid) errors.push(dateCheck.message);
  }

  if (errors.length > 0) {
    return { valid: false, message: errors.join(' ') };
  }

  return { valid: true };
}

async function generateUniqueSlug(title, excludeId = null) {
  const base = slugify(String(title), { lower: true, strict: true }) || 'career';
  let candidate = `${base}-${Math.random().toString(36).substring(2, 7)}`;
  let attempts = 0;

  while (attempts < 10) {
    const query = { slug: candidate };
    if (excludeId) query._id = { $ne: excludeId };
    const existing = await Career.findOne(query).select('_id').lean();
    if (!existing) return candidate;
    candidate = `${base}-${Math.random().toString(36).substring(2, 7)}`;
    attempts += 1;
  }

  return `${base}-${Date.now().toString(36)}`;
}

function applyPublishingAudit(career, adminId) {
  if (!career.publishedAt && isPubliclyVisible(career)) {
    career.publishedAt = new Date();
    career.publishedBy = adminId;
  }
}

function applyStatusAudit(career, adminId, newStatus) {
  if (newStatus && newStatus !== career.status) {
    career.statusChangedBy = adminId;
    career.statusChangedAt = new Date();
  }
}

function buildCareerDocument(payload, adminId, { isCreate = false } = {}) {
  const doc = {};

  if (payload.title !== undefined) doc.title = String(payload.title).trim();
  if (payload.description !== undefined) {
    doc.description = normalizeDescription(payload.description);
  }
  if (payload.location !== undefined) doc.location = String(payload.location || '').trim();
  if (payload.employmentType !== undefined) doc.employmentType = payload.employmentType;
  if (payload.department !== undefined) doc.department = String(payload.department || '').trim();
  if (payload.status !== undefined) doc.status = payload.status;
  if (payload.displayOrder !== undefined) doc.displayOrder = Number(payload.displayOrder);
  if (payload.startDate !== undefined) doc.startDate = payload.startDate ? new Date(payload.startDate) : null;
  if (payload.endDate !== undefined) doc.endDate = payload.endDate ? new Date(payload.endDate) : null;
  if (payload.slug !== undefined && String(payload.slug).trim()) {
    doc.slug = slugify(String(payload.slug).trim(), { lower: true, strict: true });
  }

  const seoFields = [
    'metaTitle', 'metaDescription', 'metaKeywords', 'canonicalUrl',
    'ogTitle', 'ogDescription', 'twitterTitle', 'twitterDescription',
  ];
  seoFields.forEach((field) => {
    if (payload[field] !== undefined) doc[field] = payload[field];
  });

  doc.updatedBy = adminId;
  if (isCreate) doc.createdBy = adminId;

  return doc;
}

function toAdminListDTO(career) {
  const obj = career.toObject ? career.toObject() : career;
  return {
    _id: obj._id,
    title: obj.title,
    slug: obj.slug,
    location: obj.location,
    employmentType: obj.employmentType,
    department: obj.department,
    status: obj.status,
    displayOrder: obj.displayOrder,
    startDate: obj.startDate,
    endDate: obj.endDate,
    publishedAt: obj.publishedAt,
    isPubliclyVisible: isPubliclyVisible(obj),
    displayLabel: getDisplayLabel(obj),
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
    createdBy: obj.createdBy,
    updatedBy: obj.updatedBy,
  };
}

function toAdminDetailDTO(career) {
  const obj = career.toObject ? career.toObject() : career;
  return {
    ...obj,
    isPubliclyVisible: isPubliclyVisible(obj),
    displayLabel: getDisplayLabel(obj),
    excerpt: extractPlainTextFromDescription(obj.description).substring(0, 200),
  };
}

function toPublicListDTO(career) {
  const obj = career.toObject ? career.toObject() : career;
  return {
    _id: obj._id,
    title: obj.title,
    slug: obj.slug,
    location: obj.location,
    employmentType: obj.employmentType,
    displayOrder: obj.displayOrder,
    startDate: obj.startDate,
    endDate: obj.endDate,
    isPubliclyVisible: isPubliclyVisible(obj),
    displayLabel: getDisplayLabel(obj),
    excerpt: extractPlainTextFromDescription(obj.description).substring(0, 200),
  };
}

function toPublicDetailDTO(career, baseUrl = 'http://localhost:3000') {
  const obj = career.toObject ? career.toObject() : career;
  return {
    _id: obj._id,
    title: obj.title,
    slug: obj.slug,
    description: obj.description,
    location: obj.location,
    employmentType: obj.employmentType,
    department: obj.department,
    displayOrder: obj.displayOrder,
    startDate: obj.startDate,
    endDate: obj.endDate,
    publishedAt: obj.publishedAt,
    isPubliclyVisible: isPubliclyVisible(obj),
    displayLabel: getDisplayLabel(obj),
    excerpt: extractPlainTextFromDescription(obj.description).substring(0, 200),
    seo: generateCareerSEOMetadata(career, baseUrl),
  };
}

function buildListSort(sortField, sortOrder) {
  const order = sortOrder === 'desc' ? -1 : 1;
  if (sortField === 'createdAt') {
    return { createdAt: order, displayOrder: 1, _id: 1 };
  }
  return DEFAULT_LIST_SORT;
}

async function createCareer(payload, adminId) {
  const validation = validateCreatePayload(payload);
  if (!validation.valid) {
    return { invalid: true, message: validation.message };
  }

  const doc = buildCareerDocument(
    {
      ...payload,
      description: validation.normalizedDescription,
      status: payload.status || 'draft',
      displayOrder: payload.displayOrder != null ? Number(payload.displayOrder) : 0,
    },
    adminId,
    { isCreate: true }
  );

  if (!doc.slug) {
    doc.slug = await generateUniqueSlug(doc.title);
  } else {
    const existing = await Career.findOne({ slug: doc.slug }).select('_id').lean();
    if (existing) {
      return { invalid: true, message: 'Slug already exists.' };
    }
  }

  const career = new Career(doc);
  applyStatusAudit(career, adminId, career.status);
  applyPublishingAudit(career, adminId);
  await career.save();

  return { career: toAdminDetailDTO(career) };
}

async function updateCareer(id, payload, adminId) {
  const career = await Career.findById(id);
  if (!career) return { notFound: true };

  const validation = validateUpdatePayload(payload, career);
  if (!validation.valid) {
    return { invalid: true, message: validation.message };
  }

  const updates = buildCareerDocument(payload, adminId);

  if (updates.slug && updates.slug !== career.slug) {
    const existing = await Career.findOne({ slug: updates.slug, _id: { $ne: id } }).select('_id').lean();
    if (existing) {
      return { invalid: true, message: 'Slug already exists.' };
    }
  }

  if (payload.status !== undefined && payload.status !== career.status) {
    const transition = assertValidStatusTransition(career.status, payload.status);
    if (!transition.valid) {
      return { invalid: true, message: transition.message };
    }
    applyStatusAudit(career, adminId, payload.status);
  }

  Object.assign(career, updates);
  applyPublishingAudit(career, adminId);
  await career.save();

  return { career: toAdminDetailDTO(career) };
}

async function updateCareerStatus(id, status, adminId) {
  if (!STATUSES.includes(status)) {
    return { invalid: true, message: `Invalid status. Allowed: ${STATUSES.join(', ')}` };
  }

  const career = await Career.findById(id);
  if (!career) return { notFound: true };

  if (status === career.status) {
    return { career: toAdminDetailDTO(career) };
  }

  const transition = assertValidStatusTransition(career.status, status);
  if (!transition.valid) {
    return { invalid: true, message: transition.message };
  }

  career.status = status;
  applyStatusAudit(career, adminId, status);
  career.updatedBy = adminId;
  applyPublishingAudit(career, adminId);
  await career.save();

  return { career: toAdminDetailDTO(career) };
}

async function softDeleteCareer(id, adminId) {
  return updateCareerStatus(id, 'trashed', adminId);
}

async function reorderCareers(items, adminId) {
  if (!Array.isArray(items) || items.length === 0) {
    return { invalid: true, message: 'items array is required.' };
  }

  const bulkOps = [];
  for (const item of items) {
    if (!item.id || item.displayOrder == null) {
      return { invalid: true, message: 'Each item requires id and displayOrder.' };
    }
    if (!Number.isInteger(Number(item.displayOrder))) {
      return { invalid: true, message: 'displayOrder must be an integer for each item.' };
    }
    const orderCheck = validateDisplayOrder(item.displayOrder);
    if (!orderCheck.valid) {
      return { invalid: true, message: orderCheck.message };
    }
    bulkOps.push({
      updateOne: {
        filter: { _id: item.id },
        update: { $set: { displayOrder: Number(item.displayOrder), updatedBy: adminId } },
      },
    });
  }

  await Career.bulkWrite(bulkOps);
  const ids = items.map((i) => i.id);
  const careers = await Career.find({ _id: { $in: ids } }).sort(DEFAULT_LIST_SORT);

  return { careers: careers.map(toAdminListDTO) };
}

async function getCareerById(id) {
  const career = await Career.findById(id)
    .populate('createdBy', 'name email')
    .populate('updatedBy', 'name email')
    .populate('publishedBy', 'name email')
    .populate('statusChangedBy', 'name email');

  if (!career) return { notFound: true };
  return { career: toAdminDetailDTO(career) };
}

async function listCareersForAdmin({ filters = {}, pagination = {}, sort = {} } = {}) {
  const page = Math.max(1, parseInt(pagination.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(pagination.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const query = {};
  if (filters.status && STATUSES.includes(filters.status)) {
    query.status = filters.status;
  }
  if (filters.q) {
    const q = String(filters.q).trim();
    if (q) {
      query.$or = [
        { title: { $regex: q, $options: 'i' } },
        { slug: { $regex: q, $options: 'i' } },
      ];
    }
  }

  const sortSpec = buildListSort(sort.field, sort.order);

  const [totalCount, careers] = await Promise.all([
    Career.countDocuments(query),
    Career.find(query).sort(sortSpec).skip(skip).limit(limit),
  ]);

  return {
    careers: careers.map(toAdminListDTO),
    pagination: {
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit) || 0,
      totalCount,
    },
  };
}

async function getCareerStats() {
  const [draft, active, inactive, trashed, total] = await Promise.all([
    Career.countDocuments({ status: 'draft' }),
    Career.countDocuments({ status: 'active' }),
    Career.countDocuments({ status: 'inactive' }),
    Career.countDocuments({ status: 'trashed' }),
    Career.countDocuments({}),
  ]);

  return { draft, active, inactive, trashed, total };
}

async function listPublicCareers({ filters = {}, pagination = {} } = {}) {
  const page = Math.max(1, parseInt(pagination.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(pagination.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const query = { status: 'active' };
  if (filters.department) query.department = String(filters.department).trim();
  if (filters.employmentType && EMPLOYMENT_TYPES.includes(filters.employmentType)) {
    query.employmentType = filters.employmentType;
  }

  const [totalCount, careers] = await Promise.all([
    Career.countDocuments(query),
    Career.find(query).sort(DEFAULT_LIST_SORT).skip(skip).limit(limit),
  ]);

  return {
    careers: careers.map(toPublicListDTO),
    pagination: {
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit) || 0,
      totalCount,
    },
  };
}

async function getCareerBySlug(slug) {
  const career = await Career.findOne({ slug: String(slug).trim(), status: 'active' });
  if (!career) return { notFound: true };
  return { career };
}

async function getPublicCareerBySlug(slug, baseUrl) {
  const result = await getCareerBySlug(slug);
  if (result.notFound) return { notFound: true };
  return { career: toPublicDetailDTO(result.career, baseUrl) };
}

module.exports = {
  STATUSES,
  EMPLOYMENT_TYPES,
  ALLOWED_STATUS_TRANSITIONS,
  DEFAULT_LIST_SORT,
  endOfDay,
  isPubliclyVisible,
  getDisplayLabel,
  assertValidStatusTransition,
  validateCreatePayload,
  validateUpdatePayload,
  validateDisplayOrder,
  generateUniqueSlug,
  toAdminListDTO,
  toAdminDetailDTO,
  toPublicListDTO,
  toPublicDetailDTO,
  createCareer,
  updateCareer,
  updateCareerStatus,
  softDeleteCareer,
  reorderCareers,
  getCareerById,
  listCareersForAdmin,
  getCareerStats,
  listPublicCareers,
  getCareerBySlug,
  getPublicCareerBySlug,
};
