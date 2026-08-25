/**
 * Bulk Discount Calculation Engine
 * 
 * This utility provides comprehensive bulk discount calculation functionality
 * for the multi-vendor ecommerce system. It handles tiered pricing logic,
 * quantity threshold validation, and accurate discount calculations.
 */

/**
 * Calculate bulk discount for a given product and quantity
 * @param {Object} product - Product object with bulk discount configuration
 * @param {number} quantity - Quantity to calculate discount for
 * @param {number} baseUnitPrice - Required base unit price (variant price when variants exist, product price otherwise)
 * @returns {Object} - Discount calculation result
 */
function calculateBulkDiscount(product, quantity, baseUnitPrice) {
  // Validate inputs
  if (!product || typeof quantity !== 'number' || quantity < 1) {
    return {
      success: false,
      error: 'Invalid product or quantity',
      originalPrice: 0,
      discountedPrice: 0,
      discount: 0,
      savings: 0,
      savingsPercentage: 0,
      applicableTier: null
    };
  }

  // Validate baseUnitPrice - required parameter
  if (typeof baseUnitPrice !== 'number' || baseUnitPrice < 0) {
    console.error('❌ calculateBulkDiscount: baseUnitPrice is required and must be a non-negative number', {
      productId: product._id || product.id,
      productName: product.name,
      baseUnitPrice
    });
    return {
      success: false,
      error: 'baseUnitPrice is required and must be a non-negative number',
      originalPrice: 0,
      discountedPrice: 0,
      discount: 0,
      savings: 0,
      savingsPercentage: 0,
      applicableTier: null
    };
  }

  // Check if bulk discount is enabled
  if (!product.bulkDiscount?.enabled || !product.bulkDiscount?.tiers || product.bulkDiscount.tiers.length === 0) {
    return {
      success: true,
      originalPrice: baseUnitPrice,
      discountedPrice: baseUnitPrice,
      discount: 0,
      savings: 0,
      savingsPercentage: 0,
      applicableTier: null,
      message: 'No bulk discount configured'
    };
  }

  // Find applicable tier
  const applicableTier = findApplicableTier(product.bulkDiscount.tiers, quantity);
  
  if (!applicableTier) {
    return {
      success: true,
      originalPrice: baseUnitPrice,
      discountedPrice: baseUnitPrice,
      discount: 0,
      savings: 0,
      savingsPercentage: 0,
      applicableTier: null,
      message: 'No applicable tier found for this quantity'
    };
  }

  // Calculate discount using baseUnitPrice (variant price when variants exist)
  const originalPrice = baseUnitPrice;
  const discountedPrice = calculateTierPrice(originalPrice, applicableTier);
  const savings = originalPrice - discountedPrice;
  const savingsPercentage = (savings / originalPrice) * 100;

  return {
    success: true,
    originalPrice,
    discountedPrice,
    discount: applicableTier.discountValue,
    discountType: applicableTier.discountType,
    savings,
    savingsPercentage,
    applicableTier,
    quantity,
    totalSavings: savings * quantity,
    totalPrice: discountedPrice * quantity
  };
}

/**
 * Find the applicable tier for a given quantity
 * @param {Array} tiers - Array of discount tiers
 * @param {number} quantity - Quantity to find tier for
 * @returns {Object|null} - Applicable tier or null
 */
function findApplicableTier(tiers, quantity) {
  if (!tiers || tiers.length === 0) {
    return null;
  }

  // Sort tiers by minQuantity to ensure proper order
  const sortedTiers = [...tiers].sort((a, b) => a.minQuantity - b.minQuantity);

  // Find the tier that matches the quantity
  for (const tier of sortedTiers) {
    const meetsMin = quantity >= tier.minQuantity;
    const meetsMax = !tier.maxQuantity || quantity <= tier.maxQuantity;
    
    if (meetsMin && meetsMax) {
      return tier;
    }
  }

  return null;
}

/**
 * Calculate the price for a specific tier
 * @param {number} originalPrice - Original product price
 * @param {Object} tier - Discount tier configuration
 * @returns {number} - Calculated price after discount
 */
function calculateTierPrice(originalPrice, tier) {
  if (!tier || !tier.discountType || typeof tier.discountValue !== 'number') {
    return originalPrice;
  }

  switch (tier.discountType) {
    case 'percentage':
      return originalPrice * (1 - tier.discountValue / 100);
    case 'fixed':
      return Math.max(0, originalPrice - tier.discountValue);
    default:
      return originalPrice;
  }
}

/**
 * Validate bulk discount configuration
 * @param {Object} bulkDiscount - Bulk discount configuration
 * @param {number} regularPrice - Regular product price
 * @returns {Object} - Validation result
 */
function validateBulkDiscountConfig(bulkDiscount, regularPrice) {
  const errors = [];
  const warnings = [];

  if (!bulkDiscount) {
    return { isValid: true, errors: [], warnings: [] };
  }

  if (bulkDiscount.enabled) {
    if (!bulkDiscount.tiers || bulkDiscount.tiers.length === 0) {
      errors.push('Bulk discount is enabled but no tiers are configured');
      return { isValid: false, errors, warnings };
    }

    // Sort tiers by minQuantity
    const sortedTiers = [...bulkDiscount.tiers].sort((a, b) => a.minQuantity - b.minQuantity);

    for (let i = 0; i < sortedTiers.length; i++) {
      const tier = sortedTiers[i];
      const tierNum = i + 1;

      // Validate required fields
      if (typeof tier.minQuantity !== 'number' || tier.minQuantity < 1) {
        errors.push(`Tier ${tierNum}: minQuantity must be a positive number`);
      }

      if (tier.maxQuantity && (typeof tier.maxQuantity !== 'number' || tier.maxQuantity < 1)) {
        errors.push(`Tier ${tierNum}: maxQuantity must be a positive number`);
      }

      if (!tier.discountType || !['percentage', 'fixed'].includes(tier.discountType)) {
        errors.push(`Tier ${tierNum}: discountType must be 'percentage' or 'fixed'`);
      }

      if (typeof tier.discountValue !== 'number' || tier.discountValue < 0) {
        errors.push(`Tier ${tierNum}: discountValue must be a non-negative number`);
      }

      // Validate tier logic
      if (tier.maxQuantity && tier.minQuantity >= tier.maxQuantity) {
        errors.push(`Tier ${tierNum}: minQuantity must be less than maxQuantity`);
      }

      if (tier.discountType === 'percentage' && tier.discountValue > 100) {
        errors.push(`Tier ${tierNum}: Percentage discount cannot exceed 100%`);
      }

      if (tier.discountType === 'fixed' && tier.discountValue >= regularPrice) {
        errors.push(`Tier ${tierNum}: Fixed discount cannot exceed regular price`);
      }

      // Check for overlapping ranges
      if (i > 0) {
        const prevTier = sortedTiers[i - 1];
        if (prevTier.maxQuantity && tier.minQuantity <= prevTier.maxQuantity) {
          errors.push(`Tier ${tierNum}: Quantity ranges cannot overlap with previous tier`);
        }
      }

      // Check for gaps in ranges
      if (i > 0) {
        const prevTier = sortedTiers[i - 1];
        const prevMax = prevTier.maxQuantity || prevTier.minQuantity;
        if (tier.minQuantity > prevMax + 1) {
          warnings.push(`Tier ${tierNum}: Gap in quantity ranges (${prevMax + 1} to ${tier.minQuantity - 1})`);
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Get bulk discount tiers information for display
 * @param {Object} product - Product object with bulk discount configuration
 * @returns {Array} - Array of tier information for display
 */
function getBulkDiscountTiersInfo(product) {
  if (!product?.bulkDiscount?.enabled || !product.bulkDiscount?.tiers) {
    return [];
  }

  // Note: getBulkDiscountTiersInfo uses product.regularPrice for display purposes
  // This is acceptable as it's for informational display, not actual calculation
  const displayPrice = product.regularPrice || product.salePrice || 0;
  
  return product.bulkDiscount.tiers
    .sort((a, b) => a.minQuantity - b.minQuantity)
    .map(tier => {
      const discountedPrice = calculateTierPrice(displayPrice, tier);
      const savings = displayPrice - discountedPrice;
      const savingsPercentage = (savings / displayPrice) * 100;

      return {
        minQuantity: tier.minQuantity,
        maxQuantity: tier.maxQuantity,
        discountType: tier.discountType,
        discountValue: tier.discountValue,
        originalPrice: displayPrice,
        discountedPrice,
        savings,
        savingsPercentage,
        range: tier.maxQuantity 
          ? `${tier.minQuantity}-${tier.maxQuantity}` 
          : `${tier.minQuantity}+`
      };
    });
}

/**
 * Calculate total order discount for multiple products with bulk pricing
 * @param {Array} orderItems - Array of order items with product and quantity
 * @returns {Object} - Total discount calculation
 */
function calculateOrderBulkDiscount(orderItems) {
  if (!Array.isArray(orderItems) || orderItems.length === 0) {
    return {
      success: false,
      error: 'Invalid order items',
      totalOriginalPrice: 0,
      totalDiscountedPrice: 0,
      totalSavings: 0,
      totalSavingsPercentage: 0,
      itemDiscounts: []
    };
  }

  let totalOriginalPrice = 0;
  let totalDiscountedPrice = 0;
  const itemDiscounts = [];

  for (const item of orderItems) {
    if (!item.product || !item.quantity) {
      continue;
    }

    // Determine base unit price - use variantPriceSnapshot for variant items
    // Variant items MUST have variantPriceSnapshot (set at add-to-cart time)
    let baseUnitPrice = item.product.salePrice || item.product.regularPrice || 0;
    
    // For variant items, variantPriceSnapshot is required (no fallback)
    if (item.variantKey) {
      if (item.variantPriceSnapshot !== null && item.variantPriceSnapshot !== undefined) {
        baseUnitPrice = item.variantPriceSnapshot;
      } else {
        // Variant item missing variantPriceSnapshot - this should not happen
        console.error('❌ calculateOrderBulkDiscount: Variant item missing variantPriceSnapshot', {
          productId: item.product._id,
          productName: item.product.name,
          variantKey: item.variantKey,
          variantCombination: item.variantCombination
        });
        // Skip this item - cannot calculate price without variantPriceSnapshot
        continue;
      }
    }

    if (baseUnitPrice <= 0) {
      console.error('❌ calculateOrderBulkDiscount: Invalid baseUnitPrice for item', {
        productId: item.product._id,
        productName: item.product.name,
        baseUnitPrice,
        variantPriceSnapshot: item.variantPriceSnapshot,
        hasVariantPricing: !!item.product?.variantPricing
      });
      continue;
    }

    const discountResult = calculateBulkDiscount(item.product, item.quantity, baseUnitPrice);
    
    if (discountResult.success) {
      const itemOriginalTotal = baseUnitPrice * item.quantity;
      const itemDiscountedTotal = discountResult.discountedPrice * item.quantity;
      
      totalOriginalPrice += itemOriginalTotal;
      totalDiscountedPrice += itemDiscountedTotal;
      
      itemDiscounts.push({
        productId: item.product._id,
        productName: item.product.name,
        quantity: item.quantity,
        originalPrice: baseUnitPrice,
        discountedPrice: discountResult.discountedPrice,
        originalTotal: itemOriginalTotal,
        discountedTotal: itemDiscountedTotal,
        savings: itemOriginalTotal - itemDiscountedTotal,
        applicableTier: discountResult.applicableTier
      });
    }
  }

  const totalSavings = totalOriginalPrice - totalDiscountedPrice;
  const totalSavingsPercentage = totalOriginalPrice > 0 ? (totalSavings / totalOriginalPrice) * 100 : 0;

  return {
    success: true,
    totalOriginalPrice,
    totalDiscountedPrice,
    totalSavings,
    totalSavingsPercentage,
    itemDiscounts,
    itemCount: itemDiscounts.length
  };
}

module.exports = {
  calculateBulkDiscount,
  findApplicableTier,
  calculateTierPrice,
  validateBulkDiscountConfig,
  getBulkDiscountTiersInfo,
  calculateOrderBulkDiscount
};
