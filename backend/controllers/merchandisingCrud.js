const Product = require("../models/Product");
const {
  sendErrorResponse,
  sendSuccessResponse,
  ERROR_CODES,
  HTTP_STATUS,
} = require("../utils/errorHandler");
const {
  MERCH_SORT,
  validateDisplayOrder,
  parseBoolean,
  isHttpUrl,
  resolveProductRefs,
  ensureUniqueSlug,
  getNextDisplayOrder,
  loadAssociatedProducts,
  attachFirstProductSlugs,
} = require("../utils/merchandising");

function pickString(body, key) {
  if (body[key] === undefined) return undefined;
  return String(body[key] ?? "").trim();
}

function createMerchandisingController(spec) {
  const {
    Model,
    label,
    titleKey,
    hasSlug,
    requireTitle = true,
    hasHomeFilter = false,
    stringFields,
    urlFields = [],
    booleanFields,
    extraValidators,
    attachFirstProductSlug = false,
  } = spec;

  async function applyBody(doc, body, { isCreate }) {
    for (const field of stringFields) {
      const value = pickString(body, field);
      if (value !== undefined) doc[field] = value;
    }

    for (const field of urlFields) {
      const value = pickString(body, field);
      if (value === undefined) continue;
      if (value && !isHttpUrl(value) && !value.startsWith("/")) {
        return { error: `${field} must be an http(s) URL or a site-relative path.` };
      }
      doc[field] = value;
    }

    for (const field of booleanFields) {
      if (body[field] === undefined && !isCreate) continue;
      const fallback = isCreate ? false : doc[field];
      doc[field] = parseBoolean(body[field], fallback);
    }

    if (body.displayOrder !== undefined || isCreate) {
      const orderCheck = validateDisplayOrder(body.displayOrder);
      if (!orderCheck.valid) return { error: orderCheck.message };
      doc.displayOrder =
        orderCheck.value !== undefined ? orderCheck.value : await getNextDisplayOrder(Model);
    }

    if (body.productIds !== undefined || body.productSkus !== undefined) {
      const resolved = await resolveProductRefs(body.productIds ?? body.productSkus, Product);
      if (!resolved.ok) return { error: resolved.message };
      doc.productIds = resolved.productIds;
    } else if (isCreate) {
      doc.productIds = [];
    }

    if (hasSlug) {
      const title = pickString(body, titleKey) ?? doc[titleKey];
      const requestedSlug = pickString(body, "slug");
      if (isCreate || requestedSlug !== undefined || body[titleKey] !== undefined) {
        const slugSource = requestedSlug || title || "";
        const unique = await ensureUniqueSlug(Model, slugSource, isCreate ? null : doc._id);
        if (!unique.ok) return { error: unique.message };
        doc.slug = unique.slug;
      }
    }

    if (typeof extraValidators === "function") {
      const extra = extraValidators(doc, body, { isCreate });
      if (extra?.error) return extra;
    }

    return { ok: true };
  }

  async function listAdmin(req, res) {
    const items = await Model.find().sort(MERCH_SORT).lean();
    return sendSuccessResponse(res, HTTP_STATUS.OK, `${label} list retrieved`, { items });
  }

  async function getAdmin(req, res) {
    const item = await Model.findById(req.params.id).lean();
    if (!item) {
      return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, `${label} not found`, ERROR_CODES.RESOURCE_NOT_FOUND);
    }
    const products = await loadAssociatedProducts(Product, item.productIds, { publicOnly: false });
    return sendSuccessResponse(res, HTTP_STATUS.OK, `${label} retrieved`, { item, products });
  }

  async function create(req, res) {
    const title = pickString(req.body, titleKey);
    if (requireTitle && !title) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        `${titleKey} is required`,
        ERROR_CODES.VALIDATION_REQUIRED_FIELDS
      );
    }
    const doc = new Model();
    const applied = await applyBody(doc, req.body, { isCreate: true });
    if (applied.error) {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, applied.error, ERROR_CODES.VALIDATION_FAILED);
    }
    await doc.save();
    return sendSuccessResponse(res, HTTP_STATUS.CREATED, `${label} created`, { item: doc.toObject() });
  }

  async function update(req, res) {
    const doc = await Model.findById(req.params.id);
    if (!doc) {
      return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, `${label} not found`, ERROR_CODES.RESOURCE_NOT_FOUND);
    }
    const applied = await applyBody(doc, req.body, { isCreate: false });
    if (applied.error) {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, applied.error, ERROR_CODES.VALIDATION_FAILED);
    }
    await doc.save();
    return sendSuccessResponse(res, HTTP_STATUS.OK, `${label} updated`, { item: doc.toObject() });
  }

  async function remove(req, res) {
    const doc = await Model.findByIdAndDelete(req.params.id);
    if (!doc) {
      return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, `${label} not found`, ERROR_CODES.RESOURCE_NOT_FOUND);
    }
    return sendSuccessResponse(res, HTTP_STATUS.OK, `${label} deleted`, { id: String(doc._id) });
  }

  async function listPublic(req, res) {
    const filter = { isActive: true };
    if (hasHomeFilter && req.query.home === "true") filter.showOnHome = true;
    let items = await Model.find(filter).sort(MERCH_SORT).lean();
    if (attachFirstProductSlug) {
      items = await attachFirstProductSlugs(Product, items);
    }
    return sendSuccessResponse(res, HTTP_STATUS.OK, `${label} list retrieved`, { items });
  }

  async function getPublicBySlug(req, res) {
    const item = await Model.findOne({ slug: String(req.params.slug || "").toLowerCase(), isActive: true }).lean();
    if (!item) {
      return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, `${label} not found`, ERROR_CODES.RESOURCE_NOT_FOUND);
    }
    const products = await loadAssociatedProducts(Product, item.productIds, { publicOnly: true });
    return sendSuccessResponse(res, HTTP_STATUS.OK, `${label} retrieved`, { item, products });
  }

  return {
    listAdmin,
    getAdmin,
    create,
    update,
    remove,
    listPublic,
    getPublicBySlug,
  };
}

module.exports = { createMerchandisingController };
