const mongoose = require("mongoose");
const { baseSlug } = require("./slugUtils");

const MERCH_SORT = Object.freeze({ displayOrder: 1, createdAt: -1, _id: 1 });

const PUBLIC_PRODUCT_FILTER = Object.freeze({
  status: "published",
  approvalStatus: "approved",
});

const PRODUCT_CARD_FIELDS =
  "name slug sku mainImage galleryImages regularPrice salePrice stock status approvalStatus shortDesc isFeatured";

function validateDisplayOrder(value) {
  if (value === undefined || value === null || value === "") {
    return { valid: true, value: undefined };
  }
  const order = Number(value);
  if (!Number.isInteger(order)) {
    return { valid: false, message: "displayOrder must be an integer." };
  }
  if (order < 0) {
    return { valid: false, message: "displayOrder must be 0 or greater." };
  }
  return { valid: true, value: order };
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function isHttpUrl(value) {
  if (!value) return true;
  try {
    const parsed = new URL(String(value).trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function parseRefList(raw) {
  if (raw == null || raw === "") return [];
  if (Array.isArray(raw)) {
    return raw
      .flatMap((item) => parseRefList(item))
      .filter(Boolean);
  }
  return String(raw)
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isObjectIdString(value) {
  return mongoose.Types.ObjectId.isValid(value) && String(new mongoose.Types.ObjectId(value)) === value;
}

/**
 * Resolve mixed Product ObjectIds and SKUs. Empty input is allowed (catalogue not loaded yet).
 */
async function resolveProductRefs(raw, Product) {
  const refs = parseRefList(raw);
  if (refs.length === 0) {
    return { ok: true, productIds: [] };
  }

  const ids = [];
  const skus = [];
  for (const ref of refs) {
    if (isObjectIdString(ref)) ids.push(ref);
    else skus.push(ref);
  }

  const found = [];
  if (ids.length) {
    const byId = await Product.find({ _id: { $in: ids } }).select("_id").lean();
    const foundSet = new Set(byId.map((doc) => String(doc._id)));
    const missing = ids.filter((id) => !foundSet.has(id));
    if (missing.length) {
      return { ok: false, message: `Unknown product id(s): ${missing.join(", ")}` };
    }
    for (const id of ids) found.push(id);
  }

  if (skus.length) {
    const bySku = await Product.find({ sku: { $in: skus } }).select("_id sku").lean();
    const skuMap = new Map(bySku.map((doc) => [doc.sku, String(doc._id)]));
    const missing = skus.filter((sku) => !skuMap.has(sku));
    if (missing.length) {
      return { ok: false, message: `Unknown product sku(s): ${missing.join(", ")}` };
    }
    for (const sku of skus) found.push(skuMap.get(sku));
  }

  const unique = [];
  const seen = new Set();
  for (const id of found) {
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  return { ok: true, productIds: unique };
}

async function ensureUniqueSlug(Model, input, excludeId) {
  const base = baseSlug(input);
  if (!base) return { ok: false, message: "A slug could not be generated." };
  let candidate = base;
  let n = 1;
  const filter = excludeId ? { slug: candidate, _id: { $ne: excludeId } } : { slug: candidate };
  while (await Model.exists({ ...filter, slug: candidate })) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return { ok: true, slug: candidate };
}

async function getNextDisplayOrder(Model) {
  const result = await Model.findOne().sort({ displayOrder: -1 }).select("displayOrder").lean();
  const max = result?.displayOrder;
  return (max ?? -1) + 1;
}

function orderProducts(products, productIds) {
  const byId = new Map(products.map((product) => [String(product._id), product]));
  return productIds.map((id) => byId.get(String(id))).filter(Boolean);
}

async function loadAssociatedProducts(Product, productIds, { publicOnly }) {
  if (!productIds?.length) return [];
  const filter = { _id: { $in: productIds } };
  if (publicOnly) Object.assign(filter, PUBLIC_PRODUCT_FILTER);
  const products = await Product.find(filter).select(PRODUCT_CARD_FIELDS).lean();
  return orderProducts(products, productIds);
}

async function attachFirstProductSlugs(Product, items) {
  const ids = items.flatMap((item) => (item.productIds || []).slice(0, 1).map(String));
  if (!ids.length) return items;
  const products = await Product.find({
    _id: { $in: ids },
    ...PUBLIC_PRODUCT_FILTER,
  })
    .select("slug")
    .lean();
  const slugById = new Map(products.map((product) => [String(product._id), product.slug]));
  return items.map((item) => {
    const first = item.productIds?.[0];
    return { ...item, productSlug: first ? slugById.get(String(first)) || "" : "" };
  });
}

module.exports = {
  MERCH_SORT,
  PUBLIC_PRODUCT_FILTER,
  PRODUCT_CARD_FIELDS,
  validateDisplayOrder,
  parseBoolean,
  isHttpUrl,
  parseRefList,
  isObjectIdString,
  resolveProductRefs,
  ensureUniqueSlug,
  getNextDisplayOrder,
  orderProducts,
  loadAssociatedProducts,
  attachFirstProductSlugs,
};
