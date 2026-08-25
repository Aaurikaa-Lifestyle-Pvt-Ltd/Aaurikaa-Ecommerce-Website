// backend/middleware/adminDocsUpload.js
const { r2Uploads, handleUploadError } = require('./secureUpload');

// Use standardized R2 upload middleware for admin document uploads
const adminDocsUpload = r2Uploads.adminProfile();

// Export both upload middleware and error handler
module.exports = {
  upload: adminDocsUpload,
  handleUploadError
};
