// backend/utils/errorHandler.js

/**
 * Standardized error response utility
 */

/**
 * Standard error response format
 * @param {Object} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @param {string} code - Error code (optional)
 * @param {Object} details - Additional error details (optional)
 */
const sendErrorResponse = (res, statusCode, message, code = null, details = null) => {
  const errorResponse = {
    success: false,
    message,
    timestamp: new Date().toISOString()
  };

  if (code) {
    errorResponse.code = code;
  }

  if (details) {
    errorResponse.details = details;
  }

  return res.status(statusCode).json(errorResponse);
};

/**
 * Standard success response format
 * @param {Object} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Success message
 * @param {Object} data - Response data (optional)
 */
const sendSuccessResponse = (res, statusCode, message, data = null) => {
  const successResponse = {
    success: true,
    message,
    timestamp: new Date().toISOString()
  };

  if (data) {
    successResponse.data = data;
  }

  return res.status(statusCode).json(successResponse);
};

/**
 * Common error messages
 */
const ERROR_MESSAGES = {
  // Authentication errors
  INVALID_CREDENTIALS: 'Invalid credentials provided',
  TOKEN_REQUIRED: 'Authentication token is required',
  TOKEN_INVALID: 'Invalid or expired token',
  ACCESS_DENIED: 'Access denied. Insufficient permissions',

  // Validation errors
  VALIDATION_FAILED: 'Validation failed',
  REQUIRED_FIELDS_MISSING: 'Required fields are missing',
  INVALID_EMAIL_FORMAT: 'Invalid email format',
  INVALID_PHONE_FORMAT: 'Invalid phone number format',
  INVALID_PASSWORD_FORMAT: 'Password does not meet requirements',
  PASSWORDS_DO_NOT_MATCH: 'Passwords do not match',

  // Resource errors
  USER_NOT_FOUND: 'User not found',
  ADMIN_NOT_FOUND: 'Admin not found',
  SELLER_NOT_FOUND: 'Seller not found',
  SHOPPER_NOT_FOUND: 'Shopper not found',
  RESOURCE_NOT_FOUND: 'Resource not found',
  EMAIL_ALREADY_EXISTS: 'Email already exists',
  USERNAME_ALREADY_EXISTS: 'Username already exists',

  // OTP errors
  OTP_INVALID: 'Invalid or expired OTP',
  OTP_RATE_LIMIT_EXCEEDED: 'Rate limit exceeded. Maximum 3 OTP requests per hour',
  OTP_SEND_FAILED: 'Failed to send OTP',

  // Server errors
  INTERNAL_SERVER_ERROR: 'Internal server error',
  DATABASE_ERROR: 'Database operation failed',
  EMAIL_SERVICE_ERROR: 'Email service unavailable',
  PAYLOAD_TOO_LARGE: 'The submitted content is too large. Please reduce the content size or contact support.',

  // Business logic errors
  SELLER_NOT_APPROVED: 'Seller account is not approved',
  INSUFFICIENT_PERMISSIONS: 'Insufficient permissions for this operation',
  OPERATION_NOT_ALLOWED: 'This operation is not allowed'
};

/**
 * Common error codes
 */
const ERROR_CODES = {
  // Authentication
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_REQUIRED: 'AUTH_TOKEN_REQUIRED',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_ACCESS_DENIED: 'AUTH_ACCESS_DENIED',

  // Validation
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  VALIDATION_REQUIRED_FIELDS: 'VALIDATION_REQUIRED_FIELDS',
  VALIDATION_INVALID_FORMAT: 'VALIDATION_INVALID_FORMAT',

  // Resources
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  RESOURCE_ALREADY_EXISTS: 'RESOURCE_ALREADY_EXISTS',

  // OTP
  OTP_INVALID: 'OTP_INVALID',
  OTP_RATE_LIMIT_EXCEEDED: 'OTP_RATE_LIMIT_EXCEEDED',
  OTP_SEND_FAILED: 'OTP_SEND_FAILED',

  // Server
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EMAIL_SERVICE_ERROR: 'EMAIL_SERVICE_ERROR',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',

  // Business
  BUSINESS_RULE_VIOLATION: 'BUSINESS_RULE_VIOLATION',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  PICKUP_NOT_CONFIGURED: 'PICKUP_NOT_CONFIGURED'
};

/**
 * HTTP status codes
 */
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};

/**
 * Express error handling middleware
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const errorHandler = (err, req, res, next) => {
  console.error('❌ Error:', err);

  // Express/body-parser payload too large (exceeds JSON/urlencoded limit)
  if (
    err.type === 'entity.too.large' ||
    err.name === 'PayloadTooLargeError' ||
    err.status === 413 ||
    err.statusCode === 413
  ) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.PAYLOAD_TOO_LARGE,
      ERROR_MESSAGES.PAYLOAD_TOO_LARGE,
      ERROR_CODES.PAYLOAD_TOO_LARGE
    );
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => e.message);
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      ERROR_MESSAGES.VALIDATION_FAILED,
      ERROR_CODES.VALIDATION_FAILED,
      { validationErrors: errors }
    );
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return sendErrorResponse(
      res,
      HTTP_STATUS.CONFLICT,
      `${field} already exists`,
      ERROR_CODES.RESOURCE_ALREADY_EXISTS,
      { field }
    );
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return sendErrorResponse(
      res,
      HTTP_STATUS.UNAUTHORIZED,
      ERROR_MESSAGES.TOKEN_INVALID,
      ERROR_CODES.AUTH_TOKEN_INVALID
    );
  }

  if (err.name === 'TokenExpiredError') {
    return sendErrorResponse(
      res,
      HTTP_STATUS.UNAUTHORIZED,
      'Token has expired',
      ERROR_CODES.AUTH_TOKEN_INVALID
    );
  }

  // Custom error with status code
  if (err.statusCode) {
    return sendErrorResponse(
      res,
      err.statusCode,
      err.message || ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      err.code || ERROR_CODES.INTERNAL_SERVER_ERROR,
      err.details || null
    );
  }

  // Access denied / Forbidden errors
  if (err.message && (
    err.message.includes('Access denied') ||
    err.message.includes('Forbidden') ||
    err.message.includes('permission') ||
    err.message.includes('role required')
  )) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.FORBIDDEN,
      err.message || ERROR_MESSAGES.ACCESS_DENIED,
      ERROR_CODES.AUTH_ACCESS_DENIED
    );
  }

  // Default server error
  return sendErrorResponse(
    res,
    HTTP_STATUS.INTERNAL_SERVER_ERROR,
    ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
    ERROR_CODES.INTERNAL_SERVER_ERROR
  );
};

/**
 * Async error wrapper to catch async errors
 * @param {Function} fn - Async function
 * @returns {Function} - Wrapped function
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  sendErrorResponse,
  sendSuccessResponse,
  ERROR_MESSAGES,
  ERROR_CODES,
  HTTP_STATUS,
  errorHandler,
  asyncHandler
};
