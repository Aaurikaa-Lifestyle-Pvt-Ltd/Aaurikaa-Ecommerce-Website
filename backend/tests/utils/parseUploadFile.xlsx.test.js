// backend/tests/utils/parseUploadFile.xlsx.test.js
process.env.ENABLE_XLSX_IMPORT = 'true';

const XLSX = require('xlsx');
const { parseUploadFile, createParseError } = require('../../utils/productImportExport/parseUploadFile');
const { buildTestXlsxBuffer } = require('../helpers/buildTestXlsx');

describe('parseUploadFile XLSX', () => {
  const baseRow = {
    contractVersion: '2.0',
    name: 'XLSX Product',
    sku: 'SKU-XLSX-1',
    regularPrice: '100',
    stock: '10',
    category: 'cat123',
  };

  test('parses valid XLSX with contract v2', async () => {
    const buffer = buildTestXlsxBuffer([baseRow], {
      textColumns: ['sku', 'contractVersion'],
    });
    const rows = await parseUploadFile({
      buffer,
      originalname: 'products.xlsx',
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].sku).toBe('SKU-XLSX-1');
    expect(rows[0].contractVersion).toBe('2.0');
  });

  test('preserves identifier text: 1E+10, leading zeros, contractVersion 2.0', async () => {
    const buffer = buildTestXlsxBuffer(
      [
        {
          contractVersion: '2.0',
          name: 'Sci SKU',
          sku: '1E+10',
          regularPrice: '10',
          stock: '1',
          category: 'c',
        },
        {
          contractVersion: '2.0',
          name: 'Leading zero',
          sku: '00001234',
          regularPrice: '10',
          stock: '1',
          category: 'c',
        },
      ],
      { textColumns: ['sku', 'contractVersion'] }
    );
    const rows = await parseUploadFile({
      buffer,
      originalname: 'ids.xlsx',
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    expect(rows[0].sku).toBe('1E+10');
    expect(rows[1].sku).toBe('00001234');
    expect(rows[0].contractVersion).toBe('2.0');
  });

  test('preserves multiline longDesc and UTF-8', async () => {
    const desc = 'Line one\nLine two\nÜnicode ✓';
    const buffer = buildTestXlsxBuffer([{ ...baseRow, sku: 'SKU-ML-1', longDesc: desc }]);
    const rows = await parseUploadFile({
      buffer,
      originalname: 'multi.xlsx',
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    expect(rows[0].longDesc).toBe(desc);
  });

  test('preserves large JSON variant columns', async () => {
    const variantStock = JSON.stringify({ 'size:m|color:red': 5, 'size:l|color:blue': 10 });
    const variantSku = JSON.stringify({
      'size:m|color:red': 'SKU-V-1',
      'size:l|color:blue': 'SKU-V-2',
    });
    const buffer = buildTestXlsxBuffer(
      [
        {
          ...baseRow,
          sku: 'SKU-VAR-P',
          variants: JSON.stringify([{ type: 'Size', values: ['M', 'L'] }]),
          variantStock,
          variantSku,
        },
      ],
      { textColumns: ['sku', 'variantStock', 'variantSku', 'variants'] }
    );
    const rows = await parseUploadFile({
      buffer,
      originalname: 'variant.xlsx',
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    expect(JSON.parse(rows[0].variantStock)).toEqual(JSON.parse(variantStock));
    expect(JSON.parse(rows[0].variantSku)).toEqual(JSON.parse(variantSku));
  });

  test('throws EMPTY_SPREADSHEET for header-only workbook', async () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ['name', 'sku'],
      ['', ''],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'Sheet1');
    const emptyBody = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    await expect(
      parseUploadFile({
        buffer: emptyBody,
        originalname: 'empty.xlsx',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
    ).rejects.toMatchObject({ code: 'EMPTY_SPREADSHEET' });
  });

  test('throws MALFORMED_SPREADSHEET for corrupt buffer', async () => {
    await expect(
      parseUploadFile({
        buffer: Buffer.from('not-a-real-xlsx'),
        originalname: 'bad.xlsx',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
    ).rejects.toMatchObject({ code: 'MALFORMED_SPREADSHEET' });
  });

  test('rejects legacy .xls', async () => {
    await expect(
      parseUploadFile({
        buffer: Buffer.from('x'),
        originalname: 'legacy.xls',
        mimetype: 'application/vnd.ms-excel',
      })
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_LEGACY_XLS' });
  });

  test('rejects unsupported file type', async () => {
    await expect(
      parseUploadFile({
        buffer: Buffer.from('x'),
        originalname: 'file.pdf',
        mimetype: 'application/pdf',
      })
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE' });
  });

  test('throws XLSX_IMPORT_DISABLED when flag off', async () => {
    const prev = process.env.ENABLE_XLSX_IMPORT;
    process.env.ENABLE_XLSX_IMPORT = 'false';
    const buffer = buildTestXlsxBuffer([baseRow]);

    await expect(
      parseUploadFile({
        buffer,
        originalname: 'off.xlsx',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
    ).rejects.toMatchObject({ code: 'XLSX_IMPORT_DISABLED' });

    process.env.ENABLE_XLSX_IMPORT = prev;
  });
});

describe('createParseError', () => {
  test('attaches code', () => {
    const err = createParseError('TEST', 'msg');
    expect(err.code).toBe('TEST');
    expect(err.message).toBe('msg');
  });
});
