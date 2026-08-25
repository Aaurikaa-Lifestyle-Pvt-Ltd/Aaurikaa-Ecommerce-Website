// backend/middleware/uploadBrand.js
const { r2Uploads, handleUploadError } = require('./secureUpload');

// Use R2 brand logo upload middleware
const upload = r2Uploads.brandLogo();

// Export both upload middleware and error handler
module.exports = {
  upload,
  handleUploadError
};
