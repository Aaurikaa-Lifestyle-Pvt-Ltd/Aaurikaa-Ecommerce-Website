// backend/middleware/sellerDocsUpload.js
const { r2Uploads, handleUploadError } = require('./secureUpload');

// Use standardized R2 upload middleware for seller document uploads
const sellerDocsUpload = r2Uploads.sellerDocuments(10); // Allow up to 10 documents

// Export both upload middleware and error handler
module.exports = {
  upload: sellerDocsUpload,
  handleUploadError
};
