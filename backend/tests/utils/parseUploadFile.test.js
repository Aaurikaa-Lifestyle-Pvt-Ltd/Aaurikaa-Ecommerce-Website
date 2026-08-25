// backend/tests/utils/parseUploadFile.test.js
const { parseUploadFile } = require('../../utils/productImportExport/parseUploadFile');

describe('parseUploadFile', () => {
  test('parses CSV buffer', async () => {
    const csv = 'name,sku,regularPrice,stock,category\n"Test","SKU-PARSE-1",10,5,"cat"';
    const rows = await parseUploadFile({
      buffer: Buffer.from(csv),
      originalname: 'test.csv',
      mimetype: 'text/csv',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].sku).toBe('SKU-PARSE-1');
  });
});
