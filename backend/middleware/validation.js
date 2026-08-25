// backend/middleware/validation.js

const {
  isValidEmail,
  isValidPhone,
  isValidUsername,
  isValidPassword,
  isValidUrl,
  isValidPincode,
  sanitizeInput
} = require('../utils/validation');

const {
  validateStructuredContent,
  isStructuredContent
} = require('../utils/contentGovernance');

// Helper function for length validation
const isValidLength = (value, minLength, maxLength) => {
  if (typeof value !== 'string') return false;
  return value.length >= minLength && value.length <= maxLength;
};

function validateFaqField(value) {
  value = lastNonEmptyString(value);
  if (!value || value === '' || value === '[]') return true;

  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return false;
    }
  }

  if (!Array.isArray(parsed)) return false;

  return parsed.every(
    (item) =>
      item &&
      typeof item === 'object' &&
      (!item.question || typeof item.question === 'string') &&
      (!item.answer || typeof item.answer === 'string')
  );
}

const taxonomyTitleValidation = (value) => !value || isValidLength(value, 0, 200);
const taxonomyDescriptionValidation = (value) => {
  if (!value) return true;
  if (isStructuredContent(value)) {
    return validateStructuredContent(JSON.parse(value), 'CMS');
  }
  return isValidLength(value, 0, 20000);
};
const { sendErrorResponse, ERROR_CODES, HTTP_STATUS } = require('../utils/errorHandler');

/**
 * Generic validation middleware factory
 * @param {object} rules - Validation rules object
 * @returns {function} - Express middleware function
 */
const validateInput = (rules) => {
  return (req, res, next) => {
    try {
      // Sanitize input data
      const sanitizedData = sanitizeInput(req.body);
      req.body = sanitizedData;

      const errors = [];

      // Check required fields
      if (rules.required) {
        const missingFields = [];
        for (const field of rules.required) {
          if (!sanitizedData[field] || (typeof sanitizedData[field] === 'string' && sanitizedData[field].trim() === '')) {
            missingFields.push(field);
          }
        }
        if (missingFields.length > 0) {
          errors.push(`Missing required fields: ${missingFields.join(', ')}`);
        }
      }

      // Validate each field
      if (rules.validations) {
        for (const [field, validator] of Object.entries(rules.validations)) {
          if (sanitizedData[field]) {
            const result = typeof validator === 'function'
              ? validator(sanitizedData[field], sanitizedData)
              : validator(sanitizedData[field]);

            if (result === false) {
              errors.push(`Invalid ${field} format`);
            } else if (typeof result === 'object' && result.isValid === false) {
              // Support for detailed governance errors
              if (result.errors && Array.isArray(result.errors)) {
                result.errors.forEach(err => errors.push(`${field}: ${err}`));
              } else {
                errors.push(`Invalid ${field} format`);
              }
            }
          }
        }
      }

      if (errors.length > 0) {
        return sendErrorResponse(
          res,
          HTTP_STATUS.BAD_REQUEST,
          "Validation failed",
          ERROR_CODES.VALIDATION_FAILED,
          { errors }
        );
      }

      next();
    } catch (error) {
      console.error("❌ Validation middleware error:", error);
      return sendErrorResponse(
        res,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        "Internal server error during validation",
        ERROR_CODES.INTERNAL_SERVER_ERROR
      );
    }
  };
};

// When using multipart (multer), some fields may arrive as arrays (duplicate keys).
// We consistently accept the last non-empty value.
const lastNonEmptyString = (value) => {
  if (Array.isArray(value)) {
    const nonEmpty = value.filter((v) => typeof v === 'string' && v.trim() !== '');
    return nonEmpty.length ? nonEmpty[nonEmpty.length - 1].trim() : '';
  }
  return typeof value === 'string' ? value.trim() : value;
};

/**
 * File upload validation middleware
 * @param {object} options - Validation options
 * @returns {function} - Express middleware function
 */
const validateFileUpload = (options = {}) => {
  const {
    allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    maxSize = 5 * 1024 * 1024, // 5MB default
    required = false
  } = options;

  return (req, res, next) => {
    try {
      const file = req.file;

      if (required && !file) {
        return sendErrorResponse(
          res,
          HTTP_STATUS.BAD_REQUEST,
          "File is required",
          ERROR_CODES.VALIDATION_REQUIRED_FIELDS
        );
      }

      if (file) {
        // Check file type
        if (!allowedTypes.includes(file.mimetype)) {
          return sendErrorResponse(
            res,
            HTTP_STATUS.BAD_REQUEST,
            `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`,
            ERROR_CODES.VALIDATION_FAILED
          );
        }

        // Check file size
        if (file.size > maxSize) {
          return sendErrorResponse(
            res,
            HTTP_STATUS.BAD_REQUEST,
            `File too large. Maximum size: ${maxSize / (1024 * 1024)}MB`,
            ERROR_CODES.VALIDATION_FAILED
          );
        }

        // Sanitize filename
        file.originalname = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      }

      next();
    } catch (error) {
      console.error("❌ File validation middleware error:", error);
      return sendErrorResponse(
        res,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        "Internal server error during file validation",
        ERROR_CODES.INTERNAL_SERVER_ERROR
      );
    }
  };
};

/**
 * Common validation rules for different operations
 */
const VALIDATION_RULES = {
  // Category validation
  category: {
    required: ['name'],
    validations: {
      name: (value) => isValidLength(value, 2, 50) && /^[a-zA-Z0-9\s\-&.]+$/.test(value),
      title: taxonomyTitleValidation,
      description: taxonomyDescriptionValidation,
      faq: validateFaqField
    }
  },

  categoryUpdate: {
    validations: {
      name: (value) => !value || (isValidLength(value, 2, 50) && /^[a-zA-Z0-9\s\-&.]+$/.test(value)),
      title: taxonomyTitleValidation,
      description: taxonomyDescriptionValidation,
      faq: validateFaqField
    }
  },

  subcategory: {
    required: ['name'],
    validations: {
      name: (value) => isValidLength(value, 1, 100),
      title: taxonomyTitleValidation,
      description: taxonomyDescriptionValidation,
      faq: validateFaqField
    }
  },

  subcategoryUpdate: {
    validations: {
      name: (value) => !value || isValidLength(value, 1, 100),
      title: taxonomyTitleValidation,
      description: taxonomyDescriptionValidation,
      faq: validateFaqField
    }
  },

  childCategory: {
    required: ['name'],
    validations: {
      name: (value) => isValidLength(value, 1, 100),
      title: taxonomyTitleValidation,
      description: taxonomyDescriptionValidation,
      faq: validateFaqField
    }
  },

  childCategoryUpdate: {
    validations: {
      name: (value) => !value || isValidLength(value, 1, 100),
      title: taxonomyTitleValidation,
      description: taxonomyDescriptionValidation,
      faq: validateFaqField
    }
  },

  // Brand validation
  brand: {
    required: ['name'],
    validations: {
      name: (value) => isValidLength(value, 2, 50),
      description: (value) => !value || isValidLength(value, 0, 500)
    }
  },

  // Variant validation
  variant: {
    required: ['name', 'values'],
    validations: {
      name: (value) => isValidLength(value, 2, 50),
      values: (value) => Array.isArray(value) && value.length > 0
    }
  },

  // Payment validation
  payment: {
    required: ['amount', 'currency'],
    validations: {
      amount: (value) => !isNaN(value) && parseFloat(value) > 0,
      currency: (value) => isValidLength(value, 3, 3)
    }
  },

  // Address validation
  address: {
    required: ['address1', 'pincode', 'country', 'state', 'district'],
    validations: {
      address1: (value) => isValidLength(value, 10, 200),
      address2: (value) => !value || isValidLength(value, 0, 200),
      pincode: isValidPincode,
      country: (value) => value && (isValidLength(value, 2, 50) || /^[0-9a-fA-F]{24}$/.test(value)),
      state: (value) => value && (isValidLength(value, 2, 50) || /^[0-9a-fA-F]{24}$/.test(value)),
      district: (value) => value && (isValidLength(value, 2, 50) || /^[0-9a-fA-F]{24}$/.test(value))
    }
  },

  // Shipping validation
  shipping: {
    required: ['name', 'cost'],
    validations: {
      name: (value) => isValidLength(value, 2, 50),
      cost: (value) => !isNaN(value) && parseFloat(value) >= 0,
      description: (value) => !value || isValidLength(value, 0, 200)
    }
  },

  // Commission validation
  commission: {
    required: ['percentage'],
    validations: {
      percentage: (value) => !isNaN(value) && parseFloat(value) >= 0 && parseFloat(value) <= 100
    }
  },

  // Blog validation
  blog: {
    required: ['title', 'description', 'author', 'category'],
    validations: {
      // Allow common title punctuation (e.g. colon) while blocking control chars and angle brackets.
      title: (value) => isValidLength(value, 1, 200) && /^[^\u0000-\u001F<>]+$/.test(value),
      description: (value) => {
        if (isStructuredContent(value)) {
          return validateStructuredContent(JSON.parse(value), 'BLOG');
        }
        return isValidLength(value, 10, 10000);
      },
      author: (value) => isValidLength(value, 1, 100) && /^[a-zA-Z0-9\s\-&.]+$/.test(value),
      category: (value) => /^[0-9a-fA-F]{24}$/.test(value),
      status: (value) => !value || ['draft', 'published'].includes(value),
      tags: (value) => !value || isValidLength(value, 0, 500),
      date: (value) => !value || !isNaN(Date.parse(value)),
      metaDescription: (value) => !value || isValidLength(value, 0, 160),
      metaKeywords: (value) => !value || isValidLength(value, 0, 500),
      canonicalUrl: (value) => !value || isValidUrl(value),
      ogTitle: (value) => !value || isValidLength(value, 0, 60),
      ogDescription: (value) => !value || isValidLength(value, 0, 160),
      twitterTitle: (value) => !value || isValidLength(value, 0, 70),
      twitterDescription: (value) => !value || isValidLength(value, 0, 200)
    }
  },

  // Product validation
  product: {
    required: ['name', 'regularPrice', 'category'],
    validations: {
      name: (value) => isValidLength(value, 2, 200),
      // SKU is optional now (auto-generated if missing), but if present must be valid format
      sku: (value) => !value || (isValidLength(value, 2, 100) && /^[a-zA-Z0-9\-_]+$/.test(value)),
      regularPrice: (value) => !isNaN(value) && parseFloat(value) > 0,
      salePrice: (value) => !value || (!isNaN(value) && parseFloat(value) >= 0),
      stock: (value) => !value || (!isNaN(value) && parseInt(value) >= 0),
      category: (value) => /^[0-9a-fA-F]{24}$/.test(value),
      shortDesc: (value) => {
        if (isStructuredContent(value)) return validateStructuredContent(JSON.parse(value), 'PRODUCT');
        return !value || isValidLength(value, 0, 2000);
      },
      longDesc: (value) => {
        value = lastNonEmptyString(value);
        if (isStructuredContent(value)) return validateStructuredContent(JSON.parse(value), 'PRODUCT');
        return !value || isValidLength(value, 0, 20000);
      },
      featuresContent: (value) => {
        value = lastNonEmptyString(value);
        if (isStructuredContent(value)) return validateStructuredContent(JSON.parse(value), 'PRODUCT');
        return !value || isValidLength(value, 0, 20000);
      },
      usageSafetyContent: (value) => {
        value = lastNonEmptyString(value);
        if (isStructuredContent(value)) return validateStructuredContent(JSON.parse(value), 'PRODUCT');
        return !value || isValidLength(value, 0, 20000);
      },
      usageInstructions: (value) => {
        // Debug logging
        console.log('🔍 Validating usageInstructions:', {
          type: typeof value,
          value: value,
          length: value?.length,
          isArray: Array.isArray(value)
        });

        // Handle multer.any() array format: ['', '[{...}]']
        // When using multer.any(), fields can come as arrays
        if (Array.isArray(value) && value.length > 0) {
          // Filter out empty strings and get the last non-empty value
          const nonEmptyValues = value.filter(v => v && v !== '');
          if (nonEmptyValues.length === 0) {
            console.log('✅ Empty array values - PASS');
            return true;
          }
          // Use the last non-empty value (most recent)
          value = nonEmptyValues[nonEmptyValues.length - 1];
          console.log('📝 Extracted from array:', value);
        }

        // Allow empty/undefined values
        if (!value || value === '' || value === '[]') {
          console.log('✅ Empty value - PASS');
          return true;
        }

        let parsed = value;

        // Try to parse if it's a string
        if (typeof value === 'string') {
          try {
            parsed = JSON.parse(value);
            console.log('✅ Parsed JSON:', parsed);
          } catch (e) {
            console.log('⚠️ JSON parse failed:', e.message);
            // If parsing fails, check if it's structured content or plain text
            if (isStructuredContent(value)) {
              console.log('✅ Structured content - PASS');
              return validateStructuredContent(JSON.parse(value), 'PRODUCT');
            }
            // Allow plain text/HTML for backward compatibility
            const isValid = isValidLength(value, 0, 10000);
            console.log(`${isValid ? '✅' : '❌'} Plain text validation:`, isValid);
            return isValid;
          }
        }

        // Validate array structure
        if (Array.isArray(parsed)) {
          // Allow empty array
          if (parsed.length === 0) {
            console.log('✅ Empty array - PASS');
            return true;
          }

          // Validate each item has correct structure
          const isValid = parsed.every(item =>
            item &&
            typeof item === 'object' &&
            (!item.title || typeof item.title === 'string') &&
            (!item.instruction || typeof item.instruction === 'string')
          );
          console.log(`${isValid ? '✅' : '❌'} Array validation:`, isValid, parsed);
          return isValid;
        }

        // If it's already an object (not a string), reject it
        console.log('❌ Invalid format - not array or string');
        return false;
      },
      metaDescription: (value) => {
        if (isStructuredContent(value)) return validateStructuredContent(JSON.parse(value), 'PRODUCT');
        return !value || isValidLength(value, 0, 1000);
      },
      metaDescription: (value) => {
        if (isStructuredContent(value)) return validateStructuredContent(JSON.parse(value), 'PRODUCT');
        return !value || isValidLength(value, 0, 1000);
      },
      status: (value) => !value || ['draft', 'published', 'inactive', 'archived'].includes(value)
    }
  },

  // Blog category validation
  blogCategory: {
    required: ['name'],
    validations: {
      name: (value) => isValidLength(value, 2, 50) && /^[a-zA-Z0-9\s\-&.]+$/.test(value),
      description: (value) => !value || isValidLength(value, 0, 500),
      slug: (value) => !value || (isValidLength(value, 2, 50) && /^[a-z0-9\-]+$/.test(value))
    }
  }
};

/**
 * Predefined validation middlewares
 */
const validateCategory = validateInput(VALIDATION_RULES.category);
const validateCategoryUpdate = validateInput(VALIDATION_RULES.categoryUpdate);
const validateSubcategory = validateInput(VALIDATION_RULES.subcategory);
const validateSubcategoryUpdate = validateInput(VALIDATION_RULES.subcategoryUpdate);
const validateChildCategory = validateInput(VALIDATION_RULES.childCategory);
const validateChildCategoryUpdate = validateInput(VALIDATION_RULES.childCategoryUpdate);
const validateBrand = validateInput(VALIDATION_RULES.brand);
const validateVariant = validateInput(VALIDATION_RULES.variant);
const validatePayment = validateInput(VALIDATION_RULES.payment);
const validateAddress = validateInput(VALIDATION_RULES.address);
const validateShipping = validateInput(VALIDATION_RULES.shipping);
const validateCommission = validateInput(VALIDATION_RULES.commission);
const validateBlog = validateInput(VALIDATION_RULES.blog);
const validateBlogCategory = validateInput(VALIDATION_RULES.blogCategory);
const validateProduct = validateInput(VALIDATION_RULES.product);

module.exports = {
  validateInput,
  validateFileUpload,
  validateCategory,
  validateCategoryUpdate,
  validateSubcategory,
  validateSubcategoryUpdate,
  validateChildCategory,
  validateChildCategoryUpdate,
  validateBrand,
  validateVariant,
  validatePayment,
  validateAddress,
  validateShipping,
  validateCommission,
  validateBlog,
  validateBlogCategory,
  validateProduct,
  VALIDATION_RULES
};
