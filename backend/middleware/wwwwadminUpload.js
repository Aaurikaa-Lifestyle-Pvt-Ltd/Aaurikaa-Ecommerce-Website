// backend/middleware/wwwwadminUpload.js
const { r2Uploads, createR2Upload, handleUploadError } = require('./secureUpload');

// ============================
// 📁 Admin Profile Upload (Single image)
// ============================
const adminProfileUpload = r2Uploads.adminProfile();

// ============================
// 📁 Admin Product Upload (Multiple fields: mainImage, galleryImages, video)
// ============================
const adminProductUpload = r2Uploads.productImages(10);

// ============================
// 📁 CSV Upload for Bulk Product Entry
// ============================
const uploadCsv = createR2Upload({
  category: 'documents',
  maxFiles: 1,
  fieldName: 'csvFile'
});

// ✅ Export All Upload Handlers with error handling
module.exports = {
  adminProfileUpload,   // .single("image")
  adminProductUpload,   // .fields([...])
  uploadCsv,            // .single("file")
  handleUploadError
};
