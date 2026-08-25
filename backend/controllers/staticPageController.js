const StaticPageContent = require('../models/StaticPageContent');
const {
  getRegistryEntry,
  isAllowedPageKey,
  isPilotPageKey,
} = require('../config/staticPageRegistry');
const { getManifest } = require('../config/staticPageManifests');
const { validateStaticPagePayload, zonesMapToObject } = require('../utils/staticPageValidation');
const { applyTranslations } = require('../utils/applyTranslations');
const {
  shouldExposeStaticPageKey,
  listVisibleRegistryEntries,
  emptyZonesFromManifest,
} = require('../utils/aaurikaaStaticPages');
const { sendErrorResponse, sendSuccessResponse, HTTP_STATUS, ERROR_CODES } = require('../utils/errorHandler');

const serializePage = (doc) => {
  if (!doc) return null;
  const json = doc.toJSON ? doc.toJSON() : doc;
  return {
    pageKey: json.pageKey,
    slug: json.slug,
    status: json.status,
    seo: json.seo || { title: '', metaDescription: '' },
    zones: json.zones || {},
    publishedAt: json.publishedAt,
    createdAt: json.createdAt,
    updatedAt: json.updatedAt,
    _id: json._id,
  };
};

exports.listRegistry = async (req, res) => {
  try {
    const docs = await StaticPageContent.find({}).lean();
    const byKey = new Map(docs.map((d) => [d.pageKey, d]));

    const pages = listVisibleRegistryEntries().map((entry) => {
      const doc = byKey.get(entry.pageKey);
      const manifest = getManifest(entry.pageKey);
      return {
        pageKey: entry.pageKey,
        slug: entry.slug,
        title: entry.title,
        type: entry.type,
        cmsEnabled: Boolean(manifest),
        pilot: isPilotPageKey(entry.pageKey),
        cmsStatus: doc?.status || 'missing',
        updatedAt: doc?.updatedAt || null,
      };
    });

    return sendSuccessResponse(res, HTTP_STATUS.OK, 'Static page registry fetched', { pages });
  } catch (error) {
    console.error('Static page list error:', error);
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to fetch static page registry',
      ERROR_CODES.INTERNAL_SERVER_ERROR
    );
  }
};

exports.getByPageKeyAdmin = async (req, res) => {
  try {
    const { pageKey } = req.params;
    if (!isAllowedPageKey(pageKey) || !shouldExposeStaticPageKey(pageKey)) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        'Invalid pageKey',
        ERROR_CODES.VALIDATION_FAILED
      );
    }

    const manifest = getManifest(pageKey);
    if (!manifest) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.NOT_FOUND,
        'CMS editing is not enabled for this page yet',
        ERROR_CODES.RESOURCE_NOT_FOUND
      );
    }

    const doc = await StaticPageContent.findOne({ pageKey });
    if (!doc) {
      const registry = getRegistryEntry(pageKey);
      return sendSuccessResponse(res, HTTP_STATUS.OK, 'Static page fetched', {
        page: null,
        manifest,
        emptyZones: emptyZonesFromManifest(manifest),
        slug: registry?.slug || '',
      });
    }

    return sendSuccessResponse(res, HTTP_STATUS.OK, 'Static page fetched', {
      page: serializePage(doc),
      manifest,
    });
  } catch (error) {
    console.error('Static page admin get error:', error);
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to fetch static page',
      ERROR_CODES.INTERNAL_SERVER_ERROR
    );
  }
};

exports.upsertByPageKey = async (req, res) => {
  try {
    const { pageKey } = req.params;
    if (!isAllowedPageKey(pageKey) || !shouldExposeStaticPageKey(pageKey)) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        'Invalid pageKey',
        ERROR_CODES.VALIDATION_FAILED
      );
    }

    if (!getManifest(pageKey)) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.NOT_FOUND,
        'CMS editing is not enabled for this page yet',
        ERROR_CODES.RESOURCE_NOT_FOUND
      );
    }

    const { status, seo, zones } = req.body || {};
    const validation = validateStaticPagePayload({
      pageKey,
      status,
      seo,
      zones,
    });

    if (!validation.ok) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        validation.message,
        ERROR_CODES.VALIDATION_FAILED,
        validation.details
      );
    }

    const { normalized } = validation;
    let doc = await StaticPageContent.findOne({ pageKey });
    const previousStatus = doc?.status;

    if (!doc) {
      doc = new StaticPageContent({
        pageKey: normalized.pageKey,
        slug: normalized.slug,
      });
    }

    doc.slug = normalized.slug;
    doc.status = normalized.status;
    doc.seo = normalized.seo;
    doc.zones = new Map(Object.entries(normalized.zones));

    if (normalized.status === 'published' && previousStatus !== 'published') {
      doc.publishedAt = new Date();
    } else if (normalized.status === 'published' && !doc.publishedAt) {
      doc.publishedAt = new Date();
    }

    await doc.save();

    return sendSuccessResponse(res, HTTP_STATUS.OK, 'Static page saved', {
      page: serializePage(doc),
    });
  } catch (error) {
    console.error('Static page upsert error:', error);
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to save static page',
      ERROR_CODES.INTERNAL_SERVER_ERROR
    );
  }
};

exports.getPublishedByPageKey = async (req, res) => {
  try {
    const { pageKey, locale } = req.query || {};
    if (!pageKey || !isAllowedPageKey(pageKey) || !shouldExposeStaticPageKey(pageKey)) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        'Valid pageKey is required',
        ERROR_CODES.VALIDATION_REQUIRED_FIELDS
      );
    }

    let doc = await StaticPageContent.findOne({
      pageKey,
      status: 'published',
    }).lean();

    if (!doc) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.NOT_FOUND,
        'Published static page content not found',
        ERROR_CODES.RESOURCE_NOT_FOUND
      );
    }

    doc.zones = zonesMapToObject(doc.zones);

    if (locale && locale !== 'en') {
      doc = await applyTranslations(doc, 'StaticPageContent', locale, ['seo', 'zones']);
    }

    const payload = {
      pageKey: doc.pageKey,
      slug: doc.slug,
      status: doc.status,
      seo: doc.seo || { title: '', metaDescription: '' },
      zones: doc.zones || {},
      publishedAt: doc.publishedAt,
      updatedAt: doc.updatedAt,
    };

    return sendSuccessResponse(res, HTTP_STATUS.OK, 'Static page fetched', { page: payload });
  } catch (error) {
    console.error('Static page public get error:', error);
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Failed to fetch static page',
      ERROR_CODES.INTERNAL_SERVER_ERROR
    );
  }
};
