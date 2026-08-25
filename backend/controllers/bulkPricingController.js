const Product = require('../models/Product');
const { validateBulkDiscountConfig, calculateBulkDiscount } = require('../utils/bulkDiscountCalculator');

/**
 * Bulk Pricing Management Controller
 * 
 * This controller handles bulk pricing management operations including
 * creating, updating, validating, and analyzing bulk pricing rules.
 */

/**
 * Create or update bulk pricing for a product
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const createOrUpdateBulkPricing = async (req, res) => {
  try {
    const { productId } = req.params;
    const { bulkDiscount } = req.body;

    // Validate product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Validate bulk discount configuration
    const validation = validateBulkDiscountConfig(bulkDiscount, product.regularPrice);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid bulk discount configuration',
        errors: validation.errors,
        warnings: validation.warnings
      });
    }

    // Update product with bulk discount configuration
    product.bulkDiscount = bulkDiscount;
    await product.save();

    res.status(200).json({
      success: true,
      message: 'Bulk pricing updated successfully',
      product: {
        _id: product._id,
        name: product.name,
        regularPrice: product.regularPrice,
        bulkDiscount: product.bulkDiscount
      },
      warnings: validation.warnings
    });

  } catch (error) {
    console.error('Error creating/updating bulk pricing:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

/**
 * Get bulk pricing configuration for a product
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getBulkPricing = async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await Product.findOne({
      _id: productId,
      status: 'published',
      approvalStatus: 'approved'
    }).select('_id name regularPrice bulkDiscount');
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.status(200).json({
      success: true,
      product: {
        _id: product._id,
        name: product.name,
        regularPrice: product.regularPrice,
        bulkDiscount: product.bulkDiscount
      }
    });

  } catch (error) {
    console.error('Error fetching bulk pricing:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

/**
 * Delete bulk pricing for a product
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const deleteBulkPricing = async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Reset bulk discount to disabled
    product.bulkDiscount = {
      enabled: false,
      tiers: []
    };
    await product.save();

    res.status(200).json({
      success: true,
      message: 'Bulk pricing deleted successfully',
      product: {
        _id: product._id,
        name: product.name,
        regularPrice: product.regularPrice,
        bulkDiscount: product.bulkDiscount
      }
    });

  } catch (error) {
    console.error('Error deleting bulk pricing:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

/**
 * Validate bulk pricing configuration
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const validateBulkPricing = async (req, res) => {
  try {
    const { bulkDiscount, regularPrice } = req.body;

    if (typeof regularPrice !== 'number' || regularPrice <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid regular price',
        errors: ['Regular price must be a positive number']
      });
    }

    const validation = validateBulkDiscountConfig(bulkDiscount, regularPrice);

    res.status(200).json({
      success: true,
      validation: {
        isValid: validation.isValid,
        errors: validation.errors,
        warnings: validation.warnings
      }
    });

  } catch (error) {
    console.error('Error validating bulk pricing:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

/**
 * Get bulk pricing analytics for a product
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getBulkPricingAnalytics = async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await Product.findOne({
      _id: productId,
      status: 'published',
      approvalStatus: 'approved'
    });
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    if (!product.bulkDiscount?.enabled || !product.bulkDiscount?.tiers) {
      return res.status(200).json({
        success: true,
        analytics: {
          hasBulkPricing: false,
          message: 'No bulk pricing configured for this product'
        }
      });
    }

    // Calculate analytics for each tier
    // Use product price as baseUnitPrice for display purposes (not variant-specific)
    const baseUnitPrice = product.salePrice || product.regularPrice || 0;
    const tierAnalytics = product.bulkDiscount.tiers.map(tier => {
      const maxQuantity = tier.maxQuantity || 999999; // Use large number for unlimited
      const discountResult = calculateBulkDiscount(product, tier.minQuantity, baseUnitPrice);
      const pricePerUnit = discountResult.discountedPrice;
      const savingsPerUnit = baseUnitPrice - pricePerUnit;
      const savingsPercentage = (savingsPerUnit / baseUnitPrice) * 100;

      return {
        tier: {
          minQuantity: tier.minQuantity,
          maxQuantity: tier.maxQuantity,
          discountType: tier.discountType,
          discountValue: tier.discountValue
        },
        pricePerUnit,
        savingsPerUnit,
        savingsPercentage,
        quantityRange: tier.maxQuantity 
          ? `${tier.minQuantity}-${tier.maxQuantity}` 
          : `${tier.minQuantity}+`
      };
    });

    // Calculate overall analytics
    const totalTiers = product.bulkDiscount.tiers.length;
    const maxDiscount = Math.max(...product.bulkDiscount.tiers.map(tier => {
      if (tier.discountType === 'percentage') {
        return tier.discountValue;
      } else {
        return (tier.discountValue / product.regularPrice) * 100;
      }
    }));

    res.status(200).json({
      success: true,
      analytics: {
        hasBulkPricing: true,
        product: {
          _id: product._id,
          name: product.name,
          regularPrice: product.regularPrice
        },
        bulkPricing: {
          totalTiers,
          maxDiscount: Math.round(maxDiscount * 100) / 100,
          tierAnalytics
        }
      }
    });

  } catch (error) {
    console.error('Error fetching bulk pricing analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

/**
 * Get all products with bulk pricing
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getProductsWithBulkPricing = async (req, res) => {
  try {
    const { page = 1, limit = 10, enabled = true } = req.query;
    const skip = (page - 1) * limit;

    // Build query for products with bulk pricing
    const query = enabled === 'true' 
      ? { 'bulkDiscount.enabled': true }
      : { 'bulkDiscount.enabled': { $exists: true } };

    const products = await Product.find(query)
      .select('_id name regularPrice bulkDiscount')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ updatedAt: -1 });

    const total = await Product.countDocuments(query);

    res.status(200).json({
      success: true,
      products,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalProducts: total,
        hasNextPage: skip + products.length < total,
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error('Error fetching products with bulk pricing:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

/**
 * Test bulk pricing calculation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const testBulkPricingCalculation = async (req, res) => {
  try {
    const { productId } = req.params;
    const { quantity } = req.body;

    if (typeof quantity !== 'number' || quantity < 1) {
      return res.status(400).json({
        success: false,
        message: 'Invalid quantity',
        errors: ['Quantity must be a positive number']
      });
    }

    const product = await Product.findOne({
      _id: productId,
      status: 'published',
      approvalStatus: 'approved'
    });
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found or not available'
      });
    }

    // Use product price as baseUnitPrice for display purposes (not variant-specific)
    const baseUnitPrice = product.salePrice || product.regularPrice || 0;
    const calculation = calculateBulkDiscount(product, quantity, baseUnitPrice);

    res.status(200).json({
      success: true,
      calculation: {
        product: {
          _id: product._id,
          name: product.name,
          regularPrice: product.regularPrice
        },
        quantity,
        result: calculation
      }
    });

  } catch (error) {
    console.error('Error testing bulk pricing calculation:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

module.exports = {
  createOrUpdateBulkPricing,
  getBulkPricing,
  deleteBulkPricing,
  validateBulkPricing,
  getBulkPricingAnalytics,
  getProductsWithBulkPricing,
  testBulkPricingCalculation
};
