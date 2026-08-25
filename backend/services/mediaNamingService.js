const { baseSlug } = require('../utils/slugUtils');
const { isValidMediaCategory } = require('../constants/mediaCategories');
const { publicUrlFromKey } = require('../utils/mediaUrlUtils');
const { checkFileExistsInR2, uploadFileToR2 } = require('./r2UploadService');

const MAX_SLUG_LENGTH = 80;
const MAX_COLLISION_ATTEMPTS = 50;

const normalizeExtension = (extension) => {
  if (!extension || typeof extension !== 'string') return null;
  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  return ext.toLowerCase();
};

const truncateSlug = (slug) => {
  if (!slug || slug.length <= MAX_SLUG_LENGTH) return slug;
  const truncated = slug.slice(0, MAX_SLUG_LENGTH);
  const lastDash = truncated.lastIndexOf('-');
  if (lastDash > MAX_SLUG_LENGTH * 0.6) {
    return truncated.slice(0, lastDash);
  }
  return truncated;
};

const roleSuffixForStem = (role, roleKey, sequenceIndex) => {
  if (!role) return '';

  switch (role) {
    case 'video':
      return '-video';
    case 'profile':
      return '-profile';
    case 'logo':
      return '';
    case 'favicon':
      return '';
    case 'gallery':
      return sequenceIndex != null && sequenceIndex > 0 ? `-${sequenceIndex}` : '';
    case 'variant': {
      const variantPart = roleKey
        ? `-${baseSlug(String(roleKey).replace(/\|/g, '-'))}`
        : '';
      const galleryPart =
        sequenceIndex != null && sequenceIndex > 0 ? `-${sequenceIndex}` : '';
      return `${variantPart}${galleryPart}`;
    }
    case 'document':
      return roleKey ? `-${baseSlug(roleKey)}` : '-document';
    case 'banner-bg':
      return '-banner';
    case 'banner-offer':
      return roleKey != null ? `-offer-${roleKey}` : '-offer';
    case 'slider':
      return '-slider';
    case 'grid-item':
      return roleKey != null ? `-grid-item-${roleKey}` : '-grid-item';
    case 'main':
    default:
      return '';
  }
};

/**
 * Build filename stem (no extension, no collision -n) from naming input.
 */
const buildStem = (input) => {
  const labelSlug = truncateSlug(baseSlug(input.baseLabel) || 'untitled-asset');
  const roleSuffix = roleSuffixForStem(
    input.role,
    input.roleKey,
    input.sequenceIndex
  );

  if (input.role === 'logo') return 'logo';
  if (input.role === 'favicon') return 'favicon';

  return `${labelSlug}${roleSuffix}`;
};

const buildBasename = (stem, extension, collisionSuffix) => {
  const suffix = collisionSuffix != null && collisionSuffix > 0 ? `-${collisionSuffix}` : '';
  return `${stem}${suffix}${extension}`;
};

const yearMonthFromDate = (date) => {
  const d = date instanceof Date ? date : new Date();
  const year = String(d.getUTCFullYear());
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return { year, month };
};

/**
 * Allocate a unique key in R2 for the target basename (HeadObject loop).
 */
const allocateUniqueKey = async (mediaCategory, year, month, stem, extension) => {
  let collisionSuffix = null;

  for (let attempt = 0; attempt < MAX_COLLISION_ATTEMPTS; attempt++) {
    const basename = buildBasename(stem, extension, collisionSuffix);
    const key = `${mediaCategory}/${year}/${month}/${basename}`;
    const existsResult = await checkFileExistsInR2(key);

    if (!existsResult.success) {
      throw new Error(`R2 existence check failed: ${existsResult.error}`);
    }

    if (!existsResult.exists) {
      return { key, basename, collisionSuffix };
    }

    collisionSuffix = collisionSuffix == null ? 1 : collisionSuffix + 1;
  }

  const err = new Error('Unable to allocate unique media key after maximum attempts');
  err.statusCode = 409;
  throw err;
};

/**
 * Generate R2 object key and public URL for a new upload.
 * @param {Object} input - Naming input (see plan contract)
 * @returns {Promise<{ key, publicUrl, basename, baseSlug, collisionSuffix }>}
 */
const generateMediaKey = async (input) => {
  const mediaCategory = input.mediaCategory;
  if (!isValidMediaCategory(mediaCategory)) {
    throw new Error(`Invalid mediaCategory: ${mediaCategory}`);
  }

  const extension = normalizeExtension(input.extension);
  if (!extension) {
    throw new Error('Extension is required for media key generation');
  }

  const { year, month } = yearMonthFromDate(input.uploadedAt || new Date());
  const stem = buildStem(input);
  const baseSlugValue = truncateSlug(baseSlug(input.baseLabel) || 'untitled-asset');

  const { key, basename, collisionSuffix } = await allocateUniqueKey(
    mediaCategory,
    year,
    month,
    stem,
    extension
  );

  const publicUrl = publicUrlFromKey(key);
  if (!publicUrl) {
    throw new Error('CLOUDFLARE_R2_PUBLIC_URL is not configured');
  }

  return {
    key,
    publicUrl,
    basename,
    baseSlug: baseSlugValue,
    collisionSuffix,
  };
};

/**
 * Upload buffer with collision-safe PutObject (If-None-Match + retry).
 */
const uploadWithNaming = async (fileBuffer, namingInput, contentType) => {
  let collisionSuffix = null;
  const mediaCategory = namingInput.mediaCategory;
  const extension = normalizeExtension(namingInput.extension);
  const { year, month } = yearMonthFromDate(namingInput.uploadedAt || new Date());
  const stem = buildStem(namingInput);

  for (let attempt = 0; attempt < MAX_COLLISION_ATTEMPTS; attempt++) {
    const basename = buildBasename(stem, extension, collisionSuffix);
    const key = `${mediaCategory}/${year}/${month}/${basename}`;
    const result = await uploadFileToR2(fileBuffer, key, contentType, {
      ifNoneMatch: true,
    });

    if (result.success) {
      return {
        key: result.key,
        publicUrl: result.publicUrl,
        basename,
        baseSlug: truncateSlug(baseSlug(namingInput.baseLabel) || 'untitled-asset'),
        collisionSuffix,
      };
    }

    if (result.preconditionFailed) {
      collisionSuffix = collisionSuffix == null ? 1 : collisionSuffix + 1;
      continue;
    }

    throw new Error(result.error || 'R2 upload failed');
  }

  const err = new Error('Unable to upload media after maximum collision retries');
  err.statusCode = 409;
  throw err;
};

module.exports = {
  generateMediaKey,
  uploadWithNaming,
  buildStem,
  buildBasename,
  truncateSlug,
  MAX_COLLISION_ATTEMPTS,
};
