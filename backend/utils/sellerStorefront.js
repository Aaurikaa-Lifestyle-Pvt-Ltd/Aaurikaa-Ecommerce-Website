const Seller = require('../models/Seller');

const PUBLIC_SELLER_POPULATE_FIELDS =
  'shopName shopImage profileImage shopUrl avgRating reviewCount isApproved returnAllowed returnWindowDays returnConditions';

function safeDecode(value) {
  if (value == null || typeof value !== 'string') return '';
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

/**
 * Normalize route param, stored shopUrl, or legacy full URL into canonical storefront identifiers.
 * @param {string} raw
 * @returns {{ canonicalSlug: string, canonicalStorefrontPath: string } | null}
 */
function normalizeStorefrontInput(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;

  s = safeDecode(s);
  s = s.toLowerCase();
  s = s.replace(/^https?:\/\//, '');
  s = s.replace(/^www\./, '');
  s = s.replace(/\/+/g, '/');

  const sellerPathMatch = s.match(/\/seller\/([^/?#]+)/);
  if (sellerPathMatch) {
    s = sellerPathMatch[1];
  } else if (s.includes('/') || s.includes('?') || s.includes('#')) {
    try {
      const withProto = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`;
      const u = new URL(withProto);
      const segments = u.pathname.split('/').filter(Boolean);
      if (segments.length > 0) {
        s = segments[segments.length - 1];
      } else {
        s = u.hostname.replace(/^www\./, '').split('.')[0] || s;
      }
    } catch {
      const segments = s.split('/').filter(Boolean);
      if (segments.length > 0) {
        s = segments[segments.length - 1];
      }
    }
  }

  s = s.split('?')[0].split('#')[0];
  s = s.replace(/^\/+|\/+$/g, '');
  s = s.replace(/\s+/g, '-').replace(/_/g, '-');
  s = s.replace(/[^a-z0-9-]/g, '');
  s = s.replace(/-+/g, '-').replace(/^-+|-+$/g, '');

  if (!s) return null;

  return {
    canonicalSlug: s,
    canonicalStorefrontPath: `/seller/${s}`,
  };
}

/**
 * @param {object|null|undefined} sellerObj
 * @returns {object|null|undefined}
 */
function attachCanonicalToSellerObject(sellerObj) {
  if (!sellerObj || typeof sellerObj !== 'object') return sellerObj;
  const normalized = normalizeStorefrontInput(sellerObj.shopUrl);
  if (normalized) {
    sellerObj.canonicalSlug = normalized.canonicalSlug;
    sellerObj.canonicalStorefrontPath = normalized.canonicalStorefrontPath;
  }
  return sellerObj;
}

/**
 * @param {object} seller - Mongoose lean document or similar
 * @returns {object}
 */
function toPublicShopProfile(seller) {
  const normalized = normalizeStorefrontInput(seller?.shopUrl);
  return {
    shopName: seller?.shopName || 'Shop',
    shopImage: seller?.shopImage || seller?.profileImage || null,
    avgRating: seller?.avgRating || 0,
    reviewCount: seller?.reviewCount || 0,
    canonicalSlug: normalized?.canonicalSlug ?? null,
    canonicalStorefrontPath: normalized?.canonicalStorefrontPath ?? null,
  };
}

/**
 * Build MongoDB $or conditions to resolve legacy shopUrl storage formats.
 * @param {string} rawParam
 * @param {{ canonicalSlug: string }} normalized
 */
function buildSellerLookupConditions(rawParam, normalized) {
  const { canonicalSlug } = normalized;
  const escaped = canonicalSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const conditions = [
    { shopUrl: canonicalSlug },
    { shopUrl: new RegExp(`^${escaped}$`, 'i') },
    { shopUrl: new RegExp(`/seller/${escaped}(/|$|\\?|#)`, 'i') },
    { shopUrl: new RegExp(`${escaped}$`, 'i') },
  ];

  const raw = String(rawParam || '').trim();
  if (raw && raw.toLowerCase() !== canonicalSlug) {
    const rawEscaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    conditions.push({ shopUrl: raw });
    conditions.push({ shopUrl: new RegExp(`^${rawEscaped}$`, 'i') });
  }

  return conditions;
}

/**
 * @param {string} rawParam
 * @returns {Promise<object|null>}
 */
async function findSellerByStorefrontParam(rawParam) {
  const normalized = normalizeStorefrontInput(rawParam);
  if (!normalized) return null;

  const seller = await Seller.findOne({
    isApproved: true,
    $or: buildSellerLookupConditions(rawParam, normalized),
  })
    .select('_id shopName shopUrl shopImage profileImage avgRating reviewCount')
    .lean();

  return seller;
}

/**
 * @param {object} product - Lean product with populated seller / sellerShop
 */
function attachPublicSellerFieldsToProduct(product) {
  if (!product || typeof product !== 'object') return product;
  if (product.seller) attachCanonicalToSellerObject(product.seller);
  if (product.sellerShop) attachCanonicalToSellerObject(product.sellerShop);
  return product;
}

module.exports = {
  normalizeStorefrontInput,
  attachCanonicalToSellerObject,
  toPublicShopProfile,
  findSellerByStorefrontParam,
  attachPublicSellerFieldsToProduct,
  PUBLIC_SELLER_POPULATE_FIELDS,
};
