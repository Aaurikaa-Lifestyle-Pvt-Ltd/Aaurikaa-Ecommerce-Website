/**
 * Bulk Discount Validation Middleware
 * 
 * This middleware provides comprehensive validation for bulk discount configurations
 * including rule validation, quantity threshold validation, conflict detection,
 * and data integrity checks.
 */

const { validateBulkDiscountConfig } = require('../utils/bulkDiscountCalculator');
const { sendErrorResponse, ERROR_CODES, HTTP_STATUS } = require('../utils/errorHandler');

/**
 * Enhanced bulk discount validation with conflict detection
 * @param {Object} bulkDiscount - Bulk discount configuration
 * @param {number} regularPrice - Regular product price
 * @param {string} productId - Product ID for conflict checking (optional)
 * @returns {Object} - Enhanced validation result
 */
function validateBulkDiscountWithConflicts(bulkDiscount, regularPrice, productId = null) {
  // Use existing validation as base
  const baseValidation = validateBulkDiscountConfig(bulkDiscount, regularPrice);
  
  const errors = [...baseValidation.errors];
  const warnings = [...baseValidation.warnings];

  // Additional conflict detection
  let pricingConflicts = { errors: [], warnings: [] };
  let thresholdConflicts = { errors: [], warnings: [] };
  let integrityIssues = { errors: [], warnings: [] };

  if (bulkDiscount && bulkDiscount.enabled && bulkDiscount.tiers) {
    // Check for pricing conflicts within tiers
    pricingConflicts = detectPricingConflicts(bulkDiscount.tiers, regularPrice);
    errors.push(...pricingConflicts.errors);
    warnings.push(...pricingConflicts.warnings);

    // Check for quantity threshold conflicts
    thresholdConflicts = detectQuantityThresholdConflicts(bulkDiscount.tiers);
    errors.push(...thresholdConflicts.errors);
    warnings.push(...thresholdConflicts.warnings);

    // Check for data integrity issues
    integrityIssues = checkDataIntegrity(bulkDiscount.tiers, regularPrice);
    errors.push(...integrityIssues.errors);
    warnings.push(...integrityIssues.warnings);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    conflicts: {
      pricing: pricingConflicts.errors || [],
      thresholds: thresholdConflicts.errors || [],
      integrity: integrityIssues.errors || []
    }
  };
}

/**
 * Detect pricing conflicts within bulk discount tiers
 * @param {Array} tiers - Array of discount tiers
 * @param {number} regularPrice - Regular product price
 * @returns {Object} - Conflict detection result
 */
function detectPricingConflicts(tiers, regularPrice) {
  const errors = [];
  const warnings = [];

  if (!tiers || tiers.length === 0) {
    return { errors, warnings };
  }

  // Sort tiers by minQuantity
  const sortedTiers = [...tiers].sort((a, b) => a.minQuantity - b.minQuantity);

  for (let i = 0; i < sortedTiers.length; i++) {
    const tier = sortedTiers[i];
    const tierNum = i + 1;

    // Calculate tier price
    let tierPrice;
    if (tier.discountType === 'percentage') {
      tierPrice = regularPrice * (1 - tier.discountValue / 100);
    } else {
      tierPrice = regularPrice - tier.discountValue;
    }

    // Check for negative pricing
    if (tierPrice < 0) {
      errors.push(`Tier ${tierNum}: Calculated price cannot be negative (${tierPrice})`);
    }

    // Check for zero pricing
    if (tierPrice === 0) {
      warnings.push(`Tier ${tierNum}: Calculated price is zero - consider minimum price limits`);
    }

    // Check for excessive discounts
    if (tier.discountType === 'percentage' && tier.discountValue > 90) {
      warnings.push(`Tier ${tierNum}: Very high discount (${tier.discountValue}%) - ensure profitability`);
    }

    if (tier.discountType === 'fixed' && tier.discountValue > regularPrice * 0.8) {
      warnings.push(`Tier ${tierNum}: Very high fixed discount (${tier.discountValue}) - ensure profitability`);
    }

    // Check for pricing progression (higher quantities should have better prices)
    if (i > 0) {
      const prevTier = sortedTiers[i - 1];
      let prevTierPrice;
      if (prevTier.discountType === 'percentage') {
        prevTierPrice = regularPrice * (1 - prevTier.discountValue / 100);
      } else {
        prevTierPrice = Math.max(0, regularPrice - prevTier.discountValue);
      }

      if (tierPrice > prevTierPrice) {
        errors.push(`Tier ${tierNum}: Price (${tierPrice}) should not be higher than previous tier (${prevTierPrice})`);
      }
    }
  }

  return { errors, warnings };
}

/**
 * Detect quantity threshold conflicts
 * @param {Array} tiers - Array of discount tiers
 * @returns {Object} - Threshold conflict detection result
 */
function detectQuantityThresholdConflicts(tiers) {
  const errors = [];
  const warnings = [];

  if (!tiers || tiers.length === 0) {
    return { errors, warnings };
  }

  // Sort tiers by minQuantity
  const sortedTiers = [...tiers].sort((a, b) => a.minQuantity - b.minQuantity);

  for (let i = 0; i < sortedTiers.length; i++) {
    const tier = sortedTiers[i];
    const tierNum = i + 1;

    // Check for unreasonable quantity thresholds
    if (tier.minQuantity > 1000) {
      warnings.push(`Tier ${tierNum}: Very high minimum quantity (${tier.minQuantity}) - may limit customer adoption`);
    }

    if (tier.maxQuantity && tier.maxQuantity > 10000) {
      warnings.push(`Tier ${tierNum}: Very high maximum quantity (${tier.maxQuantity}) - consider practical limits`);
    }

    // Check for gaps in quantity ranges
    if (i > 0) {
      const prevTier = sortedTiers[i - 1];
      const gap = tier.minQuantity - (prevTier.maxQuantity || prevTier.minQuantity);
      
      if (gap > 1) {
        warnings.push(`Tier ${tierNum}: Gap in quantity ranges (${prevTier.maxQuantity || prevTier.minQuantity} to ${tier.minQuantity})`);
      }
    }

    // Check for overlapping ranges (should be caught by base validation, but double-check)
    if (i > 0) {
      const prevTier = sortedTiers[i - 1];
      if (prevTier.maxQuantity && tier.minQuantity <= prevTier.maxQuantity) {
        errors.push(`Tier ${tierNum}: Quantity ranges overlap with previous tier`);
      }
    }
  }

  return { errors, warnings };
}

/**
 * Check data integrity for bulk discount tiers
 * @param {Array} tiers - Array of discount tiers
 * @param {number} regularPrice - Regular product price
 * @returns {Object} - Data integrity check result
 */
function checkDataIntegrity(tiers, regularPrice) {
  const errors = [];
  const warnings = [];

  if (!tiers || tiers.length === 0) {
    return { errors, warnings };
  }

  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    const tierNum = i + 1;

    // Check for missing required fields
    if (tier.minQuantity === undefined || tier.minQuantity === null) {
      errors.push(`Tier ${tierNum}: minQuantity is required`);
    }

    if (!tier.discountType) {
      errors.push(`Tier ${tierNum}: discountType is required`);
    }

    if (tier.discountValue === undefined || tier.discountValue === null) {
      errors.push(`Tier ${tierNum}: discountValue is required`);
    }

    // Check for invalid data types
    if (typeof tier.minQuantity !== 'number') {
      errors.push(`Tier ${tierNum}: minQuantity must be a number`);
    }

    if (tier.maxQuantity !== undefined && typeof tier.maxQuantity !== 'number') {
      errors.push(`Tier ${tierNum}: maxQuantity must be a number`);
    }

    if (typeof tier.discountValue !== 'number') {
      errors.push(`Tier ${tierNum}: discountValue must be a number`);
    }

    // Check for invalid discount types
    if (tier.discountType && !['percentage', 'fixed'].includes(tier.discountType)) {
      errors.push(`Tier ${tierNum}: discountType must be 'percentage' or 'fixed'`);
    }

    // Check for negative values
    if (tier.minQuantity < 0) {
      errors.push(`Tier ${tierNum}: minQuantity cannot be negative`);
    }

    if (tier.maxQuantity !== undefined && tier.maxQuantity < 0) {
      errors.push(`Tier ${tierNum}: maxQuantity cannot be negative`);
    }

    if (tier.discountValue < 0) {
      errors.push(`Tier ${tierNum}: discountValue cannot be negative`);
    }

    // Check for reasonable limits
    if (tier.discountType === 'percentage' && tier.discountValue > 100) {
      errors.push(`Tier ${tierNum}: Percentage discount cannot exceed 100%`);
    }

    if (tier.discountType === 'fixed' && tier.discountValue > regularPrice) {
      errors.push(`Tier ${tierNum}: Fixed discount cannot exceed regular price`);
    }
  }

  return { errors, warnings };
}

/**
 * Middleware to validate bulk discount configuration
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const validateBulkDiscount = (req, res, next) => {
  try {
    const { bulkDiscount, regularPrice, productId } = req.body;

    // Validate regular price
    if (typeof regularPrice !== 'number' || regularPrice <= 0) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        'Invalid regular price',
        ERROR_CODES.VALIDATION_FAILED,
        { errors: ['Regular price must be a positive number'] }
      );
    }

    // Perform enhanced validation
    const validation = validateBulkDiscountWithConflicts(bulkDiscount, regularPrice, productId);

    if (!validation.isValid) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        'Bulk discount validation failed',
        ERROR_CODES.VALIDATION_FAILED,
        { 
          errors: validation.errors,
          warnings: validation.warnings,
          conflicts: validation.conflicts
        }
      );
    }

    // Add validation result to request for potential use in controllers
    req.bulkDiscountValidation = {
      isValid: validation.isValid,
      warnings: validation.warnings,
      conflicts: validation.conflicts
    };

    next();
  } catch (error) {
    console.error('❌ Bulk discount validation middleware error:', error);
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Internal server error during bulk discount validation',
      ERROR_CODES.INTERNAL_SERVER_ERROR
    );
  }
};

/**
 * Middleware to validate bulk discount for product creation/update
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const validateBulkDiscountForProduct = (req, res, next) => {
  try {
    const { bulkDiscount, regularPrice } = req.body;
    const productId = req.params.id || req.body._id;

    // If no bulk discount provided, skip validation
    if (!bulkDiscount) {
      return next();
    }

    // Validate regular price
    if (typeof regularPrice !== 'number' || regularPrice <= 0) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        'Invalid regular price',
        ERROR_CODES.VALIDATION_FAILED,
        { errors: ['Regular price must be a positive number'] }
      );
    }

    // Perform enhanced validation
    const validation = validateBulkDiscountWithConflicts(bulkDiscount, regularPrice, productId);

    if (!validation.isValid) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        'Bulk discount validation failed',
        ERROR_CODES.VALIDATION_FAILED,
        { 
          errors: validation.errors,
          warnings: validation.warnings,
          conflicts: validation.conflicts
        }
      );
    }

    // Add validation result to request
    req.bulkDiscountValidation = {
      isValid: validation.isValid,
      warnings: validation.warnings,
      conflicts: validation.conflicts
    };

    next();
  } catch (error) {
    console.error('❌ Bulk discount product validation middleware error:', error);
    return sendErrorResponse(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Internal server error during bulk discount validation',
      ERROR_CODES.INTERNAL_SERVER_ERROR
    );
  }
};

/**
 * Utility function to validate bulk discount configuration
 * @param {Object} bulkDiscount - Bulk discount configuration
 * @param {number} regularPrice - Regular product price
 * @param {string} productId - Product ID (optional)
 * @returns {Object} - Validation result
 */
const validateBulkDiscountConfigUtil = (bulkDiscount, regularPrice, productId = null) => {
  return validateBulkDiscountWithConflicts(bulkDiscount, regularPrice, productId);
};

module.exports = {
  validateBulkDiscount,
  validateBulkDiscountForProduct,
  validateBulkDiscountConfig: validateBulkDiscountConfigUtil,
  validateBulkDiscountWithConflicts,
  detectPricingConflicts,
  detectQuantityThresholdConflicts,
  checkDataIntegrity
};
