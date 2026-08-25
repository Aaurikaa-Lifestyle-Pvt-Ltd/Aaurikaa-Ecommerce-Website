const slugify = require('slugify');

function randomSuffix5() {
  // Matches existing pattern used across models/scripts:
  // Math.random().toString(36).substring(2, 7)
  return Math.random().toString(36).substring(2, 7);
}

function baseSlug(input) {
  const text = String(input || '').trim();
  if (!text) return '';
  return slugify(text, { lower: true, strict: true });
}

/**
 * Build a slug in the same shape as the existing Product/Blog pre-save hooks:
 *   `${slugify(name)}-${random5}`
 */
function buildSlugWithRandomSuffix(input) {
  const base = baseSlug(input);
  if (!base) return '';
  return `${base}-${randomSuffix5()}`;
}

/**
 * Generate a unique slug with random suffix, checking against a provided Set.
 * Does NOT touch the database; caller is responsible for seeding `taken`.
 */
/**
 * Strip the trailing random suffix (`-[a-z0-9]{5}`) from a product slug.
 * Returns the full slug when no suffix pattern is present.
 */
function extractSlugBase(slug) {
  const s = String(slug || '').trim();
  if (!s) return '';
  const match = s.match(/^(.+)-[a-z0-9]{5}$/);
  return match ? match[1] : s;
}

function generateUniqueSlug({ input, taken, maxAttempts = 20 }) {
  const base = baseSlug(input);
  if (!base) return { ok: false, reason: 'missing_input', slug: '' };
  const used = taken instanceof Set ? taken : new Set();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const candidate = `${base}-${randomSuffix5()}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return { ok: true, slug: candidate, attempts: attempt };
    }
  }

  return { ok: false, reason: 'exhausted_attempts', slug: '' };
}

module.exports = {
  baseSlug,
  buildSlugWithRandomSuffix,
  extractSlugBase,
  generateUniqueSlug,
};

