// backend/utils/productImportExport/xlsxSheetToRows.js
const XLSX = require('xlsx');
const {
  cellToImportString,
  normalizeSpreadsheetRows,
  filterMeaningfulRows,
} = require('./normalizeSpreadsheetRows');

/**
 * First worksheet only — cell-level extraction for identifier text preservation.
 * @param {import('xlsx').WorkSheet} sheet
 * @returns {Array<Record<string, string>>}
 */
function xlsxSheetToRows(sheet) {
  const ref = sheet['!ref'];
  if (!ref) {
    return [];
  }

  const range = XLSX.utils.decode_range(ref);
  if (range.e.r < range.s.r) {
    return [];
  }

  const headers = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: range.s.r, c });
    const cell = sheet[addr];
    const header = cellToImportString(cell, '').trim();
    headers.push(header || `__empty_col_${c}`);
  }

  const hasRealHeader = headers.some((h) => h && !h.startsWith('__empty_col_'));
  if (!hasRealHeader) {
    return [];
  }

  const rows = [];
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const row = {};
    let hasValue = false;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const header = headers[c - range.s.c];
      if (!header || header.startsWith('__empty_col_')) continue;
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr];
      const value = cellToImportString(cell, header);
      row[header] = value;
      if (value.trim() !== '') hasValue = true;
    }
    if (hasValue) rows.push(row);
  }

  const normalized = normalizeSpreadsheetRows(rows);
  return filterMeaningfulRows(normalized);
}

module.exports = {
  xlsxSheetToRows,
};
