// backend/utils/productImportExport/constants.js

const CONTRACT_VERSION = '2.0';
const LEGACY_CONTRACT_VERSIONS = ['', '1.0', '1'];

const MAX_BULK_IMPORT_ROWS = parseInt(process.env.MAX_BULK_IMPORT_ROWS || '2000', 10);
const BULK_INSERT_CHUNK_SIZE = parseInt(process.env.BULK_INSERT_CHUNK_SIZE || '100', 10);
function isXlsxImportEnabled() {
  return process.env.ENABLE_XLSX_IMPORT === 'true';
}

const MIXED_VARIANT_PATHS = [
  'variantPricing',
  'variantStock',
  'variantSku',
  'variantMedia',
];

module.exports = {
  CONTRACT_VERSION,
  LEGACY_CONTRACT_VERSIONS,
  MAX_BULK_IMPORT_ROWS,
  BULK_INSERT_CHUNK_SIZE,
  isXlsxImportEnabled,
  get ENABLE_XLSX_IMPORT() {
    return isXlsxImportEnabled();
  },
  MIXED_VARIANT_PATHS,
};
