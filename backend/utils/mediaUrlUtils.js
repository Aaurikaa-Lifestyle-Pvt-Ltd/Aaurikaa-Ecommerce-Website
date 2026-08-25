const { r2Config } = require('../config/r2Config');

const extractKeyFromUrl = (url) => {
  if (!url) return null;
  try {
    const urlObj = new URL(url);
    return urlObj.pathname.replace(/^\/+/, '');
  } catch {
    return null;
  }
};

/** Strip legacy uploads/ prefix; keep R2 object keys like admin/gallery/... */
function normalizeMediaStorageKey(stored) {
  if (!stored || typeof stored !== 'string') return '';
  let clean = stored.trim().replace(/^\/+/, '');
  if (clean.startsWith('uploads/')) {
    const rest = clean.slice('uploads/'.length);
    if (rest.includes('/')) return rest;
  }
  return clean;
}

/**
 * Build public URL from an R2 object key.
 * @param {string} key
 * @returns {string|null}
 */
const publicUrlFromKey = (key) => {
  if (!key || typeof key !== 'string') return null;
  const cleanKey = key.replace(/^\/+/, '');
  const base = (r2Config.publicUrl || process.env.CLOUDFLARE_R2_PUBLIC_URL || '').replace(/\/$/, '');
  if (!base) return null;
  return `${base}/${cleanKey}`;
};

/**
 * Convert a stored value (full URL, R2 key, or legacy path) to an R2 object key for delete.
 * @param {string|null|undefined} stored
 * @returns {string|null}
 */
const toR2DeleteKey = (stored) => {
  if (!stored || typeof stored !== 'string') return null;

  const trimmed = stored.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return extractKeyFromUrl(trimmed);
  }

  return trimmed.replace(/^\/+/, '');
};

function resolveR2PublicUrl(stored) {
  if (!stored || typeof stored !== 'string') return null;

  const trimmed = stored.trim();
  if (!trimmed) return null;

  let key = trimmed;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const mistakenLocal =
      /\/uploads\/admin\/gallery\//i.test(trimmed) ||
      /\/uploads\/media\//i.test(trimmed) ||
      /\/uploads\/products\//i.test(trimmed);
    const isR2Host = /\.r2\.dev\//i.test(trimmed);
    if (!mistakenLocal && isR2Host) return trimmed;
    if (!mistakenLocal && !isR2Host) return null;
    key = toR2DeleteKey(trimmed) || '';
  }

  const normalized = normalizeMediaStorageKey(key);
  if (!normalized.includes('/')) return null;
  return publicUrlFromKey(normalized);
}

/**
 * Resolve a stored image value to a public URL (full https or legacy relative).
 * @param {string|null|undefined} stored
 * @param {string} [apiBase] - API base for legacy relative paths
 * @returns {string|null}
 */
const resolvePublicUrl = (stored, apiBase) => {
  if (!stored || typeof stored !== 'string') return null;

  const trimmed = stored.trim();
  if (!trimmed) return null;

  const r2Url = resolveR2PublicUrl(trimmed);
  if (r2Url) return r2Url;

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  const clean = normalizeMediaStorageKey(trimmed);
  const base = apiBase || process.env.API_BASE_URL || 'http://localhost:5000';

  if (clean.startsWith('uploads/')) {
    return `${base}/${clean}`;
  }

  return `${base}/uploads/${clean}`;
};

module.exports = {
  resolvePublicUrl,
  resolveR2PublicUrl,
  normalizeMediaStorageKey,
  toR2DeleteKey,
  publicUrlFromKey,
};
