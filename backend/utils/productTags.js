/**
 * Canonical Product.tags normalization for writes.
 * Splits comma-separated entries, flattens arrays, dedupes case-insensitively.
 */

function normalizeProductTagsForWrite(raw) {
  if (raw === undefined || raw === null) {
    return [];
  }

  if (raw === "") {
    return [];
  }

  const items = Array.isArray(raw) ? raw : [raw];
  const parts = [];

  for (const item of items) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (trimmed.includes(",")) {
      parts.push(
        ...trimmed
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      );
    } else {
      parts.push(trimmed);
    }
  }

  const seen = new Set();
  const unique = [];
  for (const tag of parts) {
    const key = tag.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(tag);
    }
  }

  return unique;
}

/** True when multipart/JSON body explicitly included a tags field (including empty clear). */
function hasTagsField(body) {
  if (!body || typeof body !== "object") return false;
  return Object.prototype.hasOwnProperty.call(body, "tags");
}

module.exports = {
  normalizeProductTagsForWrite,
  hasTagsField,
};
