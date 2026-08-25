// backend/tests/utils/importFormatParity.test.js
process.env.ENABLE_XLSX_IMPORT = 'true';

const { parseUploadFile } = require('../../utils/productImportExport/parseUploadFile');
const { convertProductRows } = require('../../utils/bulkUploadTypeConverter');
const { validateRowsGovernance } = require('../../utils/productImportExport/productImportGovernance');
const { buildTestXlsxBuffer } = require('../helpers/buildTestXlsx');

describe('CSV / XLSX import format parity', () => {
  const logicalRow = {
    contractVersion: '2.0',
    name: 'Parity Product',
    sku: 'SKU-PARITY-1',
    regularPrice: '99',
    stock: '12',
    category: '507f1f77bcf86cd799439011',
    status: 'draft',
  };

  function csvFromRow(row) {
    const headers = Object.keys(row);
    const line = headers.map((h) => `"${String(row[h]).replace(/"/g, '""')}"`).join(',');
    return `${headers.join(',')}\n${line}`;
  }

  test('CSV and XLSX produce equivalent normalized rows for same logical data', async () => {
    const csv = csvFromRow(logicalRow);
    const csvRows = await parseUploadFile({
      buffer: Buffer.from(csv),
      originalname: 'parity.csv',
      mimetype: 'text/csv',
    });

    const xlsxBuffer = buildTestXlsxBuffer([logicalRow], {
      textColumns: ['sku', 'contractVersion'],
    });
    const xlsxRows = await parseUploadFile({
      buffer: xlsxBuffer,
      originalname: 'parity.xlsx',
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    expect(csvRows).toHaveLength(1);
    expect(xlsxRows).toHaveLength(1);
    expect(xlsxRows[0].sku).toBe(csvRows[0].sku);
    expect(xlsxRows[0].contractVersion).toBe(csvRows[0].contractVersion);
    expect(xlsxRows[0].name).toBe(csvRows[0].name);
  });

  test('CSV and XLSX yield same governance validation outcome', async () => {
    const variantRow = {
      ...logicalRow,
      sku: 'SKU-PARITY-VAR',
      variants: JSON.stringify([{ type: 'Size', values: ['M'] }]),
      variantStock: JSON.stringify({ 'size:m': 3 }),
      variantSku: JSON.stringify({ 'size:m': 'SKU-PARITY-VAR-M' }),
    };

    const csvRows = await parseUploadFile({
      buffer: Buffer.from(csvFromRow(variantRow)),
      originalname: 'v.csv',
      mimetype: 'text/csv',
    });
    const xlsxRows = await parseUploadFile({
      buffer: buildTestXlsxBuffer([variantRow], {
        textColumns: ['sku', 'variants', 'variantStock', 'variantSku', 'contractVersion'],
      }),
      originalname: 'v.xlsx',
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const sellerId = '507f1f77bcf86cd799439011';
    const csvConverted = await convertProductRows(csvRows, sellerId);
    const xlsxConverted = await convertProductRows(xlsxRows, sellerId);

    const csvGov = validateRowsGovernance(csvConverted, '2.0', new Set());
    const xlsxGov = validateRowsGovernance(xlsxConverted, '2.0', new Set());

    expect(csvGov.isValid).toBe(xlsxGov.isValid);
    expect(csvGov.errors.length).toBe(xlsxGov.errors.length);
  });
});
