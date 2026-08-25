const BannerSettings = require('../models/bannerSettingsModel');
const Translation = require('../models/Translation');
const cache = require('../utils/cache');
const { sendErrorResponse, sendSuccessResponse, ERROR_MESSAGES, ERROR_CODES, HTTP_STATUS } = require('../utils/errorHandler');

exports.getBannerSettings = async (req, res) => {
  try {
    let settings = await BannerSettings.findOne().lean();
    const locale = req.query.locale;
    if (locale && locale !== 'en' && settings) {
      const tr = await Translation.findOne({ model: 'BannerSettings', documentId: settings._id, locale }).lean();
      if (tr && tr.fields) {
        const fields = tr.fields instanceof Map ? Object.fromEntries(tr.fields) : tr.fields;
        if (fields.sectionTitle != null) settings.sectionTitle = fields.sectionTitle;
        const offers = settings.offers || [];
        offers.forEach((offer, i) => {
          if (fields[`${i}_heading`] != null) offer.heading = fields[`${i}_heading`];
          if (fields[`${i}_text`] != null) offer.text = fields[`${i}_text`];
          if (fields[`${i}_buttonText`] != null) offer.buttonText = fields[`${i}_buttonText`];
        });
      }
    }
    sendSuccessResponse(res, HTTP_STATUS.OK, 'Banner settings retrieved successfully', settings);
  } catch (error) {
    console.error('Error fetching banner settings:', error);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, 'Error fetching banner settings', ERROR_CODES.INTERNAL_SERVER_ERROR, { error: error.message });
  }
};

exports.updateBannerSettings = async (req, res) => {
  try {
    console.log('📝 Updating banner settings...');
    console.log('Request body keys:', Object.keys(req.body || {}));
    console.log('Request files keys:', Object.keys(req.files || {}));
    
    let settings = await BannerSettings.findOne();
    if (!settings) {
      settings = new BannerSettings({});
    }

    // Handle R2 URLs (full URLs) vs local filenames for background image
    if (req.files?.backgroundImage?.[0]) {
      const file = req.files.backgroundImage[0];
      // R2 upload middleware stores full URL in file.filename
      settings.backgroundImage = file.filename;
      console.log('✅ Background image uploaded:', file.filename);
    } else if (req.body.clearBackgroundImage === 'true') {
      // Clear background image if explicitly requested
      settings.backgroundImage = '';
      console.log('✅ Background image cleared');
    } else if (req.body.currentBackgroundImageUrl) {
      settings.backgroundImage = req.body.currentBackgroundImageUrl;
      console.log('✅ Using existing background image URL');
    } else {
      // Don't clear if there's already an image - preserve existing
      if (!settings.backgroundImage) {
        settings.backgroundImage = '';
      }
    }

    // Process offer images – original 4-offer banner
    const SLOT_COUNT = 4;
    const existingOffers = Array.isArray(settings.offers) ? settings.offers : [];
    const offers = [];
    for (let i = 0; i < SLOT_COUNT; i++) {
      const existing = existingOffers[i] || {};
      const offer = {
        image: existing.image || '',
        heading: (existing.heading || '').trim(),
        text: (existing.text || '').trim(),
        buttonText: (existing.buttonText || '').trim(),
        link: (existing.link || '').trim(),
      };

      if (req.files?.[`offer_image_${i}`]?.[0]) {
        offer.image = req.files[`offer_image_${i}`][0].filename;
      } else if (req.body[`offer_clearImage_${i}`] === 'true') {
        offer.image = '';
      } else if (req.body[`offer_currentImageUrl_${i}`]) {
        offer.image = req.body[`offer_currentImageUrl_${i}`];
      }

      offer.heading = (req.body[`offer_heading_${i}`] !== undefined ? req.body[`offer_heading_${i}`] : existing.heading || '').trim();
      offer.text = (req.body[`offer_text_${i}`] !== undefined ? req.body[`offer_text_${i}`] : existing.text || '').trim();
      offer.buttonText = (req.body[`offer_buttonText_${i}`] !== undefined ? req.body[`offer_buttonText_${i}`] : existing.buttonText || '').trim();
      offer.link = (req.body[`offer_link_${i}`] !== undefined ? req.body[`offer_link_${i}`] : existing.link || '').trim();

      offers.push(offer);
    }
    settings.offers = offers;

    if (req.body.sectionTitle !== undefined) {
      settings.sectionTitle = (req.body.sectionTitle || '').trim();
    }

    // Grid layout: 1, 2, or 4
    if (req.body.gridLayout !== undefined && req.body.gridLayout !== null && req.body.gridLayout !== '') {
      const gridLayout = parseInt(req.body.gridLayout, 10);
      if (!isNaN(gridLayout) && [1, 2, 4].includes(gridLayout)) {
        settings.gridLayout = gridLayout;
      }
    } else if (!settings.gridLayout) {
      settings.gridLayout = 4;
    }

    await settings.save();
    cache.keys()
      .filter((k) => k.startsWith('homepage-bundle-'))
      .forEach((k) => cache.del(k));
    console.log('✅ Banner settings saved successfully');
    sendSuccessResponse(res, HTTP_STATUS.OK, 'Banner settings updated successfully', settings);
  } catch (error) {
    console.error('❌ Error updating banner settings:', error);
    console.error('Error stack:', error.stack);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, 'Error updating banner settings', ERROR_CODES.INTERNAL_SERVER_ERROR, { error: error.message });
  }
};