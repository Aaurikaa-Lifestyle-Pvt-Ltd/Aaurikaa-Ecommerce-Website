const HomepageCategoryConfig = require('../../models/HomepageCategoryConfig');
const Category = require('../../models/Category');
const SubCategory = require('../../models/Subcategory'); // Fixed: filename is Subcategory.js (lowercase 'c')
const ChildCategory = require('../../models/ChildCategory'); // Explicitly import
const { applyTranslations } = require('../../utils/applyTranslations');
const cache = require('../../utils/cache');

// @desc    Save or update homepage category configuration
// @route   POST /api/homepage-categories/admin
// @access  Private/Admin
exports.saveHomepageCategoryConfig = async (req, res) => {
  const { sectionName, sectionType, displayTitle, category, subcategory, childCategory } = req.body;

  // Validate sectionType if provided
  if (sectionType && !['front-page', 'two-row'].includes(sectionType)) {
    return res.status(400).json({ message: 'Invalid sectionType. Must be "front-page" or "two-row"' });
  }

  try {
    const finalSectionType = sectionType || 'front-page';
    const filter = { sectionName, sectionType: finalSectionType };

    // Build update: only set displayTitle when provided (so we don't clear it on update).
    // Never put the same path in both $set and $setOnInsert (MongoDB conflict).
    const setFields = {
      category: category || null,
      subcategory: subcategory || null,
      childCategory: childCategory || null,
    };
    if (displayTitle !== undefined) {
      setFields.displayTitle = displayTitle || '';
    }

    const update = { $set: setFields };
    // On insert only, set displayTitle default when not in $set (avoids ConflictingUpdateOperators)
    if (displayTitle === undefined) {
      update.$setOnInsert = { displayTitle: '' };
    }

    // Atomic update-or-insert: avoids duplicate key by using (sectionName, sectionType) as unique key
    const result = await HomepageCategoryConfig.findOneAndUpdate(
      filter,
      update,
      { new: true, upsert: true, runValidators: true, includeResultMetadata: true }
    );
    const config = result.value;

    ['en', 'bn', 'hi'].forEach((locale) => {
      cache.del(`homepage-bundle-${locale}`);
    });

    if (result.lastErrorObject?.upserted) {
      res.status(201).json(config);
    } else {
      res.json(config);
    }
  } catch (error) {
    console.error('Error saving homepage category config:', error);
    
    // Provide more helpful error messages
    if (error.code === 11000) {
      return res.status(409).json({ 
        message: 'A configuration with this section name and type already exists. Please update the existing configuration instead.',
        error: 'Duplicate key error',
        sectionName,
        sectionType: sectionType || 'front-page'
      });
    }
    
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Get all homepage category configurations
// @route   GET /api/homepage-categories?type=front-page|two-row
// @access  Public
exports.getHomepageCategoryConfigs = async (req, res) => {
  try {
    const { type } = req.query;
    
    // Build query: filter by sectionType if provided
    const query = type && ['front-page', 'two-row'].includes(type)
      ? { sectionType: type }
      : {};

    let configs = await HomepageCategoryConfig.find(query)
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('childCategory', 'name')
      .sort({ sectionType: 1, sectionName: 1 })
      .lean();

    const locale = req.query.locale;
    if (locale && locale !== 'en') {
      configs = await applyTranslations(configs, 'HomepageCategoryConfig', locale, ['displayTitle']);
    }

    // If no type filter, return grouped by type for easier frontend consumption
    if (!type) {
      const grouped = {
        frontPage: configs.filter(c => c.sectionType === 'front-page'),
        twoRow: configs.filter(c => c.sectionType === 'two-row'),
        all: configs // Keep backward compatibility
      };
      return res.json(grouped);
    }

    res.json(configs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};