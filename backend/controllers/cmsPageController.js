const CmsPage = require('../models/CmsPage');
const { validateStructuredContent } = require('../utils/contentGovernance');
const { sendErrorResponse, sendSuccessResponse, HTTP_STATUS, ERROR_CODES } = require('../utils/errorHandler');
const { applyTranslations } = require('../utils/applyTranslations');

const RESERVED_SLUGS = new Set([
  '/',
  '/shop',
  '/blog',
  '/cart',
  '/checkout',
  '/account',
  '/seller',
  '/admin',
  '/login',
  '/register'
]);

const ALLOWED_TYPES = ['about', 'contact', 'policy', 'custom'];
const ALLOWED_STATUSES = ['draft', 'published', 'trashed'];

const normalizeSlug = (slug) => {
  if (typeof slug !== 'string') return '';
  let normalized = slug.trim();
  if (!normalized) return '';
  if (!normalized.startsWith('/')) normalized = `/${normalized}`;
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
};

const parseStructuredContent = (content) => {
  if (!content) return null;
  if (typeof content === 'string') {
    try {
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }
  if (typeof content === 'object') {
    return content;
  }
  return null;
};

const ensureSingletonType = async (type, pageId = null) => {
  if (!['about', 'contact'].includes(type)) return null;
  const query = { type };
  if (pageId) {
    query._id = { $ne: pageId };
  }
  const existing = await CmsPage.findOne(query).lean();
  if (existing) {
    return `Only one ${type} page is allowed`;
  }
  return null;
};

const validatePayload = async ({ title, slug, content, status, type }, pageId = null) => {
  const missing = [];
  if (!title || (typeof title === 'string' && title.trim() === '')) missing.push('title');
  if (!slug || (typeof slug === 'string' && slug.trim() === '')) missing.push('slug');
  if (!content) missing.push('content');
  if (!status) missing.push('status');
  if (!type) missing.push('type');

  if (missing.length > 0) {
    return { ok: false, message: 'Missing required fields', details: { missing } };
  }

  if (!ALLOWED_TYPES.includes(type)) {
    return { ok: false, message: 'Invalid type', details: { allowed: ALLOWED_TYPES } };
  }

  if (!ALLOWED_STATUSES.includes(status)) {
    return { ok: false, message: 'Invalid status', details: { allowed: ALLOWED_STATUSES } };
  }

  const normalizedSlug = normalizeSlug(slug);
  if (!normalizedSlug) {
    return { ok: false, message: 'Invalid slug', details: { slug } };
  }

  if (RESERVED_SLUGS.has(normalizedSlug)) {
    return { ok: false, message: 'Slug is reserved', details: { slug: normalizedSlug } };
  }

  const duplicateSlug = await CmsPage.findOne({
    slug: normalizedSlug,
    ...(pageId ? { _id: { $ne: pageId } } : {})
  }).lean();
  if (duplicateSlug) {
    return { ok: false, message: 'Slug already exists', details: { slug: normalizedSlug } };
  }

  const singletonError = await ensureSingletonType(type, pageId);
  if (singletonError) {
    return { ok: false, message: singletonError };
  }

  const parsedContent = parseStructuredContent(content);
  if (!parsedContent) {
    return { ok: false, message: 'Content must be structured JSON' };
  }

  const validation = validateStructuredContent(parsedContent, 'CMS');
  if (!validation.isValid) {
    return { ok: false, message: 'Content validation failed', details: { errors: validation.errors } };
  }

  return { ok: true, normalizedSlug, normalizedContent: typeof content === 'string' ? content : JSON.stringify(parsedContent) };
};

exports.createPage = async (req, res) => {
  try {
    const { title, slug, content, status, type } = req.body || {};

    const validation = await validatePayload({ title, slug, content, status, type });
    if (!validation.ok) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        validation.message,
        ERROR_CODES.VALIDATION_FAILED,
        validation.details
      );
    }

    const page = await CmsPage.create({
      title: title.trim(),
      slug: validation.normalizedSlug,
      content: validation.normalizedContent,
      status,
      type,
      published_at: status === 'published' ? new Date() : null
    });

    return sendSuccessResponse(res, HTTP_STATUS.CREATED, 'CMS page created', { page });
  } catch (error) {
    console.error('CMS create error:', error);
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to create CMS page',
      ERROR_CODES.INTERNAL_SERVER_ERROR
    );
  }
};

exports.listPages = async (req, res) => {
  try {
    const { status, type } = req.query || {};
    const query = {};
    if (status && ALLOWED_STATUSES.includes(status)) query.status = status;
    if (type && ALLOWED_TYPES.includes(type)) query.type = type;

    const pages = await CmsPage.find(query).sort({ updatedAt: -1 }).lean();
    return sendSuccessResponse(res, HTTP_STATUS.OK, 'CMS pages fetched', { pages });
  } catch (error) {
    console.error('CMS list error:', error);
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to fetch CMS pages',
      ERROR_CODES.INTERNAL_SERVER_ERROR
    );
  }
};

exports.getPageById = async (req, res) => {
  try {
    const { id } = req.params;
    const page = await CmsPage.findById(id).lean();
    if (!page) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.NOT_FOUND,
        'CMS page not found',
        ERROR_CODES.RESOURCE_NOT_FOUND
      );
    }
    return sendSuccessResponse(res, HTTP_STATUS.OK, 'CMS page fetched', { page });
  } catch (error) {
    console.error('CMS get error:', error);
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to fetch CMS page',
      ERROR_CODES.INTERNAL_SERVER_ERROR
    );
  }
};

exports.updatePage = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await CmsPage.findById(id);
    if (!existing) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.NOT_FOUND,
        'CMS page not found',
        ERROR_CODES.RESOURCE_NOT_FOUND
      );
    }

    const { title, slug, content, status, type } = req.body || {};
    const validation = await validatePayload({ title, slug, content, status, type }, id);
    if (!validation.ok) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        validation.message,
        ERROR_CODES.VALIDATION_FAILED,
        validation.details
      );
    }

    const previousStatus = existing.status;
    existing.title = title.trim();
    existing.slug = validation.normalizedSlug;
    existing.content = validation.normalizedContent;
    existing.type = type;
    existing.status = status;

    if (status === 'published' && previousStatus !== 'published') {
      existing.published_at = new Date();
    } else if (status === 'published' && !existing.published_at) {
      existing.published_at = new Date();
    }

    await existing.save();

    return sendSuccessResponse(res, HTTP_STATUS.OK, 'CMS page updated', { page: existing });
  } catch (error) {
    console.error('CMS update error:', error);
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to update CMS page',
      ERROR_CODES.INTERNAL_SERVER_ERROR
    );
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};

    if (!ALLOWED_STATUSES.includes(status)) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        'Invalid status',
        ERROR_CODES.VALIDATION_FAILED,
        { allowed: ALLOWED_STATUSES }
      );
    }

    const page = await CmsPage.findById(id);
    if (!page) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.NOT_FOUND,
        'CMS page not found',
        ERROR_CODES.RESOURCE_NOT_FOUND
      );
    }

    const previousStatus = page.status;
    page.status = status;
    if (status === 'published' && previousStatus !== 'published') {
      page.published_at = new Date();
    }

    await page.save();

    return sendSuccessResponse(res, HTTP_STATUS.OK, 'CMS page status updated', { page });
  } catch (error) {
    console.error('CMS status update error:', error);
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to update CMS page status',
      ERROR_CODES.INTERNAL_SERVER_ERROR
    );
  }
};

exports.trashPage = async (req, res) => {
  try {
    const { id } = req.params;
    const page = await CmsPage.findById(id);
    if (!page) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.NOT_FOUND,
        'CMS page not found',
        ERROR_CODES.RESOURCE_NOT_FOUND
      );
    }

    page.status = 'trashed';
    await page.save();

    return sendSuccessResponse(res, HTTP_STATUS.OK, 'CMS page moved to trash', { page });
  } catch (error) {
    console.error('CMS delete error:', error);
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to delete CMS page',
      ERROR_CODES.INTERNAL_SERVER_ERROR
    );
  }
};

exports.getPublishedPageBySlug = async (req, res) => {
  try {
    const rawSlug = req.query.slug;
    const normalizedSlug = normalizeSlug(rawSlug);

    if (!normalizedSlug) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        'Slug is required',
        ERROR_CODES.VALIDATION_REQUIRED_FIELDS
      );
    }

    let page = await CmsPage.findOne({ slug: normalizedSlug, status: 'published' }).lean();
    if (!page) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.NOT_FOUND,
        'CMS page not found',
        ERROR_CODES.RESOURCE_NOT_FOUND
      );
    }
    const locale = req.query.locale;
    if (locale && locale !== 'en') {
      page = await applyTranslations(page, 'CmsPage', locale, ['title', 'content']);
    }
    return sendSuccessResponse(res, HTTP_STATUS.OK, 'CMS page fetched', { page });
  } catch (error) {
    console.error('CMS public fetch error:', error);
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to fetch CMS page',
      ERROR_CODES.INTERNAL_SERVER_ERROR
    );
  }
};
