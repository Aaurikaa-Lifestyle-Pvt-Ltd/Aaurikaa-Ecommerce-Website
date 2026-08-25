// backend/utils/validation.js

/**
 * Input validation utilities for registration endpoints
 */

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Phone validation regex (supports international formats, minimum 10 digits)
const PHONE_REGEX = /^[\+]?[0-9][\d]{9,15}$/;

// Username validation regex (alphanumeric, underscore, hyphen, 3-30 chars)
const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,30}$/;

// Password validation regex (min 8 chars, at least one letter and one number)
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$/;

// URL validation regex (supports both full URLs and domain paths)
const URL_REGEX = /^(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/;

/**
 * Validates email format
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid
 */
const isValidEmail = (email) => {
  return EMAIL_REGEX.test(email);
};

/**
 * Validates phone number format
 * @param {string} phone - Phone number to validate
 * @returns {boolean} - True if valid
 */
const isValidPhone = (phone) => {
  return PHONE_REGEX.test(phone);
};

/**
 * Validates username format
 * @param {string} username - Username to validate
 * @returns {boolean} - True if valid
 */
const isValidUsername = (username) => {
  return USERNAME_REGEX.test(username);
};

/**
 * Validates password strength
 * @param {string} password - Password to validate
 * @returns {boolean} - True if valid
 */
const isValidPassword = (password) => {
  return PASSWORD_REGEX.test(password);
};

/**
 * Validates URL format
 * @param {string} url - URL to validate
 * @returns {boolean} - True if valid
 */
const isValidUrl = (url) => {
  return URL_REGEX.test(url);
};

/**
 * Validates required fields are present and not empty
 * @param {object} data - Data object to validate
 * @param {array} requiredFields - Array of required field names
 * @returns {object} - { isValid: boolean, missingFields: array }
 */
const validateRequiredFields = (data, requiredFields) => {
  const missingFields = [];
  
  for (const field of requiredFields) {
    if (!data[field] || (typeof data[field] === 'string' && data[field].trim() === '')) {
      missingFields.push(field);
    }
  }
  
  return {
    isValid: missingFields.length === 0,
    missingFields
  };
};

/**
 * Validates string length
 * @param {string} value - Value to validate
 * @param {number} minLength - Minimum length
 * @param {number} maxLength - Maximum length
 * @returns {boolean} - True if valid
 */
const isValidLength = (value, minLength, maxLength) => {
  if (typeof value !== 'string') return false;
  return value.length >= minLength && value.length <= maxLength;
};

/**
 * Validates pincode format (4-10 digits for international pincodes)
 * @param {string} pincode - Pincode to validate
 * @returns {boolean} - True if valid
 */
const isValidPincode = (pincode) => {
  return /^\d{4,10}$/.test(pincode);
};

/**
 * Validation rules for different user types
 */
const VALIDATION_RULES = {
  admin: {
    required: ['name', 'username', 'email', 'phone', 'password'],
    validations: {
      name: (value) => isValidLength(value, 2, 50),
      username: isValidUsername,
      email: isValidEmail,
      phone: isValidPhone,
      password: isValidPassword
    }
  },
  seller: {
    required: ['firstName', 'lastName', 'username', 'email', 'phone', 'shopName', 'shopUrl', 'password', 'confirmPassword', 'address1', 'pincode', 'country', 'state', 'district'],
    validations: {
      firstName: (value) => isValidLength(value, 2, 30),
      lastName: (value) => isValidLength(value, 2, 30),
      username: isValidUsername,
      email: isValidEmail,
      phone: isValidPhone,
      shopName: (value) => isValidLength(value, 2, 100),
      shopUrl: isValidUrl,
      password: isValidPassword,
      confirmPassword: (value, data) => value === data.password,
      address1: (value) => isValidLength(value, 10, 200),
      pincode: isValidPincode,
      country: (value) => value && (isValidLength(value, 2, 50) || /^[0-9a-fA-F]{24}$/.test(value)),
      state: (value) => value && (isValidLength(value, 2, 50) || /^[0-9a-fA-F]{24}$/.test(value)),
      district: (value) => value && (isValidLength(value, 2, 50) || /^[0-9a-fA-F]{24}$/.test(value))
    }
  },
  shopper: {
    required: ['firstName', 'lastName', 'username', 'email', 'phone', 'password'],
    validations: {
      firstName: (value) => isValidLength(value, 2, 30),
      lastName: (value) => isValidLength(value, 2, 30),
      username: isValidUsername,
      email: isValidEmail,
      phone: isValidPhone,
      password: isValidPassword
    }
  }
};

/**
 * Validates registration data based on user type
 * @param {object} data - Registration data
 * @param {string} userType - Type of user (admin, seller, shopper)
 * @returns {object} - { isValid: boolean, errors: array }
 */
const validateRegistrationData = (data, userType) => {
  const errors = [];
  const rules = VALIDATION_RULES[userType];
  
  if (!rules) {
    return { isValid: false, errors: ['Invalid user type'] };
  }
  
  // Check required fields
  const requiredCheck = validateRequiredFields(data, rules.required);
  if (!requiredCheck.isValid) {
    errors.push(`Missing required fields: ${requiredCheck.missingFields.join(', ')}`);
  }
  
  // Validate each field
  for (const [field, validator] of Object.entries(rules.validations)) {
    if (data[field]) {
      const isValid = typeof validator === 'function' 
        ? validator(data[field], data) 
        : validator(data[field]);
        
      if (!isValid) {
        console.log(`❌ Validation failed for field '${field}':`, data[field]);
        errors.push(`Invalid ${field} format`);
      }
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Sanitizes input data by trimming strings
 * @param {object} data - Data to sanitize
 * @returns {object} - Sanitized data
 */
const sanitizeInput = (data) => {
  const sanitized = {};
  
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      sanitized[key] = value.trim();
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
};

module.exports = {
  isValidEmail,
  isValidPhone,
  isValidUsername,
  isValidPassword,
  isValidUrl,
  isValidPincode,
  validateRequiredFields,
  validateRegistrationData,
  sanitizeInput,
  VALIDATION_RULES
};
