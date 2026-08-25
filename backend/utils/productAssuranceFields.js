/**
 * WS-3 / 1.4 — Product Assurance structured fields.
 * Additive Product fields: genuineProduct, warranty, manufacturerConditions.
 * Flat form aliases are accepted and normalized into the structured schema.
 */

const { resolveProductReturnPolicy } = require("./returnPolicyResolver");

const WARRANTY_DURATION_MAX = 120;
const WARRANTY_COVERAGE_MAX = 500;
const WARRANTY_TERMS_MAX = 4000;
const MANUFACTURER_SUMMARY_MAX = 500;
const MANUFACTURER_DETAILS_MAX = 100000;
const MANUFACTURER_COUNTRY_MAX = 500;
const MANUFACTURER_MARKETED_BY_MAX = 500;
const MANUFACTURER_GRIEVANCE_MAX = 4000;

const FLAT_ASSURANCE_KEYS = [
  "warrantyAvailable",
  "warrantyDuration",
  "warrantyCoverage",
  "warrantyTerms",
  "manufacturerSummary",
  "manufacturerDetails",
  "manufacturerCountryOfOrigin",
  "manufacturerMarketedBy",
  "manufacturerGrievanceRedressal",
  "countryOfOrigin",
  "marketedBy",
  "grievanceRedressal",
];

function parseOptionalBoolean(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  return null;
}

function parseObjectOrJson(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      return null;
    }
  }
  return null;
}

function clipString(value, max) {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, max);
}

function hasOwn(body, key) {
  return body != null && Object.prototype.hasOwnProperty.call(body, key);
}

function bodyHasWarrantyInput(body = {}) {
  return (
    hasOwn(body, "warranty") ||
    hasOwn(body, "warrantyAvailable") ||
    hasOwn(body, "warrantyDuration") ||
    hasOwn(body, "warrantyCoverage") ||
    hasOwn(body, "warrantyTerms")
  );
}

function bodyHasManufacturerInput(body = {}) {
  return (
    hasOwn(body, "manufacturerConditions") ||
    hasOwn(body, "manufacturerSummary") ||
    hasOwn(body, "manufacturerDetails") ||
    hasOwn(body, "manufacturerCountryOfOrigin") ||
    hasOwn(body, "manufacturerMarketedBy") ||
    hasOwn(body, "manufacturerGrievanceRedressal") ||
    hasOwn(body, "countryOfOrigin") ||
    hasOwn(body, "marketedBy") ||
    hasOwn(body, "grievanceRedressal")
  );
}

function normalizeWarranty(body = {}) {
  const nested = parseObjectOrJson(body.warranty) || {};
  const availableRaw =
    nested.available !== undefined ? nested.available : body.warrantyAvailable;
  const available = parseOptionalBoolean(availableRaw) === true;
  return {
    available,
    duration: clipString(nested.duration ?? body.warrantyDuration, WARRANTY_DURATION_MAX),
    coverage: clipString(nested.coverage ?? body.warrantyCoverage, WARRANTY_COVERAGE_MAX),
    terms: clipString(nested.terms ?? body.warrantyTerms, WARRANTY_TERMS_MAX),
  };
}

function normalizeManufacturerConditions(body = {}) {
  const nested = parseObjectOrJson(body.manufacturerConditions) || {};
  return {
    summary: clipString(nested.summary ?? body.manufacturerSummary, MANUFACTURER_SUMMARY_MAX),
    details: clipString(nested.details ?? body.manufacturerDetails, MANUFACTURER_DETAILS_MAX),
    countryOfOrigin: clipString(
      nested.countryOfOrigin ?? body.manufacturerCountryOfOrigin ?? body.countryOfOrigin,
      MANUFACTURER_COUNTRY_MAX
    ),
    marketedBy: clipString(
      nested.marketedBy ?? body.manufacturerMarketedBy ?? body.marketedBy,
      MANUFACTURER_MARKETED_BY_MAX
    ),
    grievanceRedressal: clipString(
      nested.grievanceRedressal ??
        body.manufacturerGrievanceRedressal ??
        body.grievanceRedressal,
      MANUFACTURER_GRIEVANCE_MAX
    ),
  };
}

/**
 * Pick only assurance fields that were actually submitted.
 * Missing keys are omitted so updates/autosave do not wipe existing data.
 */
function pickAssuranceWriteFields(body = {}) {
  const out = {};
  if (hasOwn(body, "genuineProduct")) {
    out.genuineProduct = parseOptionalBoolean(body.genuineProduct) === true;
  }
  if (bodyHasWarrantyInput(body)) {
    out.warranty = normalizeWarranty(body);
  }
  if (bodyHasManufacturerInput(body)) {
    out.manufacturerConditions = normalizeManufacturerConditions(body);
  }
  return out;
}

function stripFlatAssuranceAliases(payload = {}) {
  FLAT_ASSURANCE_KEYS.forEach((key) => {
    delete payload[key];
  });
  return payload;
}

function assignAssuranceFields(target, body) {
  const fields = pickAssuranceWriteFields(body || {});
  Object.assign(target, fields);
  stripFlatAssuranceAliases(target);
  return fields;
}

/**
 * Additive public PDP fields: resolved return policy for display.
 * Does not remove existing product/seller fields.
 */
function attachPublicProductAssurance(product) {
  if (!product || typeof product !== "object") return product;
  const seller = product.seller || product.sellerShop;
  product.effectiveReturnPolicy = resolveProductReturnPolicy({ product, seller });
  return product;
}

/**
 * Attach read-only occasions [{ name, slug }] from active Occasion docs
 * whose productIds contain this product. Empty array when none / invalid.
 * OccasionModel is injectable for unit tests.
 */
async function attachProductOccasions(product, OccasionModel) {
  if (!product || typeof product !== "object") return product;
  product.occasions = [];
  const productId = product._id;
  if (!productId) return product;

  const Model = OccasionModel || require("../models/Occasion");
  const docs = await Model.find({
    isActive: true,
    productIds: productId,
  })
    .select("name slug")
    .sort({ displayOrder: 1, name: 1 })
    .lean();

  product.occasions = (docs || [])
    .filter((d) => d && (d.name || d.slug))
    .map((d) => ({
      name: d.name || "",
      slug: d.slug || "",
    }));
  return product;
}

module.exports = {
  pickAssuranceWriteFields,
  assignAssuranceFields,
  stripFlatAssuranceAliases,
  attachPublicProductAssurance,
  attachProductOccasions,
  normalizeWarranty,
  normalizeManufacturerConditions,
  FLAT_ASSURANCE_KEYS,
};
