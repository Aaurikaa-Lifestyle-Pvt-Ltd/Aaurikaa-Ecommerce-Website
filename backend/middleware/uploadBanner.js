// backend/middleware/uploadBanner.js
const { r2Uploads, handleUploadError } = require('./secureUpload');

// Use R2 banner form upload middleware (accepts multiple fields: backgroundImage, offer_image_0-3)
const upload = r2Uploads.bannerForm();

// Export both upload middleware and error handler
module.exports = {
  upload,
  handleUploadError
};
