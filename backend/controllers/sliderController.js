const Slider = require('../models/Slider');
const { PLACEMENTS } = require('../models/Slider');
const fs = require('fs');
const path = require('path');
const cache = require('../utils/cache');
const { getConfig, validateFileType, validateFileSize } = require('../config/uploadConfig');
const { sendErrorResponse, sendSuccessResponse, ERROR_CODES, HTTP_STATUS } = require('../utils/errorHandler');
const { deleteMediaObject } = require('../services/r2UploadService');
const { applyTranslations } = require('../utils/applyTranslations');

/** Sort: placement then order within placement. */
const SLIDER_SORT = { placement: 1, displayOrder: 1, createdAt: -1, _id: 1 };

/** Optional text fields may be empty strings; never invent copy. */
function optionalSliderText(value) {
  if (value === undefined || value === null) return '';
  return String(value);
}

function parseIsActive(value) {
  return value === true || value === 'true';
}

function validateDisplayOrder(value) {
  const order = Number(value);
  if (!Number.isInteger(order)) {
    return { valid: false, message: 'displayOrder must be an integer.' };
  }
  if (order < 0) {
    return { valid: false, message: 'displayOrder must be 0 or greater.' };
  }
  return { valid: true };
}

function validatePlacement(value) {
  if (value === undefined || value === null || value === '') {
    return { valid: false, message: 'placement is required (hero, promo1, or promo2).' };
  }
  const placement = String(value).trim();
  if (!PLACEMENTS.includes(placement)) {
    return {
      valid: false,
      message: `placement must be one of: ${PLACEMENTS.join(', ')}.`,
    };
  }
  return { valid: true, placement };
}

/**
 * Empty buttonLink is OK. Non-empty must be a relative path (/...) or http(s) URL.
 */
function validateButtonLink(value) {
  if (value === undefined || value === null) return { valid: true };
  const link = String(value).trim();
  if (link === '') return { valid: true };
  if (link.startsWith('/')) return { valid: true };
  try {
    const parsed = new URL(link);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return { valid: true };
    }
  } catch {
    // fall through
  }
  return {
    valid: false,
    message: 'buttonLink must be a relative path starting with / or an http(s) URL.',
  };
}

function getUploadedFile(req, fieldName) {
  if (req.files && req.files[fieldName] && req.files[fieldName][0]) {
    return req.files[fieldName][0];
  }
  // Legacy single-file middleware shape (tests / older clients)
  if (fieldName === 'image' && req.file) {
    return req.file;
  }
  return null;
}

function hasStoredImage(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Active slides must have both desktop and mobile creatives.
 * Enforced on create/update only — does not auto-deactivate legacy rows.
 */
function assertActiveHasBothImages(isActive, desktopImage, mobileImage) {
  if (!isActive) return { ok: true };
  if (!hasStoredImage(desktopImage)) {
    return { ok: false, message: 'Desktop image is required for an active slider.' };
  }
  if (!hasStoredImage(mobileImage)) {
    return { ok: false, message: 'Mobile image is required for an active slider.' };
  }
  return { ok: true };
}

async function validateUploadedImageFile(file, label, config) {
  if (!validateFileType(file, config.ALLOWED_IMAGE_TYPES, config.ALLOWED_IMAGE_EXTENSIONS)) {
    return {
      ok: false,
      message: `Invalid file type for slider ${label}`,
      details: {
        allowedTypes: config.ALLOWED_IMAGE_TYPES,
        allowedExtensions: config.ALLOWED_IMAGE_EXTENSIONS,
      },
    };
  }
  if (!validateFileSize(file, config.MAX_FILE_SIZE)) {
    return {
      ok: false,
      message: `File size too large for slider ${label}`,
      details: {
        maxSize: config.MAX_FILE_SIZE,
        actualSize: file.size,
      },
    };
  }
  return { ok: true };
}

/**
 * displayOrder uniqueness among active sliders within the same placement.
 */
async function assertUniqueActiveOrderInPlacement(placement, displayOrder, excludeId = null) {
  if (!placement || !PLACEMENTS.includes(placement)) {
    return { ok: true };
  }
  const query = { placement, displayOrder, isActive: true };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  const existing = await Slider.findOne(query).select('_id placement displayOrder').lean();
  if (existing) {
    return {
      ok: false,
      message: `An active slider already uses displayOrder ${displayOrder} in placement "${placement}". Choose a different order or deactivate the existing slider.`,
    };
  }
  return { ok: true };
}

async function deleteSliderMedia(storedValue, uploadPath) {
  if (!storedValue) return;
  if (storedValue.startsWith('http://') || storedValue.startsWith('https://')) {
    await deleteMediaObject(storedValue);
    return;
  }
  const localPath = path.join(uploadPath, storedValue);
  if (fs.existsSync(localPath)) {
    try {
      fs.unlinkSync(localPath);
    } catch (error) {
      console.error('Error deleting local slider file:', error);
    }
  }
}

function invalidateHomepageBundleCache() {
  cache.keys()
    .filter((k) => k.startsWith('homepage-bundle-'))
    .forEach((k) => cache.del(k));
}

async function getNextDisplayOrder(placement) {
  const query = placement ? { placement } : {};
  const result = await Slider.findOne(query).sort({ displayOrder: -1 }).select('displayOrder').lean();
  const max = result?.displayOrder;
  return (max ?? -1) + 1;
}

// Get all banners (optional ?placement=hero|promo1|promo2)
exports.getAllSliders = async (req, res) => {
  try {
    const filter = {};
    const placementParam = req.query.placement;
    if (placementParam !== undefined && placementParam !== null && placementParam !== '') {
      const placementCheck = validatePlacement(placementParam);
      if (!placementCheck.valid) {
        return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, placementCheck.message, ERROR_CODES.INVALID_INPUT);
      }
      filter.placement = placementCheck.placement;
    }

    let sliders = await Slider.find(filter).sort(SLIDER_SORT).lean();
    const locale = req.query.locale;
    if (locale && locale !== 'en') {
      sliders = await applyTranslations(sliders, 'Slider', locale, ['heading', 'offerText', 'buttonText']);
    }
    sendSuccessResponse(res, HTTP_STATUS.OK, 'Sliders retrieved successfully', sliders);
  } catch (err) {
    console.error('Error fetching sliders:', err);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, 'Failed to fetch sliders', ERROR_CODES.INTERNAL_SERVER_ERROR, { error: err.message });
  }
};

// Create a new banner
exports.createSlider = async (req, res) => {
  try {
    const config = getConfig();
    const { heading, offerText, buttonText, buttonLink, isActive, displayOrder, placement } = req.body;

    const placementCheck = validatePlacement(placement);
    if (!placementCheck.valid) {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, placementCheck.message, ERROR_CODES.INVALID_INPUT);
    }
    const resolvedPlacement = placementCheck.placement;

    const desktopFile = getUploadedFile(req, 'image');
    const mobileFile = getUploadedFile(req, 'mobileImage');

    if (!desktopFile) {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, 'Image is required', ERROR_CODES.INVALID_INPUT);
    }

    const desktopCheck = await validateUploadedImageFile(desktopFile, 'image', config);
    if (!desktopCheck.ok) {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, desktopCheck.message, ERROR_CODES.INVALID_INPUT, desktopCheck.details);
    }

    if (mobileFile) {
      const mobileCheck = await validateUploadedImageFile(mobileFile, 'mobile image', config);
      if (!mobileCheck.ok) {
        return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, mobileCheck.message, ERROR_CODES.INVALID_INPUT, mobileCheck.details);
      }
    }

    const linkCheck = validateButtonLink(buttonLink);
    if (!linkCheck.valid) {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, linkCheck.message, ERROR_CODES.INVALID_INPUT);
    }

    let resolvedDisplayOrder;
    if (displayOrder !== undefined && displayOrder !== null && displayOrder !== '') {
      const orderCheck = validateDisplayOrder(displayOrder);
      if (!orderCheck.valid) {
        return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, orderCheck.message, ERROR_CODES.INVALID_INPUT);
      }
      resolvedDisplayOrder = Number(displayOrder);
    } else {
      resolvedDisplayOrder = await getNextDisplayOrder(resolvedPlacement);
    }

    const resolvedIsActive = isActive === undefined || isActive === null || isActive === ''
      ? true
      : parseIsActive(isActive);

    const desktopImage = desktopFile.filename;
    const mobileImage = mobileFile ? mobileFile.filename : '';

    const imagesCheck = assertActiveHasBothImages(resolvedIsActive, desktopImage, mobileImage);
    if (!imagesCheck.ok) {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, imagesCheck.message, ERROR_CODES.INVALID_INPUT);
    }

    if (resolvedIsActive) {
      const orderCheck = await assertUniqueActiveOrderInPlacement(
        resolvedPlacement,
        resolvedDisplayOrder
      );
      if (!orderCheck.ok) {
        return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, orderCheck.message, ERROR_CODES.INVALID_INPUT);
      }
    }

    const newSlider = new Slider({
      placement: resolvedPlacement,
      image: desktopImage,
      mobileImage,
      heading: optionalSliderText(heading),
      offerText: optionalSliderText(offerText),
      buttonText: optionalSliderText(buttonText),
      buttonLink: optionalSliderText(buttonLink),
      isActive: resolvedIsActive,
      displayOrder: resolvedDisplayOrder,
    });

    await newSlider.save();
    invalidateHomepageBundleCache();
    sendSuccessResponse(res, HTTP_STATUS.CREATED, 'Slider created successfully', { slider: newSlider });
  } catch (err) {
    console.error('Error creating slider:', err);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, 'Failed to create slider', ERROR_CODES.INTERNAL_SERVER_ERROR, { error: err.message });
  }
};

// Update a banner
exports.updateSlider = async (req, res) => {
  try {
    const config = getConfig();
    const { heading, offerText, buttonText, buttonLink, isActive, displayOrder, placement } = req.body;
    const slider = await Slider.findById(req.params.id);

    if (!slider) {
      return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, 'Slider not found', ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    const desktopFile = getUploadedFile(req, 'image');
    const mobileFile = getUploadedFile(req, 'mobileImage');

    let image = slider.image;
    let mobileImage = slider.mobileImage || '';

    if (desktopFile) {
      const desktopCheck = await validateUploadedImageFile(desktopFile, 'image', config);
      if (!desktopCheck.ok) {
        return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, desktopCheck.message, ERROR_CODES.INVALID_INPUT, desktopCheck.details);
      }
      await deleteSliderMedia(slider.image, config.SLIDER_UPLOAD_PATH);
      image = desktopFile.filename;
    }

    if (mobileFile) {
      const mobileCheck = await validateUploadedImageFile(mobileFile, 'mobile image', config);
      if (!mobileCheck.ok) {
        return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, mobileCheck.message, ERROR_CODES.INVALID_INPUT, mobileCheck.details);
      }
      await deleteSliderMedia(slider.mobileImage, config.SLIDER_UPLOAD_PATH);
      mobileImage = mobileFile.filename;
    }

    // Preserve existing values when optional fields are omitted.
    if (heading !== undefined) slider.heading = optionalSliderText(heading);
    if (offerText !== undefined) slider.offerText = optionalSliderText(offerText);
    if (buttonText !== undefined) slider.buttonText = optionalSliderText(buttonText);
    if (buttonLink !== undefined) {
      const linkCheck = validateButtonLink(buttonLink);
      if (!linkCheck.valid) {
        return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, linkCheck.message, ERROR_CODES.INVALID_INPUT);
      }
      slider.buttonLink = optionalSliderText(buttonLink);
    }
    if (isActive !== undefined && isActive !== null && isActive !== '') {
      slider.isActive = parseIsActive(isActive);
    }
    if (displayOrder !== undefined && displayOrder !== null && displayOrder !== '') {
      const orderCheck = validateDisplayOrder(displayOrder);
      if (!orderCheck.valid) {
        return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, orderCheck.message, ERROR_CODES.INVALID_INPUT);
      }
      slider.displayOrder = Number(displayOrder);
    }
    if (placement !== undefined && placement !== null && placement !== '') {
      const placementCheck = validatePlacement(placement);
      if (!placementCheck.valid) {
        return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, placementCheck.message, ERROR_CODES.INVALID_INPUT);
      }
      slider.placement = placementCheck.placement;
    }

    slider.image = image;
    slider.mobileImage = mobileImage;

    if (slider.isActive) {
      if (!slider.placement || !PLACEMENTS.includes(slider.placement)) {
        return sendErrorResponse(
          res,
          HTTP_STATUS.BAD_REQUEST,
          'placement is required (hero, promo1, or promo2) for an active slider.',
          ERROR_CODES.INVALID_INPUT
        );
      }
      const imagesCheck = assertActiveHasBothImages(true, slider.image, slider.mobileImage);
      if (!imagesCheck.ok) {
        return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, imagesCheck.message, ERROR_CODES.INVALID_INPUT);
      }
      const orderCheck = await assertUniqueActiveOrderInPlacement(
        slider.placement,
        slider.displayOrder,
        slider._id
      );
      if (!orderCheck.ok) {
        return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, orderCheck.message, ERROR_CODES.INVALID_INPUT);
      }
    }

    await slider.save();
    invalidateHomepageBundleCache();
    sendSuccessResponse(res, HTTP_STATUS.OK, 'Slider updated successfully', { slider });
  } catch (err) {
    console.error('Error updating slider:', err);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, 'Failed to update slider', ERROR_CODES.INTERNAL_SERVER_ERROR, { error: err.message });
  }
};

// Delete a banner
exports.deleteSlider = async (req, res) => {
  try {
    const config = getConfig();
    const slider = await Slider.findById(req.params.id);

    if (!slider) {
      return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, 'Slider not found', ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    await deleteSliderMedia(slider.image, config.SLIDER_UPLOAD_PATH);
    await deleteSliderMedia(slider.mobileImage, config.SLIDER_UPLOAD_PATH);

    await slider.deleteOne();
    invalidateHomepageBundleCache();
    sendSuccessResponse(res, HTTP_STATUS.OK, 'Slider deleted successfully');
  } catch (err) {
    console.error('Error deleting slider:', err);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, 'Failed to delete slider', ERROR_CODES.INTERNAL_SERVER_ERROR, { error: err.message });
  }
};

module.exports.validateButtonLink = validateButtonLink;
module.exports.validatePlacement = validatePlacement;
module.exports.assertUniqueActiveOrderInPlacement = assertUniqueActiveOrderInPlacement;
module.exports.assertActiveHasBothImages = assertActiveHasBothImages;
/** @deprecated Use assertUniqueActiveOrderInPlacement — kept for any residual imports. */
module.exports.assertUniqueActiveSlot = async (displayOrder, excludeId = null) =>
  assertUniqueActiveOrderInPlacement(undefined, displayOrder, excludeId);
