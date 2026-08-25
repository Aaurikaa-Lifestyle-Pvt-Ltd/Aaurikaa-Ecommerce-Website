// backend/tests/utils/productImportGovernance.test.js
const {
  isContractV2,
  validateRowsGovernance,
} = require('../../utils/productImportExport/productImportGovernance');

describe('productImportGovernance', () => {
  test('isContractV2 recognizes 2.0', () => {
    expect(isContractV2('2.0')).toBe(true);
    expect(isContractV2('1.0')).toBe(false);
    expect(isContractV2('')).toBe(false);
  });

  test('rejects variant product without variantStock for v2', () => {
    const rows = [
      {
        name: 'Variant Shoe',
        sku: 'SKU-VTEST-1',
        regularPrice: 100,
        stock: 10,
        category: 'cat',
        variants: [{ type: 'Size', values: ['M'] }],
        variantStock: {},
      },
    ];
    const result = validateRowsGovernance(rows, '2.0', new Set());
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes('variantStock'))).toBe(true);
  });

  test('accepts simple product v2 without variant maps', () => {
    const rows = [
      {
        name: 'Simple',
        sku: 'SKU-VTEST-2',
        regularPrice: 50,
        stock: 5,
        category: 'cat',
      },
    ];
    const result = validateRowsGovernance(rows, '2.0', new Set());
    expect(result.isValid).toBe(true);
  });

  test('upsert ignore set allows existing variant SKUs on the product being updated', () => {
    const rows = [
      {
        name: 'Variant Shoe',
        sku: 'SKU-UPSERT-1',
        regularPrice: 100,
        stock: 3,
        category: 'cat',
        variants: [{ type: 'Size', values: ['M'] }],
        variantStock: { 'size:m': 3 },
        variantSku: { 'size:m': 'SKU-UPSERT-1-M' },
      },
    ];
    const dbSkuSet = new Set(['SKU-UPSERT-1', 'SKU-UPSERT-1-M']);
    const blocked = validateRowsGovernance(rows, '2.0', dbSkuSet);
    expect(blocked.isValid).toBe(false);
    const allowed = validateRowsGovernance(rows, '2.0', dbSkuSet, new Set(['SKU-UPSERT-1', 'SKU-UPSERT-1-M']));
    expect(allowed.isValid).toBe(true);
  });
});
