// backend/tests/helpers/buildTestXlsx.js
const XLSX = require('xlsx');

/**
 * Build an in-memory .xlsx buffer from row objects.
 * @param {Array<Record<string, string>>} rows
 * @param {Object} [options]
 * @param {string[]} [options.headers] - column order
 * @param {string[]} [options.textColumns] - force string cell type (identifiers)
 * @returns {Buffer}
 */
function buildTestXlsxBuffer(rows, options = {}) {
  const headers =
    options.headers ||
    (rows.length ? Object.keys(rows[0]) : ['name', 'sku', 'regularPrice', 'stock', 'category']);

  const aoa = [headers];
  for (const row of rows) {
    aoa.push(headers.map((h) => (row[h] !== undefined && row[h] !== null ? String(row[h]) : '')));
  }

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const textColumns = new Set(options.textColumns || ['sku', 'hsnCode', 'contractVersion']);

  headers.forEach((header, colIndex) => {
    if (!textColumns.has(header)) return;
    for (let r = 1; r < aoa.length; r++) {
      const addr = XLSX.utils.encode_cell({ r, c: colIndex });
      const cell = sheet[addr];
      if (!cell) continue;
      cell.t = 's';
      cell.v = String(cell.v ?? '');
      cell.w = String(cell.v);
    }
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Products');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { buildTestXlsxBuffer };
