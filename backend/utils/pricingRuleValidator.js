/**
 * Pricing Rule Validator
 * 
 * This utility provides comprehensive validation for pricing rules including
 * bulk discount configurations, quantity thresholds, conflict detection,
 * and data integrity validation.
 */

const { validateBulkDiscountConfig } = require('./bulkDiscountCalculator');

/**
 * Enhanced validation result structure
 * @typedef {Object} ValidationResult
 * @property {boolean} isValid - Whether the configuration is valid
 * @property {Array<string>} errors - Array of error messages
 * @property {Array<string>} warnings - Array of warning messages
 * @property {Object} conflicts - Object containing conflict details
 * @property {Object} suggestions - Object containing improvement suggestions
 */

/**
 * Comprehensive pricing rule validator
 * @param {Object} pricingRule - Pricing rule configuration
 * @param {Object} options - Validation options
 * @returns {ValidationResult} - Comprehensive validation result
 */
function validatePricingRule(pricingRule, options = {}) {
  const {
    regularPrice = 0,
    productId = null,
    strictMode = false,
    includeSuggestions = true
  } = options;

  const result = {
    isValid: true,
    errors: [],
    warnings: [],
    conflicts: {
      pricing: [],
      thresholds: [],
      integrity: [],
      business: []
    },
    suggestions: []
  };

  // Validate basic structure
  if (!pricingRule) {
    return result; // No rule is valid
  }

  // Validate bulk discount if present
  if (pricingRule.bulkDiscount) {
    const bulkValidation = validateBulkDiscountConfig(pricingRule.bulkDiscount, regularPrice);
    
    if (!bulkValidation.isValid) {
      result.isValid = false;
      result.errors.push(...bulkValidation.errors);
    }
    
    result.warnings.push(...bulkValidation.warnings);

    // Enhanced validation for bulk discounts
    if (pricingRule.bulkDiscount.enabled) {
      const enhancedValidation = validateBulkDiscountEnhanced(pricingRule.bulkDiscount, regularPrice, strictMode);
      
      if (!enhancedValidation.isValid) {
        result.isValid = false;
        result.errors.push(...enhancedValidation.errors);
      }
      
      result.warnings.push(...enhancedValidation.warnings);
      result.conflicts = { ...result.conflicts, ...enhancedValidation.conflicts };
      
      if (includeSuggestions) {
        result.suggestions.push(...enhancedValidation.suggestions);
      }
    }
  }

  // Validate other pricing rules if present
  if (pricingRule.coupons) {
    const couponValidation = validateCouponRules(pricingRule.coupons, regularPrice);
    if (!couponValidation.isValid) {
      result.isValid = false;
      result.errors.push(...couponValidation.errors);
    }
    result.warnings.push(...couponValidation.warnings);
  }

  if (pricingRule.specialOffers) {
    const offerValidation = validateSpecialOffers(pricingRule.specialOffers, regularPrice);
    if (!offerValidation.isValid) {
      result.isValid = false;
      result.errors.push(...offerValidation.errors);
    }
    result.warnings.push(...offerValidation.warnings);
  }

  return result;
}

/**
 * Enhanced bulk discount validation
 * @param {Object} bulkDiscount - Bulk discount configuration
 * @param {number} regularPrice - Regular product price
 * @param {boolean} strictMode - Whether to use strict validation
 * @returns {ValidationResult} - Enhanced validation result
 */
function validateBulkDiscountEnhanced(bulkDiscount, regularPrice, strictMode = false) {
  const result = {
    isValid: true,
    errors: [],
    warnings: [],
    conflicts: {
      pricing: [],
      thresholds: [],
      integrity: [],
      business: []
    },
    suggestions: []
  };

  if (!bulkDiscount || !bulkDiscount.enabled || !bulkDiscount.tiers) {
    return result;
  }

  const tiers = bulkDiscount.tiers;
  const sortedTiers = [...tiers].sort((a, b) => a.minQuantity - b.minQuantity);

  // Validate tier progression and business logic
  for (let i = 0; i < sortedTiers.length; i++) {
    const tier = sortedTiers[i];
    const tierNum = i + 1;

    // Business logic validation
    const businessValidation = validateBusinessLogic(tier, regularPrice, tierNum, strictMode);
    if (!businessValidation.isValid) {
      result.isValid = false;
      result.errors.push(...businessValidation.errors);
    }
    result.warnings.push(...businessValidation.warnings);
    result.conflicts.business.push(...businessValidation.conflicts);
    result.suggestions.push(...businessValidation.suggestions);

    // Pricing progression validation
    if (i > 0) {
      const progressionValidation = validatePricingProgression(sortedTiers[i - 1], tier, regularPrice, tierNum);
      if (!progressionValidation.isValid) {
        result.isValid = false;
        result.errors.push(...progressionValidation.errors);
      }
      result.warnings.push(...progressionValidation.warnings);
      result.conflicts.pricing.push(...progressionValidation.conflicts);
    }
  }

  // Validate overall tier structure
  const structureValidation = validateTierStructure(sortedTiers, regularPrice);
  if (!structureValidation.isValid) {
    result.isValid = false;
    result.errors.push(...structureValidation.errors);
  }
  result.warnings.push(...structureValidation.warnings);
  result.conflicts.thresholds.push(...structureValidation.conflicts);

  return result;
}

/**
 * Validate business logic for a tier
 * @param {Object} tier - Tier configuration
 * @param {number} regularPrice - Regular product price
 * @param {number} tierNum - Tier number
 * @param {boolean} strictMode - Whether to use strict validation
 * @returns {Object} - Business logic validation result
 */
function validateBusinessLogic(tier, regularPrice, tierNum, strictMode) {
  const result = {
    isValid: true,
    errors: [],
    warnings: [],
    conflicts: [],
    suggestions: []
  };

  // Calculate tier price
  let tierPrice;
  if (tier.discountType === 'percentage') {
    tierPrice = regularPrice * (1 - tier.discountValue / 100);
  } else {
    tierPrice = Math.max(0, regularPrice - tier.discountValue);
  }

  // Profitability checks
  const profitMargin = (tierPrice - (regularPrice * 0.3)) / tierPrice; // Assuming 30% cost
  if (profitMargin < 0.1) { // Less than 10% profit margin
    result.warnings.push(`Tier ${tierNum}: Low profit margin (${(profitMargin * 100).toFixed(1)}%) - consider adjusting discount`);
    result.suggestions.push(`Consider reducing discount to maintain profitability`);
  }

  // Quantity threshold reasonableness
  if (tier.minQuantity > 100) {
    result.warnings.push(`Tier ${tierNum}: High minimum quantity (${tier.minQuantity}) may limit adoption`);
    result.suggestions.push(`Consider lowering minimum quantity or adding intermediate tiers`);
  }

  // Discount reasonableness
  if (tier.discountType === 'percentage' && tier.discountValue > 50) {
    result.warnings.push(`Tier ${tierNum}: High percentage discount (${tier.discountValue}%) - ensure business viability`);
  }

  if (tier.discountType === 'fixed' && tier.discountValue > regularPrice * 0.5) {
    result.warnings.push(`Tier ${tierNum}: High fixed discount (${tier.discountValue}) - ensure business viability`);
  }

  // Strict mode additional checks
  if (strictMode) {
    if (tierPrice < regularPrice * 0.5) {
      result.errors.push(`Tier ${tierNum}: Price too low (${tierPrice}) - may indicate pricing error`);
    }

    if (tier.minQuantity < 2) {
      result.warnings.push(`Tier ${tierNum}: Very low minimum quantity (${tier.minQuantity}) - consider if bulk discount is appropriate`);
    }
  }

  return result;
}

/**
 * Validate pricing progression between tiers
 * @param {Object} prevTier - Previous tier
 * @param {Object} currentTier - Current tier
 * @param {number} regularPrice - Regular product price
 * @param {number} tierNum - Current tier number
 * @returns {Object} - Progression validation result
 */
function validatePricingProgression(prevTier, currentTier, regularPrice, tierNum) {
  const result = {
    isValid: true,
    errors: [],
    warnings: [],
    conflicts: []
  };

  // Calculate prices
  let prevPrice, currentPrice;
  
  if (prevTier.discountType === 'percentage') {
    prevPrice = regularPrice * (1 - prevTier.discountValue / 100);
  } else {
    prevPrice = Math.max(0, regularPrice - prevTier.discountValue);
  }

  if (currentTier.discountType === 'percentage') {
    currentPrice = regularPrice * (1 - currentTier.discountValue / 100);
  } else {
    currentPrice = Math.max(0, regularPrice - currentTier.discountValue);
  }

  // Check if current tier has better pricing
  if (currentPrice >= prevPrice) {
    result.isValid = false;
    result.errors.push(`Tier ${tierNum}: Price (${currentPrice}) should be lower than previous tier (${prevPrice})`);
    result.conflicts.push('Pricing progression violation');
  }

  // Check for reasonable price difference
  const priceDifference = prevPrice - currentPrice;
  const priceDifferencePercentage = (priceDifference / prevPrice) * 100;

  if (priceDifferencePercentage < 2) {
    result.warnings.push(`Tier ${tierNum}: Small price difference (${priceDifferencePercentage.toFixed(1)}%) - consider if tier is necessary`);
  }

  if (priceDifferencePercentage > 50) {
    result.warnings.push(`Tier ${tierNum}: Large price difference (${priceDifferencePercentage.toFixed(1)}%) - ensure business viability`);
  }

  return result;
}

/**
 * Validate tier structure and quantity thresholds
 * @param {Array} sortedTiers - Sorted array of tiers
 * @param {number} regularPrice - Regular product price
 * @returns {Object} - Structure validation result
 */
function validateTierStructure(sortedTiers, regularPrice) {
  const result = {
    isValid: true,
    errors: [],
    warnings: [],
    conflicts: []
  };

  if (sortedTiers.length === 0) {
    return result;
  }

  // Check for gaps in quantity ranges
  for (let i = 1; i < sortedTiers.length; i++) {
    const prevTier = sortedTiers[i - 1];
    const currentTier = sortedTiers[i];
    
    const prevMax = prevTier.maxQuantity || prevTier.minQuantity;
    const gap = currentTier.minQuantity - prevMax;
    
    if (gap > 1) {
      result.warnings.push(`Gap in quantity ranges: ${prevMax} to ${currentTier.minQuantity}`);
    }
  }

  // Check for overlapping ranges
  for (let i = 1; i < sortedTiers.length; i++) {
    const prevTier = sortedTiers[i - 1];
    const currentTier = sortedTiers[i];
    
    if (prevTier.maxQuantity && currentTier.minQuantity <= prevTier.maxQuantity) {
      result.isValid = false;
      result.errors.push(`Tier ${i + 1}: Overlapping quantity ranges with previous tier`);
      result.conflicts.push('Quantity range overlap');
    }
  }

  // Check for reasonable quantity progression
  for (let i = 1; i < sortedTiers.length; i++) {
    const prevTier = sortedTiers[i - 1];
    const currentTier = sortedTiers[i];
    
    const prevMax = prevTier.maxQuantity || prevTier.minQuantity;
    const quantityIncrease = currentTier.minQuantity - prevMax;
    const increasePercentage = (quantityIncrease / prevMax) * 100;
    
    if (increasePercentage > 500) {
      result.warnings.push(`Large quantity jump: ${prevMax} to ${currentTier.minQuantity} (${increasePercentage.toFixed(1)}% increase)`);
    }
  }

  return result;
}

/**
 * Validate coupon rules
 * @param {Array} coupons - Array of coupon configurations
 * @param {number} regularPrice - Regular product price
 * @returns {Object} - Coupon validation result
 */
function validateCouponRules(coupons, regularPrice) {
  const result = {
    isValid: true,
    errors: [],
    warnings: []
  };

  if (!Array.isArray(coupons)) {
    result.isValid = false;
    result.errors.push('Coupons must be an array');
    return result;
  }

  for (let i = 0; i < coupons.length; i++) {
    const coupon = coupons[i];
    const couponNum = i + 1;

    if (!coupon.code || typeof coupon.code !== 'string') {
      result.errors.push(`Coupon ${couponNum}: Code is required and must be a string`);
    }

    if (!coupon.discountType || !['percentage', 'fixed'].includes(coupon.discountType)) {
      result.errors.push(`Coupon ${couponNum}: Invalid discount type`);
    }

    if (typeof coupon.discountValue !== 'number' || coupon.discountValue < 0) {
      result.errors.push(`Coupon ${couponNum}: Invalid discount value`);
    }

    if (coupon.discountType === 'percentage' && coupon.discountValue > 100) {
      result.errors.push(`Coupon ${couponNum}: Percentage discount cannot exceed 100%`);
    }

    if (coupon.discountType === 'fixed' && coupon.discountValue > regularPrice) {
      result.errors.push(`Coupon ${couponNum}: Fixed discount cannot exceed regular price`);
    }
  }

  if (result.errors.length > 0) {
    result.isValid = false;
  }

  return result;
}

/**
 * Validate special offers
 * @param {Array} offers - Array of special offer configurations
 * @param {number} regularPrice - Regular product price
 * @returns {Object} - Offer validation result
 */
function validateSpecialOffers(offers, regularPrice) {
  const result = {
    isValid: true,
    errors: [],
    warnings: []
  };

  if (!Array.isArray(offers)) {
    result.isValid = false;
    result.errors.push('Special offers must be an array');
    return result;
  }

  for (let i = 0; i < offers.length; i++) {
    const offer = offers[i];
    const offerNum = i + 1;

    if (!offer.name || typeof offer.name !== 'string') {
      result.errors.push(`Offer ${offerNum}: Name is required and must be a string`);
    }

    if (!offer.discountType || !['percentage', 'fixed'].includes(offer.discountType)) {
      result.errors.push(`Offer ${offerNum}: Invalid discount type`);
    }

    if (typeof offer.discountValue !== 'number' || offer.discountValue < 0) {
      result.errors.push(`Offer ${offerNum}: Invalid discount value`);
    }

    if (offer.startDate && offer.endDate) {
      const start = new Date(offer.startDate);
      const end = new Date(offer.endDate);
      
      if (start >= end) {
        result.errors.push(`Offer ${offerNum}: Start date must be before end date`);
      }
    }
  }

  if (result.errors.length > 0) {
    result.isValid = false;
  }

  return result;
}

/**
 * Generate pricing rule suggestions based on validation results
 * @param {Object} pricingRule - Pricing rule configuration
 * @param {number} regularPrice - Regular product price
 * @returns {Array<string>} - Array of suggestions
 */
function generatePricingSuggestions(pricingRule, regularPrice) {
  const suggestions = [];

  if (!pricingRule || !pricingRule.bulkDiscount || !pricingRule.bulkDiscount.enabled) {
    return suggestions;
  }

  const tiers = pricingRule.bulkDiscount.tiers;
  if (!tiers || tiers.length === 0) {
    return suggestions;
  }

  // Analyze tier structure
  const sortedTiers = [...tiers].sort((a, b) => a.minQuantity - b.minQuantity);
  
  // Check for gaps
  for (let i = 1; i < sortedTiers.length; i++) {
    const prevTier = sortedTiers[i - 1];
    const currentTier = sortedTiers[i];
    const prevMax = prevTier.maxQuantity || prevTier.minQuantity;
    const gap = currentTier.minQuantity - prevMax;
    
    if (gap > 1) {
      suggestions.push(`Consider adding a tier between ${prevMax} and ${currentTier.minQuantity} to fill the gap`);
    }
  }

  // Check for pricing progression
  for (let i = 1; i < sortedTiers.length; i++) {
    const prevTier = sortedTiers[i - 1];
    const currentTier = sortedTiers[i];
    
    let prevPrice, currentPrice;
    if (prevTier.discountType === 'percentage') {
      prevPrice = regularPrice * (1 - prevTier.discountValue / 100);
    } else {
      prevPrice = Math.max(0, regularPrice - prevTier.discountValue);
    }

    if (currentTier.discountType === 'percentage') {
      currentPrice = regularPrice * (1 - currentTier.discountValue / 100);
    } else {
      currentPrice = Math.max(0, regularPrice - currentTier.discountValue);
    }

    const priceDifference = prevPrice - currentPrice;
    const priceDifferencePercentage = (priceDifference / prevPrice) * 100;

    if (priceDifferencePercentage < 5) {
      suggestions.push(`Consider increasing the discount difference between tier ${i} and tier ${i + 1} to make the progression more meaningful`);
    }
  }

  // Check for high minimum quantities
  const firstTier = sortedTiers[0];
  if (firstTier.minQuantity > 10) {
    suggestions.push(`Consider lowering the minimum quantity for the first tier (currently ${firstTier.minQuantity}) to encourage adoption`);
  }

  return suggestions;
}

module.exports = {
  validatePricingRule,
  validateBulkDiscountEnhanced,
  validateBusinessLogic,
  validatePricingProgression,
  validateTierStructure,
  validateCouponRules,
  validateSpecialOffers,
  generatePricingSuggestions
};
