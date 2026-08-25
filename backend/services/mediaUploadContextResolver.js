const path = require('path');
const { baseSlug } = require('../utils/slugUtils');
const Product = require('../models/Product');

const SELLER_DOC_ROLE_KEYS = {
  aadhaarFront: 'aadhaar-front',
  aadhaarBack: 'aadhaar-back',
  tradeLicense: 'trade-license',
  panCard: 'pan-card',
  gst: 'gst',
  otherDocs: 'other-doc',
};

const UPLOAD_KIND_TO_CATEGORY = {
  product: 'products',
  category: 'categories',
  brand: 'brands',
  blog: 'blogs',
  banner: 'banners',
  slider: 'banners',
  grid: 'banners',
  'seller-doc': 'sellers',
  profile: 'media',
  'admin-profile': 'media',
  site: 'site',
  'media-library': 'media',
};

const trimStr = (value) => (typeof value === 'string' ? value.trim() : '');

const sanitizeOriginalName = (originalname) => {
  const base = path.basename(originalname || 'untitled-asset');
  const withoutExt = base.replace(/\.[^/.]+$/, '');
  return baseSlug(withoutExt) || 'untitled-asset';
};

const parseVariantField = (fieldname) => {
  if (!fieldname || !fieldname.startsWith('variantMedia-')) {
    return null;
  }
  const rest = fieldname.slice('variantMedia-'.length);
  const lastDash = rest.lastIndexOf('-');
  if (lastDash <= 0) return null;

  const variantKey = rest.slice(0, lastDash);
  const field = rest.slice(lastDash + 1);
  return { variantKey, field };
};

const resolveProductBaseLabel = async (req) => {
  const fromBody = trimStr(req.body?.name);
  if (fromBody) return fromBody;

  const productId = req.params?.id;
  if (!productId) return '';

  if (!req._namingContextCache) {
    req._namingContextCache = {};
  }
  if (req._namingContextCache.productName !== undefined) {
    return req._namingContextCache.productName;
  }

  try {
    const product = await Product.findById(productId).select('name').lean();
    const name = trimStr(product?.name) || '';
    if (!name) {
      console.warn(
        '[mediaUploadContextResolver] Product name fallback empty for id=%s',
        productId
      );
    } else {
      console.warn(
        '[mediaUploadContextResolver] Product name loaded from DB fallback for id=%s',
        productId
      );
    }
    req._namingContextCache.productName = name;
    return name;
  } catch (err) {
    console.warn('[mediaUploadContextResolver] Product name lookup failed:', err.message);
    req._namingContextCache.productName = '';
    return '';
  }
};

const resolveBaseLabel = async (req, uploadKind, file, options = {}) => {
  const body = req.body || {};

  switch (uploadKind) {
    case 'product': {
      const name = await resolveProductBaseLabel(req);
      if (name) return name;
      console.warn('[mediaUploadContextResolver] product upload missing name; using timestamp fallback');
      return `product-${Date.now()}`;
    }
    case 'category':
      return trimStr(body.name) || 'category';
    case 'brand':
      return trimStr(body.name) || 'brand';
    case 'blog':
      return trimStr(body.title) || 'blog-post';
    case 'banner':
      return (
        trimStr(body.campaignTitle) ||
        trimStr(body.title) ||
        'homepage-banner'
      );
    case 'slider':
      return trimStr(body.heading) || 'slider';
    case 'grid': {
      const match = (file?.fieldname || '').match(/^item_image_(\d+)$/);
      const index = match ? match[1] : options.gridIndex;
      const caption = index != null ? trimStr(body[`item_caption_${index}`]) : '';
      return caption || (index != null ? `grid-item-${index}` : 'grid-item');
    }
    case 'seller-doc': {
      const shop = trimStr(body.shopName);
      if (shop) return shop;
      const first = trimStr(body.firstName);
      const last = trimStr(body.lastName);
      if (first || last) return `${first} ${last}`.trim();
      const userId = req.user?._id?.toString() || '';
      return userId ? `seller-${userId.slice(-6)}` : 'seller';
    }
    case 'profile':
      return (
        trimStr(body.name) ||
        trimStr(body.email) ||
        trimStr(req.user?.name) ||
        trimStr(req.user?.email) ||
        'user'
      );
    case 'admin-profile':
      return trimStr(body.name) || trimStr(req.user?.name) || 'admin';
    case 'site':
      return file?.fieldname === 'favicon' ? 'favicon' : 'logo';
    case 'media-library':
      return (
        trimStr(body.display_name) ||
        sanitizeOriginalName(file?.originalname)
      );
    default:
      return sanitizeOriginalName(file?.originalname);
  }
};

const resolveProductRole = (fieldname, options = {}) => {
  const variant = parseVariantField(fieldname);
  if (variant) {
    const isVideo = variant.field === 'video';
    const isGallery =
      variant.field === 'galleryImages' ||
      (variant.field && variant.field.startsWith('gallery'));
    return {
      role: isVideo ? 'video' : 'variant',
      roleKey: variant.variantKey,
      sequenceIndex: isGallery ? options.galleryIndex : undefined,
    };
  }

  if (fieldname === 'mainImage') return { role: 'main' };
  if (fieldname === 'galleryImages') {
    return { role: 'gallery', sequenceIndex: options.galleryIndex };
  }
  if (fieldname === 'video') return { role: 'video' };
  return { role: 'main' };
};

const resolveBannerRole = (fieldname) => {
  if (fieldname === 'backgroundImage') return { role: 'banner-bg' };
  const offerMatch = fieldname?.match(/^offer_image_(\d+)$/);
  if (offerMatch) {
    return { role: 'banner-offer', roleKey: offerMatch[1] };
  }
  return { role: 'banner-bg' };
};

const resolveSellerDocRole = (fieldname) => {
  if (fieldname === 'shopImage') return { role: undefined };
  if (fieldname === 'profileImage') return { role: 'profile' };
  const roleKey = SELLER_DOC_ROLE_KEYS[fieldname];
  if (roleKey) return { role: 'document', roleKey };
  return { role: 'document', roleKey: baseSlug(fieldname) };
};

/**
 * Resolve naming input for generateMediaKey / uploadWithNaming.
 * @param {Object} req
 * @param {Object} file - Multer file
 * @param {Object} options - { uploadKind, extension, galleryIndex, gridIndex }
 */
const resolveUploadContext = async (req, file, options = {}) => {
  const uploadKind = options.uploadKind || req._mediaUploadKind || 'product';
  const mediaCategory =
    options.mediaCategory || UPLOAD_KIND_TO_CATEGORY[uploadKind] || 'media';

  const baseLabel = await resolveBaseLabel(req, uploadKind, file, options);
  const fieldname = file?.fieldname || options.fieldName || '';

  let roleMeta = {};
  if (uploadKind === 'product') {
    roleMeta = resolveProductRole(fieldname, options);
  } else if (uploadKind === 'banner') {
    roleMeta = resolveBannerRole(fieldname);
  } else if (uploadKind === 'slider') {
    roleMeta = { role: 'slider' };
  } else if (uploadKind === 'grid') {
    const match = fieldname.match(/^item_image_(\d+)$/);
    roleMeta = { role: 'grid-item', roleKey: match ? match[1] : options.gridIndex };
  } else if (uploadKind === 'seller-doc') {
    roleMeta = resolveSellerDocRole(fieldname);
  } else if (uploadKind === 'profile' || uploadKind === 'admin-profile') {
    roleMeta = { role: 'profile' };
  } else if (uploadKind === 'site') {
    roleMeta = {
      role: fieldname === 'favicon' ? 'favicon' : 'logo',
    };
  }

  return {
    mediaCategory,
    baseLabel,
    extension: options.extension,
    ...roleMeta,
    uploadedAt: options.uploadedAt,
  };
};

module.exports = {
  resolveUploadContext,
  UPLOAD_KIND_TO_CATEGORY,
  SELLER_DOC_ROLE_KEYS,
};
