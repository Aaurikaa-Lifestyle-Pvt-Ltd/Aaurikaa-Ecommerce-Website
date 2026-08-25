// backend/tests/utils/productExportContract.test.js
const { formatProductsForExport } = require('../../utils/productExportService');
const { CONTRACT_VERSION } = require('../../utils/productImportExport/constants');

describe('productExportService v2 contract', () => {
  test('export includes contractVersion and variant columns', () => {
    const csv = formatProductsForExport([
      {
        name: 'Test',
        sku: 'SKU-EXP-1',
        regularPrice: 10,
        stock: 1,
        status: 'draft',
        variants: [{ type: 'Size', values: ['M'] }],
        variantStock: { 'size:m': 3 },
        variantSku: { 'size:m': 'SKU-EXP-1-M' },
      },
    ]);
    expect(csv).toContain('contractVersion');
    expect(csv).toContain(CONTRACT_VERSION);
    expect(csv).toContain('variantStock');
    expect(csv).toContain('variantSku');
  });

  test('P6 export emits weightClass name and omits obsolete shipping columns', () => {
    const csv = formatProductsForExport([
      {
        name: 'Slab Product',
        sku: 'SKU-SLAB-1',
        regularPrice: 100,
        stock: 2,
        status: 'published',
        weight: 250,
        weightClass: { name: 'No Shipping Charge (₹0/-)' },
        shippingCharge: 50,
        shippingType: 'flat',
        shippingApplicability: 'applicable',
        shippingVisibility: 'show',
      },
    ]);
    const header = csv.split(/\r?\n/)[0];
    expect(header).toContain('weightClass');
    expect(header).toContain('weight');
    expect(header).not.toContain('shippingCharge');
    expect(header).not.toContain('shippingType');
    expect(header).not.toContain('shippingApplicability');
    expect(header).not.toContain('shippingVisibility');
    expect(csv).toContain('No Shipping Charge (₹0/-)');
    expect(csv).not.toContain('shippingCharge');
  });

  test('WS-3 export includes optional assurance columns without requiring them on legacy rows', () => {
    const csv = formatProductsForExport([
      {
        name: 'Legacy',
        sku: 'SKU-LEGACY-1',
        regularPrice: 10,
        stock: 1,
      },
    ]);
    const header = csv.split(/\r?\n/)[0];
    expect(header).toContain('genuineProduct');
    expect(header).toContain('warrantyAvailable');
    expect(header).toContain('manufacturerSummary');
    expect(header).toContain('secondaryCategories');
  });

  test('WS-4 export serializes secondaryCategories as names, not ObjectIds', () => {
    const csv = formatProductsForExport([
      {
        name: 'Multi-path',
        sku: 'SKU-SEC-1',
        regularPrice: 10,
        stock: 1,
        secondaryCategories: [
          {
            category: { name: 'Electronics', slug: 'electronics' },
            subcategory: { name: 'Phones', slug: 'phones' },
            childCategory: { name: 'Android', slug: 'android' },
          },
        ],
      },
    ]);
    expect(csv).toContain('Electronics');
    expect(csv).toContain('Phones');
    expect(csv).not.toContain('507f1f77bcf86cd799439011');
  });

  test('P6 export never emits WeightClass ObjectId as weightClass column', () => {
    const fakeId = '507f1f77bcf86cd799439011';
    const csv = formatProductsForExport([
      {
        name: 'Unpopulated',
        sku: 'SKU-ID-1',
        regularPrice: 10,
        stock: 1,
        weightClass: fakeId,
      },
    ]);
    expect(csv).not.toContain(fakeId);
  });
});
