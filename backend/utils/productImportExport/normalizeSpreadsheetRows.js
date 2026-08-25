// backend/utils/productImportExport/normalizeSpreadsheetRows.js
// Cell representation normalization only — no governance, validation, or contract mutation.

const IDENTIFIER_COLUMNS = new Set([
  'sku',
  'hsnCode',
  'contractVersion',
  'barcode',
  'ean',
  'upc',
  'gtin',
]);

const JSON_STRING_COLUMNS = new Set([
  'variants',
  'variantPricing',
  'variantStock',
  'variantSku',
  'variantMedia',
  'bulkDiscount',
  'features',
  'usageInstructions',
  'featuresContent',
  'usageSafetyContent',
  'qandas',
  'seo',
  'secondaryCategories',
]);

function isIdentifierColumn(columnKey) {
  if (!columnKey || typeof columnKey !== 'string') return false;
  const key = columnKey.trim();
  if (IDENTIFIER_COLUMNS.has(key)) return true;
  if (key.endsWith('_sku') || key.endsWith('Sku')) return true;
  return false;
}

function formatNumberAsIdentifierString(n) {
  if (!Number.isFinite(n)) return '';
  if (Number.isInteger(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER) {
    return String(n);
  }
  const s = String(n);
  if (/[eE]/.test(s)) {
    return n.toFixed(20).replace(/\.?0+$/, '');
  }
  return s;
}

function cellToImportString(cell, columnKey) {
  if (!cell) return '';

  const identifier = isIdentifierColumn(columnKey);

  if (identifier) {
    if (cell.w != null && cell.w !== '') return String(cell.w);
    if (cell.t === 's') return String(cell.v ?? '');
    if (cell.t === 'n') return formatNumberAsIdentifierString(cell.v);
    if (cell.t === 'b') return cell.v ? 'TRUE' : 'FALSE';
    if (cell.v == null) return '';
    return String(cell.v);
  }

  if (cell.w != null && cell.w !== '') return String(cell.w);
  if (cell.t === 's') return String(cell.v ?? '');
  if (cell.t === 'b') return cell.v ? 'TRUE' : 'FALSE';
  if (cell.t === 'n') {
    const n = cell.v;
    if (Number.isInteger(n)) return String(n);
    if (Number.isFinite(n)) return String(n);
    return '';
  }
  if (cell.t === 'd' && cell.v instanceof Date) {
    return cell.v.toISOString();
  }
  if (typeof cell.v === 'object' && cell.v !== null) {
    try {
      return JSON.stringify(cell.v);
    } catch {
      return '';
    }
  }
  if (cell.v == null) return '';
  return String(cell.v);
}

function normalizeCellValue(value, columnKey) {
  if (value === null || value === undefined) return '';

  const identifier = isIdentifierColumn(columnKey);

  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  if (typeof value === 'number') {
    if (identifier) return formatNumberAsIdentifierString(value);
    if (Number.isInteger(value)) return String(value);
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return String(value);
}

function normalizeSpreadsheetRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];

  return rows.map((row) => {
    const out = {};
    for (const [key, value] of Object.entries(row)) {
      if (key === undefined || key === null || key === '') continue;
      out[key] = normalizeCellValue(value, key);
    }
    return out;
  });
}

function filterMeaningfulRows(rows) {
  return rows.filter((row) =>
    Object.values(row).some((v) => v !== null && v !== undefined && String(v).trim() !== '')
  );
}

module.exports = {
  IDENTIFIER_COLUMNS,
  JSON_STRING_COLUMNS,
  isIdentifierColumn,
  cellToImportString,
  normalizeCellValue,
  normalizeSpreadsheetRows,
  filterMeaningfulRows,
  formatNumberAsIdentifierString,
};
