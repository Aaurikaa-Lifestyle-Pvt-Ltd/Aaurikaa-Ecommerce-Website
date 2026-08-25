// backend/middleware/bulkUpload.js
const path = require('path');
const multer = require('multer');
const {
  handleUploadError,
  validateFileType,
  sanitizeFilename,
  FILE_SIZE_LIMITS,
} = require('./secureUpload');
const { isXlsxImportEnabled } = require('../utils/productImportExport/constants');

function createBulkImportFileFilter() {
  return (req, file, cb) => {
    try {
      const ext = path.extname(file.originalname || '').toLowerCase();

      if (ext === '.xls' && !file.originalname.toLowerCase().endsWith('.xlsx')) {
        return cb(
          new Error('Legacy .xls format is not supported. Please upload .xlsx or CSV.'),
          false
        );
      }

      if (ext === '.xlsx') {
        if (!isXlsxImportEnabled()) {
          return cb(
            new Error(
              'Excel (.xlsx) import is disabled. Upload CSV or enable ENABLE_XLSX_IMPORT.'
            ),
            false
          );
        }
        file.originalname = sanitizeFilename(file.originalname);
        return cb(null, true);
      }

      if (ext === '.csv' || file.mimetype === 'text/csv') {
        if (!validateFileType(file.mimetype, 'documents') && file.mimetype !== 'text/csv') {
          return cb(new Error('Invalid file type. Allowed: CSV.'), false);
        }
        file.originalname = sanitizeFilename(file.originalname);
        return cb(null, true);
      }

      return cb(
        new Error(
          isXlsxImportEnabled()
            ? 'Unsupported file type. Supported formats: CSV, .xlsx'
            : 'Unsupported file type. Supported format: CSV'
        ),
        false
      );
    } catch (error) {
      cb(error instanceof Error ? error : new Error('File validation error'), false);
    }
  };
}

const storage = multer.memoryStorage();
const fileSizeLimit = FILE_SIZE_LIMITS.documents || FILE_SIZE_LIMITS.default;

const uploadMiddleware = multer({
  storage,
  fileFilter: createBulkImportFileFilter(),
  limits: {
    fileSize: fileSizeLimit,
    files: 1,
  },
}).single('csvFile');

const upload = (req, res, next) => {
  uploadMiddleware(req, res, (err) => {
    if (err) return next(err);
    next();
  });
};

module.exports = {
  upload,
  handleUploadError,
};
