const {
  CATALOGUE_CSV_COLUMNS,
  CATALOGUE_REQUIRED,
} = require('../../utils/productCatalogueContract');
const {
  formatProductsForExport,
  formatProductsForExportXlsx,
  omitMarketplaceProductColumns,
  MARKETPLACE_PRODUCT_COLUMNS,
} = require('../../utils/productExportService');
const { CONTRACT_VERSION } = require('../../utils/productImportExport/constants');
const {
  getProductTemplateSpec,
  getCategoryTemplateSpec,
  buildProductTemplate,
  buildCategoryTemplate,
  PRODUCT_REQUIRED,
} = require('../../utils/catalogueImportTemplates');
const { CATEGORY_CONTRACT_VERSION, CATEGORY_CSV_COLUMNS } = require('../../utils/categoryExportService');

describe('catalogue import templates and operator export', () => {
  test('product template spec uses 20-field catalogue contract', () => {
    const spec = getProductTemplateSpec();
    expect(spec.contractVersion).toBe(CONTRACT_VERSION);
    expect(spec.headers).toEqual(CATALOGUE_CSV_COLUMNS);
    expect(spec.headers).toHaveLength(20);
    expect(spec.headers).toContain('productName');
    expect(spec.headers).toContain('listPrice');
    expect(spec.headers).toContain('weight');
    expect(spec.headers).not.toContain('weightClass');
    expect(spec.headers).not.toContain('sellerShopName');
    expect(spec.headers).not.toContain('sellerName');
    expect(spec.headers).not.toContain('contractVersion');
    expect(spec.headers).not.toContain('variantSku');
    expect(spec.required.sort()).toEqual([...CATALOGUE_REQUIRED].sort());
    expect(spec.required.sort()).toEqual([...PRODUCT_REQUIRED].sort());
    expect(spec.columns.every((col) => spec.headers.includes(col.key))).toBe(true);
  });

  test('category template spec uses 8-field catalogue contract', () => {
    const spec = getCategoryTemplateSpec();
    expect(spec.contractVersion).toBe(CATEGORY_CONTRACT_VERSION);
    expect(spec.required).toEqual(['level', 'name']);
    expect(spec.headers).toEqual([
      'level',
      'name',
      'slug',
      'parentCategory',
      'parentSubcategory',
      'image',
      'taxRate',
      'taxType',
    ]);
    expect(spec.headers).toHaveLength(8);
    expect(spec.headers).not.toContain('contractVersion');
    expect(spec.headers).not.toContain('commissionRate');
    expect(spec.headers).not.toContain('commissionType');
    expect(spec.headers).not.toContain('faq');
    expect(spec.headers).not.toContain('showInMegaMenu');
  });

  test('CSV product template contains catalogue headers and example row', () => {
    const file = buildProductTemplate('csv');
    const csv = file.buffer.toString('utf8');
    expect(file.filename).toMatch(/product_import_template\.csv$/);
    expect(csv).toContain('productName');
    expect(csv).toContain('listPrice');
    expect(csv).not.toContain('weightClass');
    expect(csv).not.toContain('contractVersion');
    expect(csv).not.toContain('sellerShopName');
  });

  test('XLSX templates put data on the first sheet so import still reads it', () => {
    const XLSX = require('xlsx');
    const product = buildProductTemplate('xlsx');
    const productBook = XLSX.read(product.buffer, { type: 'buffer' });
    expect(productBook.SheetNames[0]).toBe('Products');
    expect(productBook.SheetNames).toContain('Instructions');

    const category = buildCategoryTemplate('xlsx');
    const categoryBook = XLSX.read(category.buffer, { type: 'buffer' });
    expect(categoryBook.SheetNames[0]).toBe('Categories');
    const rows = XLSX.utils.sheet_to_json(categoryBook.Sheets.Categories);
    expect(rows.map((row) => row.level)).toEqual(['category', 'subcategory', 'childCategory']);
    expect(rows[1].parentCategory).toBeTruthy();
    expect(rows[2].parentSubcategory).toBeTruthy();
  });

  test('operator product export uses 20 catalogue columns only', () => {
    const csv = formatProductsForExport(
      [
        {
          name: 'Operator Ring',
          sku: 'SKU-OP-1',
          regularPrice: 10,
          stock: 1,
          seller: { shopName: 'Hidden Shop', firstName: 'A', lastName: 'B' },
          category: { name: 'Rings', slug: 'rings' },
          weightClass: { name: 'Standard' },
          variants: [{ type: 'Size', values: ['M'] }],
          variantSku: { 'size:m': 'SKU-OP-1-M' },
        },
      ],
      { operator: true }
    );
    const header = csv.split(/\r?\n/)[0];
    expect(header).toBe(CATALOGUE_CSV_COLUMNS.join(','));
    expect(header).not.toContain('weightClass');
    expect(header).not.toContain('variantSku');
    expect(header).not.toContain('sellerShopName');
    expect(header).not.toContain('sellerName');
    expect(csv).not.toContain('Hidden Shop');
  });

  test('full product export still includes marketplace compatibility columns', () => {
    const csv = formatProductsForExport([
      {
        name: 'Full Ring',
        sku: 'SKU-FULL-1',
        regularPrice: 10,
        stock: 1,
        seller: { shopName: 'Compat Shop', firstName: 'A', lastName: 'B' },
      },
    ]);
    expect(csv).toContain('sellerShopName');
    expect(csv).toContain('Compat Shop');
    expect(csv).toContain('contractVersion');
    expect(csv).toContain('variantStock');
  });

  test('xlsx product export is a workbook buffer', () => {
    const buffer = formatProductsForExportXlsx(
      [{ name: 'Xlsx Product', sku: 'SKU-XLSX-1', regularPrice: 20, stock: 2 }],
      { operator: true }
    );
    expect(Buffer.isBuffer(buffer)).toBe(true);
    const XLSX = require('xlsx');
    const book = XLSX.read(buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]);
    expect(rows[0].productName).toBe('Xlsx Product');
    expect(rows[0].sku).toBe('SKU-XLSX-1');
  });

  test('omitMarketplaceProductColumns strips only seller columns', () => {
    expect(omitMarketplaceProductColumns(['name', ...MARKETPLACE_PRODUCT_COLUMNS, 'sku'])).toEqual([
      'name',
      'sku',
    ]);
  });
});
