/**
 * Shared search input normalization and regex-safety helpers.
 * Used by the entity resolver, query builder, and global search orchestrator.
 */

/** Minimum character length required for autocomplete / grouped suggestions. */
const MIN_SUGGESTION_TERM_LENGTH = 2;

/** Minimum character length required for storefront product search (`q`). */
const MIN_SEARCH_TERM_LENGTH = 1;

/**
 * Escape regex metacharacters in user-supplied text before use in MongoDB `$regex`.
 *
 * @param {string} value - Raw user or search input.
 * @returns {string} Literal-safe string for regex patterns.
 */
function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Trim and validate a search term; produce an escaped form safe for `$regex`.
 *
 * @param {string|null|undefined} raw - Raw query value (e.g. from `req.query.q`).
 * @returns {{ raw: string, trimmed: string, escaped: string }|null}
 *   Normalized term object, or `null` when input is empty after trim.
 */
function normalizeSearchTerm(raw) {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  return {
    raw: String(raw),
    trimmed,
    escaped: escapeRegex(trimmed),
  };
}

/**
 * Check whether a search term meets a minimum length after normalization.
 *
 * @param {string|null|undefined} term - Raw search input.
 * @param {number} [minLength=MIN_SEARCH_TERM_LENGTH] - Required trimmed length.
 * @returns {boolean} `true` when the normalized term exists and is long enough.
 */
function isSearchTermLongEnough(term, minLength = MIN_SEARCH_TERM_LENGTH) {
  const normalized = normalizeSearchTerm(term);
  return Boolean(normalized && normalized.trimmed.length >= minLength);
}

/**
 * Check whether a term is valid for grouped autocomplete suggestions (min 2 chars).
 *
 * @param {string|null|undefined} term - Raw search input.
 * @returns {boolean} `true` when the term meets `MIN_SUGGESTION_TERM_LENGTH`.
 */
function isSuggestionTermValid(term) {
  return isSearchTermLongEnough(term, MIN_SUGGESTION_TERM_LENGTH);
}

/**
 * Build a case-insensitive MongoDB "contains" regex condition.
 *
 * @param {string} escapedTerm - Pre-escaped search term from {@link escapeRegex}.
 * @returns {{ $regex: string, $options: string }} MongoDB regex filter fragment.
 */
function buildContainsRegex(escapedTerm) {
  return { $regex: escapedTerm, $options: "i" };
}

module.exports = {
  MIN_SUGGESTION_TERM_LENGTH,
  MIN_SEARCH_TERM_LENGTH,
  escapeRegex,
  normalizeSearchTerm,
  isSearchTermLongEnough,
  isSuggestionTermValid,
  buildContainsRegex,
};
