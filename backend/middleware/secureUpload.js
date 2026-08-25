// backend/middleware/secureUpload.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { uploadFileToR2, generateSecureFilename, getPublicUrl } = require('../services/r2UploadService');
const { resolveUploadContext } = require('../services/mediaUploadContextResolver');
const { uploadWithNaming } = require('../services/mediaNamingService');

const isMediaNamingV2 = () => process.env.MEDIA_NAMING_V2 === 'true';

// Allowed file types and their MIME types
const ALLOWED_FILE_TYPES = {
  images: {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/svg+xml': '.svg',
    'image/x-icon': '.ico'
  },
  blogs: {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp'
  },
  documents: {
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'text/csv': '.csv'
  },
  videos: {
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/ogg': '.ogv'
  },
  // Specific categories for different upload types
  brands: {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp'
  },
  products: {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif'
  },
  categories: {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp'
  },
  banners: {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp'
  },
  profiles: {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp'
  },
  sellers: {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'application/pdf': '.pdf'
  },
  admins: {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp'
  }
};

// File size limits (in bytes) - configurable per upload type
const FILE_SIZE_LIMITS = {
  images: 5 * 1024 * 1024, // 5MB
  blogs: 500 * 1024, // 500KB (Strict SEO Limit)
  documents: 10 * 1024 * 1024, // 10MB
  videos: 50 * 1024 * 1024, // 50MB
  // Specific limits for different upload types
  brands: 2 * 1024 * 1024, // 2MB for brand logos
  products: 5 * 1024 * 1024, // 5MB for product images
  categories: 2 * 1024 * 1024, // 2MB for category images
  banners: 3 * 1024 * 1024, // 3MB for banners
  profiles: 2 * 1024 * 1024, // 2MB for profile images
  sellers: 5 * 1024 * 1024, // 5MB for seller documents
  admins: 2 * 1024 * 1024, // 2MB for admin profile images
  default: 5 * 1024 * 1024 // 5MB default
};

/**
 * Generate secure filename (legacy function - now uses R2 service)
 * @param {string} originalname - Original filename
 * @param {string} extension - File extension
 * @returns {string} - Secure filename
 */
const generateSecureFilenameLegacy = (originalname, extension) => {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(16).toString('hex');

  // Handle undefined or null originalname
  if (!originalname) {
    return `${timestamp}_${randomString}_file${extension}`;
  }

  // Remove extension from originalname if it exists
  const nameWithoutExt = originalname.replace(/\.[^/.]+$/, '');
  const sanitizedName = nameWithoutExt.replace(/[^a-zA-Z0-9.-]/g, '_');

  return `${timestamp}_${randomString}_${sanitizedName}${extension}`;
};

/**
 * Validate file content by checking file headers
 * @param {Buffer} buffer - File buffer
 * @param {string} mimetype - Expected MIME type
 * @returns {boolean} - Whether file content matches expected type
 */
const validateFileContent = (buffer, mimetype) => {
  if (!buffer || buffer.length < 2) return false;

  // Special handling for JPEG files (both image/jpeg and image/jpg)
  // JPEG files must start with FF D8, but the third byte can vary
  if (mimetype === 'image/jpeg' || mimetype === 'image/jpg') {
    if (buffer.length < 2) return false;
    // Check for JPEG signature: FF D8
    return buffer[0] === 0xFF && buffer[1] === 0xD8;
  }

  // Special handling for MP4 files - look for "ftyp" box in first 20 bytes
  // MP4 files have a box structure, and the "ftyp" (file type) box is usually present
  // The box starts with a 4-byte size, followed by "ftyp" (0x66 0x74 0x79 0x70)
  if (mimetype === 'video/mp4') {
    if (buffer.length < 8) return false;
    // Check for "ftyp" box - can appear at different offsets
    // Look for "ftyp" (0x66 0x74 0x79 0x70) in the first 20 bytes
    const searchLimit = Math.min(20, buffer.length - 3);
    for (let i = 0; i < searchLimit; i++) {
      if (buffer[i] === 0x66 &&
        buffer[i + 1] === 0x74 &&
        buffer[i + 2] === 0x79 &&
        buffer[i + 3] === 0x70) {
        return true; // Found "ftyp" box
      }
    }
    // Also check for common MP4 box types: "moov", "mdat", "free", "skip"
    // These indicate it's likely an MP4 file even if ftyp is not found
    const mp4BoxTypes = [
      [0x6D, 0x6F, 0x6F, 0x76], // "moov"
      [0x6D, 0x64, 0x61, 0x74], // "mdat"
      [0x66, 0x72, 0x65, 0x65], // "free"
      [0x73, 0x6B, 0x69, 0x70]  // "skip"
    ];
    for (const boxType of mp4BoxTypes) {
      for (let i = 0; i < searchLimit; i++) {
        if (buffer[i] === boxType[0] &&
          buffer[i + 1] === boxType[1] &&
          buffer[i + 2] === boxType[2] &&
          buffer[i + 3] === boxType[3]) {
          return true; // Found MP4 box type
        }
      }
    }
    return false; // No MP4 signature found
  }

  // Special handling for WebM files - look for "webm" in the first bytes
  if (mimetype === 'video/webm') {
    if (buffer.length < 12) return false;
    // WebM files start with EBML header (0x1A 0x45 0xDF 0xA3)
    // or can have "webm" string
    const hasEBML = buffer[0] === 0x1A && buffer[1] === 0x45 &&
      buffer[2] === 0xDF && buffer[3] === 0xA3;
    if (hasEBML) return true;
    // Also check for "webm" string
    const searchLimit = Math.min(20, buffer.length - 3);
    for (let i = 0; i < searchLimit; i++) {
      if (buffer[i] === 0x77 &&
        buffer[i + 1] === 0x65 &&
        buffer[i + 2] === 0x62 &&
        buffer[i + 3] === 0x6D) {
        return true; // Found "webm"
      }
    }
    return false;
  }

  // Special handling for OGG/OGV files
  if (mimetype === 'video/ogg' || mimetype === 'video/ogv') {
    if (buffer.length < 4) return false;
    // OGG files start with "OggS" (0x4F 0x67 0x67 0x53)
    return buffer[0] === 0x4F &&
      buffer[1] === 0x67 &&
      buffer[2] === 0x67 &&
      buffer[3] === 0x53;
  }

  // File signature validation for other types
  const signatures = {
    'image/png': [0x89, 0x50, 0x4E, 0x47],
    'image/gif': [0x47, 0x49, 0x46],
    'image/webp': [0x52, 0x49, 0x46, 0x46], // RIFF - but needs additional check
    'application/pdf': [0x25, 0x50, 0x44, 0x46] // %PDF
  };

  // Special handling for WebP - must start with RIFF and have WEBP at offset 8
  if (mimetype === 'image/webp') {
    if (buffer.length < 12) return false;
    const isRIFF = buffer[0] === 0x52 && buffer[1] === 0x49 &&
      buffer[2] === 0x46 && buffer[3] === 0x46;
    const isWEBP = buffer[8] === 0x57 && buffer[9] === 0x45 &&
      buffer[10] === 0x42 && buffer[11] === 0x50;
    return isRIFF && isWEBP;
  }

  const expectedSignature = signatures[mimetype];
  if (!expectedSignature) return true; // No signature check for unknown types

  // Ensure buffer has enough bytes for the signature
  if (buffer.length < expectedSignature.length) return false;

  // Check if buffer starts with expected signature
  for (let i = 0; i < expectedSignature.length; i++) {
    if (buffer[i] !== expectedSignature[i]) {
      return false;
    }
  }

  return true;
};

/**
 * Sanitize filename to prevent path traversal and other security issues
 * @param {string} filename - Original filename
 * @returns {string} - Sanitized filename
 */
const sanitizeFilename = (filename) => {
  if (!filename) return 'unnamed_file';

  // Remove path traversal attempts
  let sanitized = filename.replace(/\.\./g, '');

  // Remove or replace dangerous characters
  sanitized = sanitized.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');

  // Limit filename length
  if (sanitized.length > 255) {
    const ext = path.extname(sanitized);
    const name = path.basename(sanitized, ext);
    sanitized = name.substring(0, 255 - ext.length) + ext;
  }

  return sanitized;
};

/**
 * Validate file type
 * @param {string} mimetype - File MIME type
 * @param {string} category - File category (images, documents, videos)
 * @returns {boolean} - Whether file type is allowed
 */
const validateFileType = (mimetype, category) => {
  if (!ALLOWED_FILE_TYPES[category]) {
    return false;
  }
  return ALLOWED_FILE_TYPES[category].hasOwnProperty(mimetype);
};

/**
 * Get file extension from MIME type
 * @param {string} mimetype - File MIME type
 * @param {string} category - File category
 * @returns {string|null} - File extension or null
 */
const getFileExtension = (mimetype, category) => {
  if (!ALLOWED_FILE_TYPES[category]) {
    return null;
  }
  return ALLOWED_FILE_TYPES[category][mimetype] || null;
};

/**
 * Create secure file filter with comprehensive validation
 * @param {string} category - File category (images, documents, videos)
 * @returns {Function} - File filter function
 */
const createFileFilter = (category) => {
  return (req, file, cb) => {
    try {
      // Check if file type is allowed
      if (!validateFileType(file.mimetype, category)) {
        const allowedTypes = Object.keys(ALLOWED_FILE_TYPES[category] || {});
        return cb(new Error(`Invalid file type. Allowed types: ${allowedTypes.join(', ')}`), false);
      }

      // Additional security checks
      const extension = path.extname(file.originalname).toLowerCase();
      const expectedExtension = getFileExtension(file.mimetype, category);

      // Special handling for JPEG files - accept both .jpg and .jpeg extensions
      if (expectedExtension && extension !== expectedExtension) {
        // Allow both .jpg and .jpeg for image/jpeg MIME type
        if (file.mimetype === 'image/jpeg' && (extension === '.jpg' || extension === '.jpeg')) {
          // Valid JPEG extension, continue
        } else {
          return cb(new Error(`File extension mismatch. Expected: ${expectedExtension}`), false);
        }
      }

      // Check for potentially dangerous file names
      const dangerousPatterns = /\.(exe|bat|cmd|com|scr|pif|vbs|js|jar|php|asp|aspx|jsp)$/i;
      if (dangerousPatterns.test(file.originalname)) {
        return cb(new Error('Potentially dangerous file type detected'), false);
      }

      // Sanitize filename
      file.originalname = sanitizeFilename(file.originalname);

      // Check for dangerous MIME types
      const dangerousMimeTypes = [
        'application/x-executable',
        'application/x-msdownload',
        'application/x-msdos-program',
        'application/x-winexe',
        'application/x-javascript',
        'text/javascript',
        'application/javascript'
      ];

      if (dangerousMimeTypes.includes(file.mimetype)) {
        return cb(new Error('Potentially dangerous MIME type detected'), false);
      }

      cb(null, true);
    } catch (error) {
      console.error('❌ File filter error:', error);
      cb(new Error('File validation error'), false);
    }
  };
};

/**
 * Create file filter for product uploads that handles multiple field types
 * Allows images for mainImage/galleryImages and videos for video field
 * @returns {Function} - File filter function
 */
const createProductFileFilter = () => {
  return (req, file, cb) => {
    try {
      // Determine allowed category based on field name
      // Handle both regular fields (video, mainImage, galleryImages) and variant media fields (variantMedia-*-video, etc.)
      let allowedCategory;
      const fieldname = file.fieldname || '';

      // Check if it's a video field (either exact match or variant media ending with -video)
      if (fieldname === 'video' || fieldname.endsWith('-video')) {
        allowedCategory = 'videos';
      }
      // Check if it's an image field (mainImage, galleryImages, or variant media ending with -mainImage/-galleryImages)
      else if (fieldname === 'mainImage' || fieldname === 'galleryImages' ||
        fieldname.endsWith('-mainImage') || fieldname.endsWith('-galleryImages')) {
        allowedCategory = 'products'; // Images for products
      }
      else {
        // Fallback to products category for unknown fields (backward compatibility)
        allowedCategory = 'products';
      }

      // Check if file type is allowed for this field
      if (!validateFileType(file.mimetype, allowedCategory)) {
        const allowedTypes = Object.keys(ALLOWED_FILE_TYPES[allowedCategory] || {});
        return cb(new Error(`Invalid file type for ${file.fieldname}. Allowed types: ${allowedTypes.join(', ')}`), false);
      }

      // Additional security checks
      const extension = path.extname(file.originalname).toLowerCase();
      const expectedExtension = getFileExtension(file.mimetype, allowedCategory);

      // Special handling for JPEG files - accept both .jpg and .jpeg extensions
      if (expectedExtension && extension !== expectedExtension) {
        // Allow both .jpg and .jpeg for image/jpeg MIME type
        if (file.mimetype === 'image/jpeg' && (extension === '.jpg' || extension === '.jpeg')) {
          // Valid JPEG extension, continue
        } else {
          return cb(new Error(`File extension mismatch. Expected: ${expectedExtension}`), false);
        }
      }

      // Check for potentially dangerous file names
      const dangerousPatterns = /\.(exe|bat|cmd|com|scr|pif|vbs|js|jar|php|asp|aspx|jsp)$/i;
      if (dangerousPatterns.test(file.originalname)) {
        return cb(new Error('Potentially dangerous file type detected'), false);
      }

      // Sanitize filename
      file.originalname = sanitizeFilename(file.originalname);

      // Check for dangerous MIME types
      const dangerousMimeTypes = [
        'application/x-executable',
        'application/x-msdownload',
        'application/x-msdos-program',
        'application/x-winexe',
        'application/x-javascript',
        'text/javascript',
        'application/javascript'
      ];

      if (dangerousMimeTypes.includes(file.mimetype)) {
        return cb(new Error('Potentially dangerous MIME type detected'), false);
      }

      cb(null, true);
    } catch (error) {
      console.error('❌ Product file filter error:', error);
      cb(new Error('File validation error'), false);
    }
  };
};

/**
 * Create R2-compatible storage configuration
 * @param {string} category - File category for R2 folder structure
 * @returns {Object} - Multer storage configuration
 */
const createR2Storage = (category) => {
  return multer.memoryStorage();
};

/**
 * Create secure storage configuration (legacy - for local storage)
 * @param {string} destination - Upload destination directory
 * @returns {Object} - Multer storage configuration
 */
const createSecureStorage = (destination) => {
  // Ensure directory exists
  if (!fs.existsSync(destination)) {
    fs.mkdirSync(destination, { recursive: true });
  }

  return multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, destination);
    },
    filename: function (req, file, cb) {
      const extension = path.extname(file.originalname).toLowerCase();
      const secureFilename = generateSecureFilenameLegacy(file.originalname, extension);
      cb(null, secureFilename);
    }
  });
};

/**
 * Create R2 upload middleware
 * @param {Object} options - Upload options
 * @param {string} options.category - File category (images, documents, videos)
 * @param {number} options.maxFiles - Maximum number of files (default: 1)
 * @param {string} options.fieldName - Field name for single file upload
 * @returns {Object} - Multer middleware with R2 upload
 */
const createR2Upload = (options) => {
  const {
    category = 'images',
    maxFiles = 1,
    fieldName = 'file',
    uploadKind,
  } = options;

  const storage = createR2Storage(category);
  const fileFilter = createFileFilter(category);
  const fileSizeLimit = FILE_SIZE_LIMITS[category] || FILE_SIZE_LIMITS.default;

  const multerConfig = {
    storage,
    fileFilter,
    limits: {
      fileSize: fileSizeLimit,
      files: maxFiles
    }
  };

  const uploadMiddleware = maxFiles === 1
    ? multer(multerConfig).single(fieldName)
    : multer(multerConfig).array(fieldName, maxFiles);

  // Return middleware that uploads to R2 after multer processing
  return (req, res, next) => {
    if (uploadKind) {
      req._mediaUploadKind = uploadKind;
    }
    uploadMiddleware(req, res, async (err) => {
      if (err) {
        return next(err);
      }

      try {
        // Upload files to R2 and replace file info
        if (req.file) {
          await uploadSingleFileToR2(req.file, category, req);
        } else if (req.files && req.files.length > 0) {
          for (const file of req.files) {
            await uploadSingleFileToR2(file, category, req);
          }
        }

        next();
      } catch (error) {
        console.error('❌ R2 upload error:', error);
        next(error);
      }
    });
  };
};

/**
 * Create R2 upload middleware for product uploads with multiple fields
 * @param {Object} options - Upload options
 * @param {string} options.category - File category (products)
 * @param {number} options.maxFiles - Maximum number of gallery images (default: 10)
 * @returns {Object} - Multer middleware with R2 upload for multiple fields
 */
const createR2ProductUpload = (options) => {
  const {
    category = 'products',
    maxFiles = 10
  } = options;

  const storage = createR2Storage(category);
  // Use product-specific file filter that handles both images and videos
  const fileFilter = createProductFileFilter();
  // Use video file size limit (50MB) as the max since videos are larger than images
  // This ensures videos can be uploaded, and images will still work fine
  const fileSizeLimit = FILE_SIZE_LIMITS.videos || FILE_SIZE_LIMITS.default;

  const multerConfig = {
    storage,
    fileFilter,
    limits: {
      fileSize: fileSizeLimit,
      files: maxFiles + 2 // mainImage + galleryImages + video
    }
  };

  // Use multer.any() to handle all fields including dynamic variant media fields
  // This allows us to accept variantMedia-{key}-{field} pattern files
  const uploadMiddleware = multer(multerConfig).any();

  return (req, res, next) => {
    req._mediaUploadKind = 'product';
    uploadMiddleware(req, res, async (err) => {
      if (err) {
        return next(err);
      }

      try {
        if (req.files && Array.isArray(req.files)) {
          // Organize files by fieldname for processing
          const filesByField = {};
          req.files.forEach(file => {
            if (!filesByField[file.fieldname]) {
              filesByField[file.fieldname] = [];
            }
            filesByField[file.fieldname].push(file);
          });

          // Process mainImage
          if (filesByField.mainImage && filesByField.mainImage.length > 0) {
            for (const file of filesByField.mainImage) {
              await uploadSingleFileToR2(file, category, req);
            }
          }

          // Process galleryImages
          if (filesByField.galleryImages && filesByField.galleryImages.length > 0) {
            for (let i = 0; i < filesByField.galleryImages.length; i++) {
              const file = filesByField.galleryImages[i];
              await uploadSingleFileToR2(file, category, req, { galleryIndex: i + 1 });
            }
          }

          // Process video - use 'videos' category for MIME validation
          if (filesByField.video && filesByField.video.length > 0) {
            for (const file of filesByField.video) {
              await uploadSingleFileToR2(file, 'videos', req);
            }
          }

          // Process variant media files (pattern: variantMedia-{variantKey}-{field})
          const variantMediaPromises = [];
          Object.keys(filesByField).forEach((fieldname) => {
            if (fieldname && fieldname.startsWith('variantMedia-')) {
              const isVideo = fieldname.includes('-video');
              const uploadCategory = isVideo ? 'videos' : category;
              const isGallery = fieldname.includes('-galleryImages');
              filesByField[fieldname].forEach((file, idx) => {
                const opts = isGallery ? { galleryIndex: idx + 1 } : {};
                variantMediaPromises.push(
                  uploadSingleFileToR2(file, uploadCategory, req, opts)
                );
              });
            }
          });
          await Promise.all(variantMediaPromises);

          // Reorganize req.files back to object format for backward compatibility
          req.files = filesByField;
        }

        next();
      } catch (error) {
        console.error('❌ R2 upload error:', error);
        next(error);
      }
    });
  };
};

/**
 * Create R2 upload middleware for banner form uploads with multiple fields
 * @param {Object} options - Upload options
 * @param {string} options.category - File category (banners)
 * @param {number} options.maxFiles - Maximum number of files (default: 5)
 * @returns {Object} - Multer middleware with R2 upload for multiple fields
 */
const BANNER_OFFER_SLOTS = 4;

/**
 * Slider dual-field upload: desktop `image` + mobile `mobileImage`.
 */
const createR2SliderUpload = (options = {}) => {
  const { category = 'banners' } = options;
  const storage = createR2Storage(category);
  const fileFilter = createFileFilter(category);
  const fileSizeLimit = FILE_SIZE_LIMITS[category] || FILE_SIZE_LIMITS.default;

  const fields = [
    { name: 'image', maxCount: 1 },
    { name: 'mobileImage', maxCount: 1 },
  ];

  const multerConfig = {
    storage,
    fileFilter,
    limits: {
      fileSize: fileSizeLimit,
      files: 2,
    },
  };

  const uploadMiddleware = multer(multerConfig).fields(fields);

  return (req, res, next) => {
    req._mediaUploadKind = 'slider';
    uploadMiddleware(req, res, async (err) => {
      if (err) {
        return next(err);
      }

      try {
        if (req.files) {
          for (const fieldName of ['image', 'mobileImage']) {
            const list = req.files[fieldName];
            if (list && list.length > 0) {
              for (const file of list) {
                await uploadSingleFileToR2(file, category, req);
              }
            }
          }
        }
        next();
      } catch (error) {
        console.error('❌ R2 upload error:', error);
        next(error);
      }
    });
  };
};

const createR2BannerUpload = (options) => {
  const {
    category = 'banners',
    maxFiles = 1 + BANNER_OFFER_SLOTS
  } = options;

  const storage = createR2Storage(category);
  const fileFilter = createFileFilter(category);
  const fileSizeLimit = FILE_SIZE_LIMITS[category] || FILE_SIZE_LIMITS.default;

  const fields = [
    { name: 'backgroundImage', maxCount: 1 },
    ...Array.from({ length: BANNER_OFFER_SLOTS }, (_, i) => ({ name: `offer_image_${i}`, maxCount: 1 }))
  ];

  const multerConfig = {
    storage,
    fileFilter,
    limits: {
      fileSize: fileSizeLimit,
      files: maxFiles
    }
  };

  const uploadMiddleware = multer(multerConfig).fields(fields);

  return (req, res, next) => {
    req._mediaUploadKind = 'banner';
    uploadMiddleware(req, res, async (err) => {
      if (err) {
        return next(err);
      }

      try {
        if (req.files) {
          if (req.files.backgroundImage && req.files.backgroundImage.length > 0) {
            for (const file of req.files.backgroundImage) {
              await uploadSingleFileToR2(file, category, req);
            }
          }
          for (let i = 0; i < BANNER_OFFER_SLOTS; i++) {
            const fieldName = `offer_image_${i}`;
            if (req.files[fieldName] && req.files[fieldName].length > 0) {
              for (const file of req.files[fieldName]) {
                await uploadSingleFileToR2(file, category, req);
              }
            }
          }
        }
        next();
      } catch (error) {
        console.error('❌ R2 upload error:', error);
        next(error);
      }
    });
  };
};

const GRID_4X4_SLOTS = 16;

/**
 * Create R2 upload middleware for Homepage Grid 4x4 form (16 item images)
 */
const createR2Grid4x4Upload = (options) => {
  const { category = 'banners', maxFiles = GRID_4X4_SLOTS } = options;
  const storage = createR2Storage(category);
  const fileFilter = createFileFilter(category);
  const fileSizeLimit = FILE_SIZE_LIMITS[category] || FILE_SIZE_LIMITS.default;
  const fields = Array.from({ length: GRID_4X4_SLOTS }, (_, i) => ({ name: `item_image_${i}`, maxCount: 1 }));
  const uploadMiddleware = multer({
    storage,
    fileFilter,
    limits: { fileSize: fileSizeLimit, files: maxFiles },
  }).fields(fields);

  return (req, res, next) => {
    req._mediaUploadKind = 'grid';
    uploadMiddleware(req, res, async (err) => {
      if (err) return next(err);
      try {
        if (req.files) {
          for (let i = 0; i < GRID_4X4_SLOTS; i++) {
            const fieldName = `item_image_${i}`;
            if (req.files[fieldName] && req.files[fieldName].length > 0) {
              for (const file of req.files[fieldName]) {
                await uploadSingleFileToR2(file, category, req, { gridIndex: String(i) });
              }
            }
          }
        }
        next();
      } catch (error) {
        console.error('❌ R2 grid 4x4 upload error:', error);
        next(error);
      }
    });
  };
};

/**
 * Create R2 upload middleware for seller document uploads with multiple fields
 * @param {Object} options - Upload options
 * @param {string} options.category - File category (sellers)
 * @param {number} options.maxFiles - Maximum number of files (default: 10)
 * @returns {Object} - Multer middleware with R2 upload for multiple fields
 */
const createR2SellerDocumentsUpload = (options) => {
  const {
    category = 'sellers',
    maxFiles = 10 // shopImage + aadhaarFront + aadhaarBack + tradeLicense + panCard + gst + otherDocs
  } = options;

  const storage = createR2Storage(category);
  const fileFilter = createFileFilter(category);
  const fileSizeLimit = FILE_SIZE_LIMITS[category] || FILE_SIZE_LIMITS.default;

  const multerConfig = {
    storage,
    fileFilter,
    limits: {
      fileSize: fileSizeLimit,
      files: maxFiles
    }
  };

  // Use multer.fields to handle multiple field names for seller document uploads
  const uploadMiddleware = multer(multerConfig).fields([
    { name: 'shopImage', maxCount: 1 },
    { name: 'profileImage', maxCount: 1 },
    { name: 'aadhaarFront', maxCount: 1 },
    { name: 'aadhaarBack', maxCount: 1 },
    { name: 'tradeLicense', maxCount: 1 },
    { name: 'panCard', maxCount: 1 },
    { name: 'gst', maxCount: 1 },
    { name: 'otherDocs', maxCount: 5 }
  ]);

  return (req, res, next) => {
    req._mediaUploadKind = 'seller-doc';
    uploadMiddleware(req, res, async (err) => {
      if (err) {
        return next(err);
      }

      try {
        if (req.files) {
          const sellerFields = [
            'shopImage',
            'profileImage',
            'aadhaarFront',
            'aadhaarBack',
            'tradeLicense',
            'panCard',
            'gst',
            'otherDocs',
          ];
          for (const field of sellerFields) {
            if (req.files[field] && req.files[field].length > 0) {
              for (const file of req.files[field]) {
                await uploadSingleFileToR2(file, category, req);
              }
            }
          }
        }

        next();
      } catch (error) {
        console.error('❌ R2 upload error:', error);
        next(error);
      }
    });
  };
};

/**
 * Upload single file to R2 and update file info with content validation
 * @param {Object} file - Multer file object
 * @param {string} category - File category
 * @param {string} userId - User ID for folder organization
 */
const uploadSingleFileToR2 = async (file, category, req, uploadOptions = {}) => {
  try {
    if (!validateFileContent(file.buffer, file.mimetype)) {
      throw new Error(
        `File content validation failed. File content does not match MIME type: ${file.mimetype}`
      );
    }

    const extension = getFileExtension(file.mimetype, category);
    if (!extension) {
      throw new Error(`Could not determine file extension for MIME type: ${file.mimetype}`);
    }

    if (isMediaNamingV2() && req) {
      const context = await resolveUploadContext(req, file, {
        uploadKind: req._mediaUploadKind,
        extension,
        galleryIndex: uploadOptions.galleryIndex,
        gridIndex: uploadOptions.gridIndex,
      });
      const namingResult = await uploadWithNaming(file.buffer, context, file.mimetype);
      file.filename = namingResult.publicUrl;
      file.r2Key = namingResult.key;
      file.r2PublicUrl = namingResult.publicUrl;
      return;
    }

    const userId = req?.user?._id;
    const folderPath = userId ? `${category}/${userId}` : category;
    const key = generateSecureFilename(file.originalname, folderPath);
    const result = await uploadFileToR2(file.buffer, key, file.mimetype);

    if (result.success) {
      file.filename = result.publicUrl;
      file.r2Key = result.key;
      file.r2PublicUrl = result.publicUrl;
    } else {
      throw new Error(`R2 upload failed: ${result.error}`);
    }
  } catch (error) {
    console.error('❌ Error uploading file to R2:', error);
    throw error;
  }
};

/**
 * Create secure upload middleware (legacy - for local storage)
 * @param {Object} options - Upload options
 * @param {string} options.category - File category (images, documents, videos)
 * @param {string} options.destination - Upload destination directory
 * @param {number} options.maxFiles - Maximum number of files (default: 1)
 * @param {string} options.fieldName - Field name for single file upload
 * @returns {Object} - Multer middleware
 */
const createSecureUpload = (options) => {
  const {
    category = 'images',
    destination = 'uploads/',
    maxFiles = 1,
    fieldName = 'file'
  } = options;

  const storage = createSecureStorage(destination);
  const fileFilter = createFileFilter(category);
  const fileSizeLimit = FILE_SIZE_LIMITS[category] || FILE_SIZE_LIMITS.default;

  const multerConfig = {
    storage,
    fileFilter,
    limits: {
      fileSize: fileSizeLimit,
      files: maxFiles
    }
  };

  if (maxFiles === 1) {
    return multer(multerConfig).single(fieldName);
  } else {
    return multer(multerConfig).array(fieldName, maxFiles);
  }
};

/**
 * Predefined R2 upload middlewares for common use cases
 */
const r2Uploads = {
  // Single image upload
  singleImage: () =>
    createR2Upload({ category: 'images', maxFiles: 1, fieldName: 'image' }),

  // Blog image upload (Strict 500KB limit)
  blogImage: () =>
    createR2Upload({ category: 'blogs', maxFiles: 1, fieldName: 'image', uploadKind: 'blog' }),

  // Multiple images upload
  multipleImages: (maxFiles = 10) =>
    createR2Upload({ category: 'images', maxFiles, fieldName: 'images' }),

  // Single document upload
  singleDocument: () =>
    createR2Upload({ category: 'documents', maxFiles: 1, fieldName: 'document' }),

  // Single video upload
  singleVideo: () =>
    createR2Upload({ category: 'videos', maxFiles: 1, fieldName: 'video' }),

  // Brand logo upload
  brandLogo: () =>
    createR2Upload({ category: 'brands', maxFiles: 1, fieldName: 'logo', uploadKind: 'brand' }),

  // Product images upload (handles multiple fields: mainImage, galleryImages, video)
  productImages: (maxFiles = 10) =>
    createR2ProductUpload({ category: 'products', maxFiles }),

  // Profile image upload
  profileImage: () =>
    createR2Upload({
      category: 'profiles',
      maxFiles: 1,
      fieldName: 'profileImage',
      uploadKind: 'profile',
    }),

  // Banner upload (single field - for simple banner uploads)
  banner: () =>
    createR2Upload({ category: 'banners', maxFiles: 1, fieldName: 'banner', uploadKind: 'banner' }),

  // Slider upload (desktop image + mobileImage)
  slider: () =>
    createR2SliderUpload({ category: 'banners' }),

  // Banner form upload (multiple fields - for banner settings form)
  bannerForm: () =>
    createR2BannerUpload({ category: 'banners', maxFiles: 1 + BANNER_OFFER_SLOTS }),

  // Homepage Grid 4x4 form (16 item image slots)
  grid4x4Form: () =>
    createR2Grid4x4Upload({ category: 'banners', maxFiles: 16 }),

  // Category image upload
  categoryImage: () =>
    createR2Upload({
      category: 'categories',
      maxFiles: 1,
      fieldName: 'image',
      uploadKind: 'category',
    }),

  // Seller documents upload (multiple specific fields)
  sellerDocuments: (maxFiles = 10) =>
    createR2SellerDocumentsUpload({ category: 'sellers', maxFiles }),

  // Admin profile upload
  adminProfile: () =>
    createR2Upload({
      category: 'admins',
      maxFiles: 1,
      fieldName: 'profileImage',
      uploadKind: 'admin-profile',
    }),

  // Site settings upload (logo and favicon)
  siteSettings: () =>
    createR2SiteSettingsUpload()
};

/**
 * Create R2 upload middleware for site settings (logo and favicon)
 * @returns {Object} - Multer middleware with R2 upload for multiple fields
 */
const createR2SiteSettingsUpload = () => {
  const category = 'images';
  const storage = createR2Storage(category);
  const fileFilter = createFileFilter(category);
  const fileSizeLimit = FILE_SIZE_LIMITS[category] || FILE_SIZE_LIMITS.default;

  const multerConfig = {
    storage,
    fileFilter,
    limits: {
      fileSize: fileSizeLimit,
      files: 2 // logo + favicon
    }
  };

  // Use multer.fields to handle both logo and favicon
  const uploadMiddleware = multer(multerConfig).fields([
    { name: 'logo', maxCount: 1 },
    { name: 'favicon', maxCount: 1 }
  ]);

  return (req, res, next) => {
    req._mediaUploadKind = 'site';
    uploadMiddleware(req, res, async (err) => {
      if (err) {
        return next(err);
      }

      try {
        if (req.files) {
          if (req.files.logo && req.files.logo.length > 0) {
            for (const file of req.files.logo) {
              await uploadSingleFileToR2(file, category, req);
            }
          }

          if (req.files.favicon && req.files.favicon.length > 0) {
            for (const file of req.files.favicon) {
              await uploadSingleFileToR2(file, category, req);
            }
          }
        }

        next();
      } catch (error) {
        console.error('❌ R2 upload error:', error);
        next(error);
      }
    });
  };
};

/**
 * Predefined secure upload middlewares for common use cases (legacy - local storage)
 */
const secureUploads = {
  // Single image upload
  singleImage: (destination = 'uploads/images/') =>
    createSecureUpload({ category: 'images', destination, maxFiles: 1, fieldName: 'image' }),

  // Multiple images upload
  multipleImages: (destination = 'uploads/images/', maxFiles = 10) =>
    createSecureUpload({ category: 'images', destination, maxFiles, fieldName: 'images' }),

  // Single document upload
  singleDocument: (destination = 'uploads/documents/') =>
    createSecureUpload({ category: 'documents', destination, maxFiles: 1, fieldName: 'document' }),

  // Single video upload
  singleVideo: (destination = 'uploads/videos/') =>
    createSecureUpload({ category: 'videos', destination, maxFiles: 1, fieldName: 'video' }),

  // Brand logo upload
  brandLogo: () =>
    createSecureUpload({ category: 'images', destination: 'uploads/brands/', maxFiles: 1, fieldName: 'logo' }),

  // Product images upload
  productImages: (maxFiles = 10) =>
    createSecureUpload({ category: 'images', destination: 'uploads/products/', maxFiles, fieldName: 'images' }),

  // Profile image upload
  profileImage: (destination = 'uploads/profiles/') =>
    createSecureUpload({ category: 'images', destination, maxFiles: 1, fieldName: 'profileImage' }),

  // Banner upload
  banner: (destination = 'uploads/banners/') =>
    createSecureUpload({ category: 'images', destination, maxFiles: 1, fieldName: 'banner' })
};

/**
 * Error handling middleware for upload errors
 */
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Please check file size limits.',
        code: 'FILE_TOO_LARGE',
        timestamp: new Date().toISOString()
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Please check file count limits.',
        code: 'TOO_MANY_FILES',
        timestamp: new Date().toISOString()
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected file field.',
        code: 'UNEXPECTED_FILE_FIELD',
        timestamp: new Date().toISOString()
      });
    }
  }

  if (err.message.includes('Invalid file type') ||
    err.message.includes('File extension mismatch') ||
    err.message.includes('Potentially dangerous file type')) {
    return res.status(400).json({
      success: false,
      message: err.message,
      code: 'INVALID_FILE_TYPE',
      timestamp: new Date().toISOString()
    });
  }

  next(err);
};

module.exports = {
  createSecureUpload,
  createR2Upload,
  createR2ProductUpload,
  createR2BannerUpload,
  createR2SliderUpload,
  createR2SellerDocumentsUpload,
  createR2SiteSettingsUpload,
  createFileFilter,
  secureUploads,
  r2Uploads,
  handleUploadError,
  ALLOWED_FILE_TYPES,
  FILE_SIZE_LIMITS,
  validateFileType,
  validateFileContent,
  sanitizeFilename,
  generateSecureFilename: generateSecureFilenameLegacy,
  uploadSingleFileToR2
};
