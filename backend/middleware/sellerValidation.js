// backend/middleware/sellerValidation.js

const { sendErrorResponse, ERROR_CODES, HTTP_STATUS } = require('../utils/errorHandler');
const mongoose = require('mongoose');

/**
 * Centralized validation middleware for all seller endpoints
 */

// =========================
// 🔍 Validation Functions
// =========================

/**
 * Validates email format
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validates phone number format (supports international formats)
 */
const isValidPhone = (phone) => {
  const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
  return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
};

/**
 * Validates MongoDB ObjectId format
 */
const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

/**
 * Validates numeric values
 */
const isValidNumber = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const num = parseFloat(value);
  return !isNaN(num) && num >= min && num <= max;
};

/**
 * Validates string length
 */
const isValidLength = (value, minLength = 1, maxLength = 255) => {
  return typeof value === 'string' && value.length >= minLength && value.length <= maxLength;
};

/**
 * Validates order status
 */
const isValidOrderStatus = (status) => {
  const validStatuses = ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
  return validStatuses.includes(status);
};

/**
 * Validates commission status
 */
const isValidCommissionStatus = (status) => {
  const validStatuses = ['pending', 'approved', 'paid', 'cancelled', 'disputed'];
  return validStatuses.includes(status);
};

/**
 * Validates file upload
 */
const isValidFile = (file, allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'], maxSize = 5 * 1024 * 1024) => {
  if (!file) return true; // Optional file
  return allowedTypes.includes(file.mimetype) && file.size <= maxSize;
};

// =========================
// 🎯 Validation Rules
// =========================

const SELLER_VALIDATION_RULES = {
  // Seller profile validation
  sellerProfile: {
    required: ['firstName', 'lastName', 'email', 'phone', 'shopName'],
    validations: {
      firstName: (value) => isValidLength(value, 2, 50),
      lastName: (value) => isValidLength(value, 2, 50),
      email: isValidEmail,
      phone: isValidPhone,
      shopName: (value) => isValidLength(value, 2, 100),
      shopUrl: (value) => !value || isValidLength(value, 2, 50),
      address1: (value) => !value || isValidLength(value, 5, 200),
      pincode: (value) => !value || isValidLength(value, 5, 10),
      country: (value) => !value || isValidLength(value, 2, 50),
      state: (value) => !value || isValidLength(value, 2, 50),
      district: (value) => !value || isValidLength(value, 2, 50)
    }
  },

  // Product validation
  product: {
    required: ['name', 'regularPrice', 'stock', 'category'],
    validations: {
      name: (value) => isValidLength(value, 3, 200),
      description: (value) => !value || isValidLength(value, 10, 2000),
      regularPrice: (value) => isValidNumber(value, 0.01),
      salePrice: (value) => !value || isValidNumber(value, 0.01),
      stock: (value) => isValidNumber(value, 0),
      category: isValidObjectId,
      subcategory: (value) => !value || isValidObjectId(value),
      childCategory: (value) => !value || isValidObjectId(value),
      brand: (value) => !value || isValidObjectId(value),
      weight: (value) => !value || isValidNumber(value, 0),
      length: (value) => !value || isValidNumber(value, 0),
      width: (value) => !value || isValidNumber(value, 0),
      height: (value) => !value || isValidNumber(value, 0),
      taxRate: (value) => !value || isValidNumber(value, 0, 100),
      shippingCharge: (value) => !value || isValidNumber(value, 0)
    }
  },

  // Order validation
  order: {
    required: ['orderId'],
    validations: {
      orderId: isValidObjectId,
      status: isValidOrderStatus,
      trackingNumber: (value) => !value || isValidLength(value, 5, 50)
    }
  },

  // Commission validation
  commission: {
    required: ['commissionId'],
    validations: {
      commissionId: isValidObjectId,
      status: isValidCommissionStatus,
      commissionRate: (value) => !value || isValidNumber(value, 0, 100),
      commissionAmount: (value) => !value || isValidNumber(value, 0)
    }
  },

  // Payment validation
  payment: {
    required: ['amount'],
    validations: {
      amount: (value) => isValidNumber(value, 0.01),
      paymentMethod: (value) => !value || ['bank_transfer', 'upi', 'wallet', 'card'].includes(value),
      accountNumber: (value) => !value || isValidLength(value, 8, 20),
      ifscCode: (value) => !value || isValidLength(value, 11, 11),
      accountHolderName: (value) => !value || isValidLength(value, 2, 100)
    }
  },

  // Bank account validation
  bankAccount: {
    required: ['accountNumber', 'ifscCode', 'accountHolderName'],
    validations: {
      accountNumber: (value) => isValidLength(value, 8, 20) && /^\d+$/.test(value),
      ifscCode: (value) => isValidLength(value, 11, 11) && /^[A-Z]{4}0[A-Z0-9]{6}$/.test(value),
      accountHolderName: (value) => isValidLength(value, 2, 100),
      bankName: (value) => !value || isValidLength(value, 2, 100)
    }
  }
};

// =========================
// 🛠️ Validation Middleware Factory
// =========================

/**
 * Generic validation middleware factory
 * @param {object} rules - Validation rules object
 * @param {string} source - Source of data to validate ('body', 'params', 'query')
 * @returns {function} - Express middleware function
 */
const validateSellerInput = (rules, source = 'body') => {
  return (req, res, next) => {
    try {
      const data = req[source];
      const errors = [];

      // Check required fields
      if (rules.required) {
        const missingFields = [];
        for (const field of rules.required) {
          if (!data[field] || (typeof data[field] === 'string' && data[field].trim() === '')) {
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
          if (data[field] !== undefined && data[field] !== null && data[field] !== '') {
            const isValid = typeof validator === 'function'
              ? validator(data[field], data)
              : validator(data[field]);

            if (!isValid) {
              errors.push(`Invalid ${field} format or value`);
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
      console.error("❌ Seller validation middleware error:", error);
      return sendErrorResponse(
        res,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        "Internal server error during validation",
        ERROR_CODES.INTERNAL_ERROR
      );
    }
  };
};

// =========================
// 📁 File Upload Validation
// =========================

/**
 * File upload validation middleware for seller documents
 * @param {object} options - Validation options
 * @returns {function} - Express middleware function
 */
const validateSellerFileUpload = (options = {}) => {
  const {
    allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'],
    maxSize = 5 * 1024 * 1024, // 5MB
    required = false
  } = options;

  return (req, res, next) => {
    try {
      const files = req.files;
      const errors = [];

      if (required && (!files || Object.keys(files).length === 0)) {
        errors.push('File upload is required');
      }

      if (files) {
        for (const [fieldName, fileArray] of Object.entries(files)) {
          if (Array.isArray(fileArray)) {
            for (const file of fileArray) {
              if (!isValidFile(file, allowedTypes, maxSize)) {
                errors.push(`Invalid file format or size for ${fieldName}`);
              }
            }
          } else if (fileArray && !isValidFile(fileArray, allowedTypes, maxSize)) {
            errors.push(`Invalid file format or size for ${fieldName}`);
          }
        }
      }

      if (errors.length > 0) {
        return sendErrorResponse(
          res,
          HTTP_STATUS.BAD_REQUEST,
          "File validation failed",
          ERROR_CODES.VALIDATION_FAILED,
          { errors }
        );
      }

      next();
    } catch (error) {
      console.error("❌ File validation middleware error:", error);
      return sendErrorResponse(
        res,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        "Internal server error during file validation",
        ERROR_CODES.INTERNAL_ERROR
      );
    }
  };
};

// =========================
// 🎯 Predefined Middlewares
// =========================

// Seller profile validation
const validateSellerProfile = validateSellerInput(SELLER_VALIDATION_RULES.sellerProfile);

// Product validation
const validateProduct = validateSellerInput(SELLER_VALIDATION_RULES.product);

// Order validation
const validateOrder = validateSellerInput(SELLER_VALIDATION_RULES.order, 'params');
const validateOrderUpdate = validateSellerInput(SELLER_VALIDATION_RULES.order);

// Commission validation
const validateCommission = validateSellerInput(SELLER_VALIDATION_RULES.commission, 'params');
const validateCommissionUpdate = validateSellerInput(SELLER_VALIDATION_RULES.commission);

// Payment validation
const validatePayment = validateSellerInput(SELLER_VALIDATION_RULES.payment);

// Bank account validation
const validateBankAccount = validateSellerInput(SELLER_VALIDATION_RULES.bankAccount);

// File upload validation
const validateSellerDocuments = validateSellerFileUpload({
  allowedTypes: ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'],
  maxSize: 5 * 1024 * 1024,
  required: false
});

const validateProductImages = validateSellerFileUpload({
  allowedTypes: ['image/jpeg', 'image/png', 'image/jpg'],
  maxSize: 2 * 1024 * 1024, // 2MB for images
  required: false
});

module.exports = {
  // Validation functions
  isValidEmail,
  isValidPhone,
  isValidObjectId,
  isValidNumber,
  isValidLength,
  isValidOrderStatus,
  isValidCommissionStatus,
  isValidFile,

  // Validation rules
  SELLER_VALIDATION_RULES,

  // Middleware factory
  validateSellerInput,

  // File validation
  validateSellerFileUpload,

  // Predefined middlewares
  validateSellerProfile,
  validateProduct,
  validateOrder,
  validateOrderUpdate,
  validateCommission,
  validateCommissionUpdate,
  validatePayment,
  validateBankAccount,
  validateSellerDocuments,
  validateProductImages
};
