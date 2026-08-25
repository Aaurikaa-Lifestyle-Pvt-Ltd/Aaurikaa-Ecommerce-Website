const { extractPlainText } = require("./richText/richTextSanitizeUtils");

/**
 * Phase 1 / 1.8 mapping (Phase 0 options T1 + D1):
 * - Product title (`name`) must start with the primary keyword.
 * - Approved description field is `shortDesc` (Short Description / PDP Product Overview).
 * Case-insensitive; whitespace collapsed. Rich text stripped via extractPlainText.
 */

const KEYWORD_REQUIRED_MESSAGE =
  "Primary SEO keyword is required before publishing a product.";
const KEYWORD_TITLE_MESSAGE =
  "Primary SEO keyword must appear at the start of the product title.";
const KEYWORD_DESCRIPTION_MESSAGE =
  "Primary SEO keyword must appear in the short description.";

function normalizeKeywordText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function resolvePrimaryKeyword(productLike) {
  const raw =
    productLike?.seo?.primaryKeyword ||
    productLike?.["seo.primaryKeyword"] ||
    productLike?.primaryKeyword;
  return String(raw || "").trim();
}

function titleStartsWithKeyword(name, keyword) {
  const title = normalizeKeywordText(name);
  const key = normalizeKeywordText(keyword);
  if (!key) return false;
  return title.startsWith(key);
}

function descriptionContainsKeyword(shortDesc, keyword) {
  const plain = normalizeKeywordText(extractPlainText(shortDesc));
  const key = normalizeKeywordText(keyword);
  if (!key) return false;
  return plain.includes(key);
}

/**
 * Throws if publish-time 1.8 presence rules fail.
 * @param {Object} productLike
 * @param {{ requireShortDesc?: boolean }} [options]
 *   requireShortDesc defaults true (seller / system). Admin Product form omits
 *   shortDesc — pass false so only keyword-required + T1 (title) are enforced.
 */
function assertPrimaryKeywordPlacement(productLike, options = {}) {
  const requireShortDesc = options.requireShortDesc !== false;

  const keyword = resolvePrimaryKeyword(productLike);
  if (!keyword) {
    throw new Error(KEYWORD_REQUIRED_MESSAGE);
  }

  const name = productLike?.name;
  if (!titleStartsWithKeyword(name, keyword)) {
    throw new Error(KEYWORD_TITLE_MESSAGE);
  }

  if (!requireShortDesc) return;

  const shortDesc = productLike?.shortDesc;
  if (!descriptionContainsKeyword(shortDesc, keyword)) {
    throw new Error(KEYWORD_DESCRIPTION_MESSAGE);
  }
}

function mergePrimaryKeywordIntoSeo(updateData) {
  if (!updateData || typeof updateData !== "object") return;

  const hasFlat = Object.prototype.hasOwnProperty.call(updateData, "primaryKeyword");
  const hasDotted = Object.prototype.hasOwnProperty.call(
    updateData,
    "seo.primaryKeyword"
  );
  const hasSeoObj =
    updateData.seo != null && typeof updateData.seo === "object";

  if (!hasFlat && !hasDotted && !hasSeoObj) return;

  const keyword = String(
    (hasFlat ? updateData.primaryKeyword : undefined) ??
      (hasDotted ? updateData["seo.primaryKeyword"] : undefined) ??
      (hasSeoObj ? updateData.seo.primaryKeyword : undefined) ??
      ""
  ).trim();

  updateData.seo = {
    ...(hasSeoObj ? updateData.seo : {}),
    ...(keyword ? { primaryKeyword: keyword } : { primaryKeyword: "" }),
  };
  delete updateData.primaryKeyword;
  delete updateData["seo.primaryKeyword"];
}

module.exports = {
  KEYWORD_REQUIRED_MESSAGE,
  KEYWORD_TITLE_MESSAGE,
  KEYWORD_DESCRIPTION_MESSAGE,
  normalizeKeywordText,
  resolvePrimaryKeyword,
  titleStartsWithKeyword,
  descriptionContainsKeyword,
  assertPrimaryKeywordPlacement,
  mergePrimaryKeywordIntoSeo,
};
