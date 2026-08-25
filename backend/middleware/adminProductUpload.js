// backend/middleware/adminProductUpload.js
const { r2Uploads, handleUploadError } = require('./secureUpload');

// Use standardized R2 upload middleware for admin product uploads
const adminProductUpload = r2Uploads.productImages(10); // Allow up to 10 product images

// Export both upload middleware and error handler
module.exports = {
  upload: adminProductUpload,
  handleUploadError
};
