// backend/tests/utils/normalizeSpreadsheetRows.test.js
const {
  normalizeSpreadsheetRows,
  filterMeaningfulRows,
  formatNumberAsIdentifierString,
  isIdentifierColumn,
} = require('../../utils/productImportExport/normalizeSpreadsheetRows');

describe('normalizeSpreadsheetRows', () => {
  test('isIdentifierColumn recognizes sku and suffix patterns', () => {
    expect(isIdentifierColumn('sku')).toBe(true);
    expect(isIdentifierColumn('variant_sku')).toBe(true);
    expect(isIdentifierColumn('name')).toBe(false);
  });

  test('formatNumberAsIdentifierString avoids scientific notation', () => {
    expect(formatNumberAsIdentifierString(10000000000)).toBe('10000000000');
    const sci = formatNumberAsIdentifierString(1e10);
    expect(sci).not.toMatch(/e/i);
  });

  test('normalizes rows to string values', () => {
    const out = normalizeSpreadsheetRows([
      { sku: 123, name: 'Test', isFeatured: true, stock: 5 },
    ]);
    expect(typeof out[0].sku).toBe('string');
    expect(out[0].sku).toBe('123');
    expect(out[0].isFeatured).toBe('TRUE');
    expect(out[0].stock).toBe('5');
  });

  test('stringifies object cells without validating JSON', () => {
    const obj = { 'size:m': 3 };
    const out = normalizeSpreadsheetRows([{ variantStock: obj }]);
    expect(out[0].variantStock).toBe(JSON.stringify(obj));
  });

  test('filterMeaningfulRows removes whitespace-only rows', () => {
    const filtered = filterMeaningfulRows([
      { name: '   ', sku: '' },
      { name: 'Real', sku: 'A' },
    ]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('Real');
  });
});
