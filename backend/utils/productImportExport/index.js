// backend/utils/productImportExport/index.js
const { runBulkImport, cleanupBatch } = require('./bulkImportOrchestrator');
const { CONTRACT_VERSION, isXlsxImportEnabled } = require('./constants');

module.exports = {
  runBulkImport,
  cleanupBatch,
  CONTRACT_VERSION,
  isXlsxImportEnabled,
  get ENABLE_XLSX_IMPORT() {
    return isXlsxImportEnabled();
  },
};
