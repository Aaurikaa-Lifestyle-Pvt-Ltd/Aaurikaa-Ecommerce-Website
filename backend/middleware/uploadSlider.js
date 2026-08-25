// backend/middleware/uploadSlider.js
const { r2Uploads, handleUploadError } = require('./secureUpload');

// Desktop `image` + mobile `mobileImage` fields
const upload = r2Uploads.slider();

module.exports = {
  upload,
  handleUploadError
};
