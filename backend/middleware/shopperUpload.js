// backend/middleware/shopperUpload.js
const { r2Uploads, handleUploadError } = require('./secureUpload');

// Use standardized R2 upload middleware for shopper profile uploads
const shopperUpload = r2Uploads.profileImage();

// Export both upload middleware and error handler
module.exports = {
  upload: shopperUpload,
  handleUploadError
};
