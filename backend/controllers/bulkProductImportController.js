// backend/controllers/bulkProductImportController.js
const { runBulkImport } = require('../utils/productImportExport');
const {
  sendErrorResponse,
  sendSuccessResponse,
  HTTP_STATUS,
  ERROR_CODES,
} = require('../utils/errorHandler');
const ImportBatch = require('../models/ImportBatch');
const Product = require('../models/Product');
const {
  resolveSellerIdForAaurikaaAdminWrite,
} = require('../services/aaurikaaFoundationService');

function parseBulkOptions(req) {
  const source = { ...(req.query || {}), ...(req.body || {}) };
  const mode = ['create', 'upsert', 'validate'].includes(source.mode) ? source.mode : 'create';
  const autoPublish =
    source.autoPublish === true ||
    source.autoPublish === 'true' ||
    source.autoPublish === '1';
  const autoApproveBatch =
    source.autoApproveBatch === true ||
    source.autoApproveBatch === 'true' ||
    source.autoApproveBatch === '1';
  return { mode, autoPublish, autoApproveBatch };
}

function mapBulkError(err, res) {
  if (err.code === 'VALIDATION_FAILED' && err.validationReport) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      'Validation failed',
      ERROR_CODES.INVALID_INPUT,
      {
        error: 'Some products failed validation',
        summary: err.validationReport.summary,
        errors: err.validationReport.errors,
        warnings: err.validationReport.warnings,
        invalidRows: err.validationReport.invalidRows,
        validationReport: err.validationReport,
      }
    );
  }
  if (err.code === 'IMPORT_IN_PROGRESS') {
    return sendErrorResponse(res, HTTP_STATUS.CONFLICT, err.message, ERROR_CODES.INVALID_INPUT, {
      error: err.message,
    });
  }
  if (err.code === 'EMPTY_FILE' || err.code === 'EMPTY_SPREADSHEET') {
    return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, 'Empty import file', ERROR_CODES.INVALID_INPUT, {
      error: err.message,
    });
  }
  const parseClientErrors = [
    'MALFORMED_SPREADSHEET',
    'UNSUPPORTED_FILE_TYPE',
    'UNSUPPORTED_LEGACY_XLS',
    'XLSX_IMPORT_DISABLED',
  ];
  if (parseClientErrors.includes(err.code)) {
    return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, err.message, ERROR_CODES.INVALID_INPUT, {
      error: err.message,
    });
  }
  const isDuplicate = err.code === 11000 || err.code === 'DUPLICATE_SKU' || err.message?.includes('duplicate');
  return sendErrorResponse(
    res,
    isDuplicate ? HTTP_STATUS.BAD_REQUEST : HTTP_STATUS.INTERNAL_SERVER_ERROR,
    isDuplicate ? 'Duplicate SKU conflict' : 'Failed to process bulk upload',
    isDuplicate ? ERROR_CODES.INVALID_INPUT : ERROR_CODES.INTERNAL_ERROR,
    {
      error: err.message || 'Bulk upload failed',
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    }
  );
}

exports.bulkUploadSeller = async (req, res) => {
  try {
    const options = parseBulkOptions(req);
    const result = await runBulkImport({
      file: req.file,
      uploaderId: req.user._id,
      role: 'Seller',
      sellerId: req.user._id,
      mode: options.mode,
      autoPublish: false,
      autoApproveBatch: false,
    });

    if (result.dryRun) {
      return sendSuccessResponse(res, HTTP_STATUS.OK, 'Validation complete (dry run)', result);
    }

    return sendSuccessResponse(res, HTTP_STATUS.CREATED, 'Bulk products uploaded successfully', {
      count: result.count,
      batchId: result.batchId,
      summary: result.summary,
      upsert: result.upsert,
    });
  } catch (err) {
    console.error('❌ Seller bulk upload:', err);
    return mapBulkError(err, res);
  }
};

exports.bulkUploadAdmin = async (req, res) => {
  try {
    const options = parseBulkOptions(req);
    const sellerId = await resolveSellerIdForAaurikaaAdminWrite(null);
    const result = await runBulkImport({
      file: req.file,
      uploaderId: req.user._id,
      role: 'Admin',
      sellerId,
      mode: options.mode,
      autoPublish: options.autoPublish,
      autoApproveBatch: options.autoApproveBatch,
    });

    if (result.dryRun) {
      return sendSuccessResponse(res, HTTP_STATUS.OK, 'Validation complete (dry run)', result);
    }

    return sendSuccessResponse(res, HTTP_STATUS.CREATED, 'Bulk products uploaded successfully', {
      count: result.count,
      batchId: result.batchId,
      summary: result.summary,
      upsert: result.upsert,
    });
  } catch (err) {
    console.error('❌ Admin bulk upload:', err);
    return mapBulkError(err, res);
  }
};

exports.validateBulkUploadSeller = async (req, res) => {
  req.body = { ...req.body, mode: 'validate' };
  return exports.bulkUploadSeller(req, res);
};

exports.validateBulkUploadAdmin = async (req, res) => {
  req.body = { ...req.body, mode: 'validate' };
  return exports.bulkUploadAdmin(req, res);
};

exports.cleanupOrphanBatches = async (req, res) => {
  try {
    const batches = await ImportBatch.find({}).lean();
    let removed = 0;
    for (const batch of batches) {
      const count = await Product.countDocuments({ batchId: batch._id });
      if (count === 0) {
        await ImportBatch.findByIdAndDelete(batch._id);
        removed++;
      }
    }
    sendSuccessResponse(res, HTTP_STATUS.OK, 'Orphan batch cleanup complete', { removed });
  } catch (err) {
    console.error('❌ Orphan batch cleanup:', err);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, 'Cleanup failed', ERROR_CODES.INTERNAL_ERROR);
  }
};
