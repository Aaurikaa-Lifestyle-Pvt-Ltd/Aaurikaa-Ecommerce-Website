// backend/middleware/uploadSingle.js
const { r2Uploads, handleUploadError } = require('./secureUpload');

// Use R2 single image upload middleware
const upload = r2Uploads.singleImage();

// Export both upload middleware and error handler
module.exports = {
  upload,
  handleUploadError
};
