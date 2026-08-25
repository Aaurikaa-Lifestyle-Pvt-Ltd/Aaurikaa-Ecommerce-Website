/**
 * Upload Configuration
 * Environment-based configuration for file uploads
 * Provides secure defaults and environment-specific overrides
 */

const path = require('path');

// Default upload configuration
const defaultConfig = {
  // Base upload directory
  UPLOAD_BASE_PATH: path.join(__dirname, '..', 'uploads'),
  
  // Specific upload directories
  BANNER_UPLOAD_PATH: path.join(__dirname, '..', 'uploads', 'banners'),
  SLIDER_UPLOAD_PATH: path.join(__dirname, '..', 'uploads', 'banners'), // Same as banners for now
  
  // File size limits (in bytes)
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  
  // Allowed file types
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  ALLOWED_IMAGE_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.webp'],
  
  // Security settings
  SECURE_FILENAME_LENGTH: 32, // Length of random filename component
  FILENAME_PREFIX: 'banner_', // Prefix for uploaded files
};

// Environment-specific overrides
const getConfig = () => {
  return {
    UPLOAD_BASE_PATH: process.env.UPLOAD_BASE_PATH || defaultConfig.UPLOAD_BASE_PATH,
    BANNER_UPLOAD_PATH: process.env.BANNER_UPLOAD_PATH || defaultConfig.BANNER_UPLOAD_PATH,
    SLIDER_UPLOAD_PATH: process.env.SLIDER_UPLOAD_PATH || defaultConfig.SLIDER_UPLOAD_PATH,
    MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE) || defaultConfig.MAX_FILE_SIZE,
    ALLOWED_IMAGE_TYPES: process.env.ALLOWED_IMAGE_TYPES ? 
      process.env.ALLOWED_IMAGE_TYPES.split(',') : defaultConfig.ALLOWED_IMAGE_TYPES,
    ALLOWED_IMAGE_EXTENSIONS: process.env.ALLOWED_IMAGE_EXTENSIONS ? 
      process.env.ALLOWED_IMAGE_EXTENSIONS.split(',') : defaultConfig.ALLOWED_IMAGE_EXTENSIONS,
    SECURE_FILENAME_LENGTH: parseInt(process.env.SECURE_FILENAME_LENGTH) || defaultConfig.SECURE_FILENAME_LENGTH,
    FILENAME_PREFIX: process.env.FILENAME_PREFIX || defaultConfig.FILENAME_PREFIX,
  };
};

// Utility functions
const generateSecureFilename = (originalName, prefix = 'banner_') => {
  const crypto = require('crypto');
  const ext = path.extname(originalName).toLowerCase();
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(16).toString('hex');
  return `${prefix}${timestamp}_${randomString}${ext}`;
};

const validateFileType = (file, allowedTypes, allowedExtensions) => {
  if (!file) return false;
  
  // Check MIME type
  if (allowedTypes && !allowedTypes.includes(file.mimetype)) {
    return false;
  }
  
  // Check file extension
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExtensions && !allowedExtensions.includes(ext)) {
    return false;
  }
  
  return true;
};

const validateFileSize = (file, maxSize) => {
  return file && file.size <= maxSize;
};

module.exports = {
  getConfig,
  generateSecureFilename,
  validateFileType,
  validateFileSize,
  defaultConfig,
};
