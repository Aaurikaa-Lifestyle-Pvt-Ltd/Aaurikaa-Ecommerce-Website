// backend/utils/productImportExport/parseUploadFile.js
const { Readable } = require('stream');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { MAX_BULK_IMPORT_ROWS, isXlsxImportEnabled } = require('./constants');
const { normalizeSpreadsheetRows, filterMeaningfulRows } = require('./normalizeSpreadsheetRows');
const { normalizeCatalogueImportRows } = require('../productCatalogueContract');
const { xlsxSheetToRows } = require('./xlsxSheetToRows');

function createParseError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function parseCsvFromStream(stream) {
  return new Promise((resolve, reject) => {
    const rows = [];
    stream
      .pipe(csv())
      .on('data', (data) => {
        rows.push(data);
        if (rows.length > MAX_BULK_IMPORT_ROWS) {
          stream.destroy();
          reject(new Error(`Import exceeds maximum row limit (${MAX_BULK_IMPORT_ROWS})`));
        }
      })
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

function finalizeRows(rows) {
  const normalized = normalizeSpreadsheetRows(rows);
  const catalogueNormalized = normalizeCatalogueImportRows(normalized);
  return filterMeaningfulRows(catalogueNormalized);
}

function isXlsxZipBuffer(buffer) {
  return (
    buffer &&
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07) &&
    (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08)
  );
}

function parseXlsxBuffer(buffer) {
  if (!isXlsxImportEnabled()) {
    throw createParseError(
      'XLSX_IMPORT_DISABLED',
      'Excel (.xlsx) import is disabled. Set ENABLE_XLSX_IMPORT=true or upload CSV.'
    );
  }

  if (!isXlsxZipBuffer(buffer)) {
    throw createParseError('MALFORMED_SPREADSHEET', 'The uploaded Excel file is invalid or corrupted.');
  }

  const XLSX = require('xlsx');
  let workbook;
  try {
    workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: false,
      cellNF: true,
      cellText: true,
    });
  } catch {
    throw createParseError('MALFORMED_SPREADSHEET', 'The uploaded Excel file is invalid or corrupted.');
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw createParseError('EMPTY_SPREADSHEET', 'The Excel file contains no worksheets.');
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = xlsxSheetToRows(sheet);

  if (!rows.length) {
    throw createParseError(
      'EMPTY_SPREADSHEET',
      'The Excel file has no product rows (empty sheet, header-only, or whitespace-only rows).'
    );
  }

  const finalized = finalizeRows(rows);

  if (!finalized.length) {
    throw createParseError(
      'EMPTY_SPREADSHEET',
      'The Excel file has no product rows (empty sheet, header-only, or whitespace-only rows).'
    );
  }

  if (finalized.length > MAX_BULK_IMPORT_ROWS) {
    throw new Error(`Import exceeds maximum row limit (${MAX_BULK_IMPORT_ROWS})`);
  }

  return finalized;
}

function isLegacyXls(file) {
  const name = (file.originalname || '').toLowerCase();
  if (name.endsWith('.xls') && !name.endsWith('.xlsx')) return true;
  if (file.mimetype === 'application/vnd.ms-excel' && !name.endsWith('.xlsx')) return true;
  return false;
}

function isXlsxFile(file) {
  const name = (file.originalname || '').toLowerCase();
  return (
    name.endsWith('.xlsx') ||
    file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
}

function isCsvFile(file) {
  const name = (file.originalname || '').toLowerCase();
  return name.endsWith('.csv') || file.mimetype === 'text/csv';
}

/**
 * @param {Express.Multer.File} file
 * @returns {Promise<Array<Object>>}
 */
async function parseUploadFile(file) {
  if (!file) {
    throw new Error('File is required for bulk upload');
  }

  if (isLegacyXls(file)) {
    throw createParseError(
      'UNSUPPORTED_LEGACY_XLS',
      'Legacy .xls format is not supported. Please upload .xlsx or CSV.'
    );
  }

  if (isXlsxFile(file)) {
    if (!isXlsxImportEnabled()) {
      throw createParseError(
        'XLSX_IMPORT_DISABLED',
        'Excel (.xlsx) import is disabled. Set ENABLE_XLSX_IMPORT=true or upload CSV.'
      );
    }
    if (!file.buffer) {
      throw new Error('XLSX upload requires in-memory file buffer');
    }
    return parseXlsxBuffer(file.buffer);
  }

  if (isCsvFile(file)) {
    let rawRows;
    if (file.buffer) {
      rawRows = await parseCsvFromStream(Readable.from(file.buffer));
    } else if (file.path) {
      rawRows = await parseCsvFromStream(fs.createReadStream(file.path));
    } else {
      throw new Error('File must have either buffer (R2) or path (local) property');
    }
    const rows = finalizeRows(rawRows);
    if (!rows.length) {
      throw createParseError(
        'EMPTY_SPREADSHEET',
        'The CSV file has no product rows (empty file or whitespace-only rows).'
      );
    }
    return rows;
  }

  const ext = path.extname(file.originalname || '').toLowerCase();
  throw createParseError(
    'UNSUPPORTED_FILE_TYPE',
    ext
      ? `Unsupported file type "${ext}". Supported formats: CSV${isXlsxImportEnabled() ? ', .xlsx' : ''}.`
      : `Unsupported file type. Supported formats: CSV${isXlsxImportEnabled() ? ', .xlsx' : ''}.`
  );
}

function getContractVersionFromRows(rows) {
  if (!rows.length) return '1.0';
  const first = rows[0].contractVersion;
  if (first === undefined || first === null || first === '') return '1.0';
  return String(first).trim();
}

module.exports = {
  parseUploadFile,
  getContractVersionFromRows,
  MAX_BULK_IMPORT_ROWS,
  createParseError,
};
