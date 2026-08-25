const mongoose = require("mongoose");
const { baseSlug, extractSlugBase, generateUniqueSlug } = require("./slugUtils");
const {
    assertPrimaryKeywordPlacement,
} = require("./primaryKeywordValidation");

/**
 * Central Publish Guard for Products.
 * Enforces business rules at publish-time without schema rigidity.
 */

const PLACEHOLDER_DRAFT_TITLE = "Untitled Draft";

const PRIMARY_KEYWORD_TAKEN_MESSAGE =
    "This SEO keyword is already used by another product. Please choose a unique keyword.";

/**
 * Uniqueness is no longer required (WS-1 1.8). Stub always reports available
 * so leftover availability clients do not treat duplicates as errors.
 * @param {string} primaryKeyword
 * @param {string|mongoose.Types.ObjectId} productId
 * @returns {Promise<{ available: boolean }>}
 */
async function checkPrimaryKeywordAvailability(primaryKeyword, productId = null) {
    void primaryKeyword;
    void productId;
    return { available: true };
}

/**
 * @deprecated Uniqueness is not enforced. Kept as a no-op for callers.
 */
async function assertUniquePrimaryKeyword(primaryKeyword, productId = null) {
    void primaryKeyword;
    void productId;
}

/**
 * Status that will be persisted: request status, else existing (updates), else create default "published".
 * Matches addProduct `body.status || "published"` and update `$set` that keeps existing status when omitted.
 */
function resolveEffectiveProductStatus(requestedStatus, existingStatus = null) {
    if (requestedStatus) return requestedStatus;
    if (existingStatus) return existingStatus;
    return "published";
}

/**
 * @deprecated AAURIKAA Admin Product lifecycle no longer auto-fills SEO keywords.
 * Kept for callers/tests that import the symbol; always returns false (no mutation).
 * @returns {boolean}
 */
function ensureAdminPrimaryKeywordFromName(productLike) {
    void productLike;
    return false;
}

/**
 * Main publish guard.
 * @param {Object} productLike - Plain object representation of product data
 * @param {string} actor - 'admin', 'seller', or 'system'
 * @param {string|mongoose.Types.ObjectId} productId
 * @param {string|null} existingStatus - Persisted status on update; omit on create
 */
async function assertPublishable(productLike, actor = "system", productId = null, existingStatus = null) {
    void productId;

    const effectiveStatus = resolveEffectiveProductStatus(
        productLike?.status,
        existingStatus
    );

    if (effectiveStatus !== "published") return;

    // AAURIKAA Admin Product lifecycle is catalogue/business only — no SEO keyword
    // required, no T1/D1 placement, no auto-generated keyword. Central SEO stays
    // on /admin/seo; seller/system still enforce full placement.
    if (actor === "admin") return;

    assertPrimaryKeywordPlacement(productLike, {
        requireShortDesc: true,
    });
}

function isDraftToPublishedTransition(previousStatus, newStatus) {
    return previousStatus !== "published" && newStatus === "published";
}

function isPlaceholderTitle(name) {
    const trimmed = String(name || "").trim();
    return !trimmed || trimmed === PLACEHOLDER_DRAFT_TITLE;
}

function isPlaceholderSlug(slug) {
    return extractSlugBase(slug) === "untitled-draft";
}

function shouldRegeneratePublishSlug(name, slug) {
    if (isPlaceholderSlug(slug)) return true;
    const nameBase = baseSlug(name);
    const slugBase = extractSlugBase(slug);
    return nameBase !== slugBase;
}

function assertPublishTitleAndSlug({ name, slug, actor: _actor }) {
    const trimmed = String(name || "").trim();
    if (!trimmed) {
        throw new Error("Product title is required before publishing.");
    }
    if (isPlaceholderTitle(name)) {
        throw new Error("Placeholder title cannot be published. Enter a real product title.");
    }
    if (!slug || isPlaceholderSlug(slug)) {
        throw new Error("Could not generate a valid URL slug. Check the product title.");
    }
}

async function resolvePublishSlug({ name, currentSlug, productId }) {
    const Product = mongoose.model("Product");
    const query = { slug: { $exists: true, $nin: [null, ""] } };
    if (productId) {
        query._id = { $ne: productId };
    }

    const rows = await Product.find(query).select("slug").lean();
    const taken = new Set(rows.map((row) => row.slug).filter(Boolean));

    const gen = generateUniqueSlug({ input: name, taken });
    if (!gen.ok || !gen.slug) {
        throw new Error("Could not generate a valid URL slug. Check the product title.");
    }

    return { slug: gen.slug, regenerated: gen.slug !== currentSlug };
}

/**
 * Publish-time slug validation and resolution for draft → published transitions.
 */
async function enforcePublishSlugOnTransition({
    isDraftToPublished,
    name,
    currentSlug,
    productId,
    actor,
}) {
    if (!isDraftToPublished) {
        return currentSlug;
    }

    const resolvedName = String(name || "").trim();
    let slug = currentSlug;

    if (shouldRegeneratePublishSlug(resolvedName, slug)) {
        const result = await resolvePublishSlug({
            name: resolvedName,
            currentSlug: slug,
            productId,
        });
        slug = result.slug;
    }

    assertPublishTitleAndSlug({ name: resolvedName, slug, actor });
    return slug;
}

module.exports = {
    PLACEHOLDER_DRAFT_TITLE,
    PRIMARY_KEYWORD_TAKEN_MESSAGE,
    resolveEffectiveProductStatus,
    assertPublishable,
    assertUniquePrimaryKeyword,
    checkPrimaryKeywordAvailability,
    assertPublishTitleAndSlug,
    enforcePublishSlugOnTransition,
    isDraftToPublishedTransition,
    isPlaceholderSlug,
    isPlaceholderTitle,
    resolvePublishSlug,
    shouldRegeneratePublishSlug,
    ensureAdminPrimaryKeywordFromName,
};
