// backend/middleware/sellerProductUpload.js
const { r2Uploads, handleUploadError } = require('./secureUpload');

// Use standardized R2 upload middleware for seller product uploads
const sellerProductUpload = r2Uploads.productImages(10); // Allow up to 10 product images

// Export both upload middleware and error handler
module.exports = {
  upload: sellerProductUpload,
  handleUploadError
};
