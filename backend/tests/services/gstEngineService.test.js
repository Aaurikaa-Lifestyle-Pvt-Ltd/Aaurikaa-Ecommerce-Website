/**
 * Regression: existing gstEngineService precedence and taxIncluded behaviour.
 * Do not change gstEngineService to satisfy these tests.
 */

const gstEngineService = require('../../services/gstEngineService');
const Category = require('../../models/Category');
const Subcategory = require('../../models/Subcategory');
const ChildCategory = require('../../models/ChildCategory');

function mockSelectById(Model, byId) {
  Model.findById = jest.fn((id) => {
    const key = id == null ? '' : String(id);
    const doc = byId[key] ?? null;
    return {
      select: jest.fn().mockResolvedValue(doc),
    };
  });
}

describe('gstEngineService (locked precedence)', () => {
  const catId = '507f1f77bcf86cd799439001';
  const subId = '507f1f77bcf86cd799439011';
  const childId = '507f1f77bcf86cd799439021';

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(gstEngineService, 'checkIfUnionTerritory').mockResolvedValue(false);
    jest.spyOn(gstEngineService, 'isInterState').mockResolvedValue(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('product taxRate > 0 overrides taxonomy rates', async () => {
    mockSelectById(ChildCategory, { [childId]: { taxRate: 5 } });
    mockSelectById(Subcategory, { [subId]: { taxRate: 12 } });
    mockSelectById(Category, { [catId]: { taxRate: 18 } });

    const result = await gstEngineService.calculateGST({
      items: [{
        name: 'Override product',
        price: 1000,
        quantity: 1,
        taxRate: 28,
        taxIncluded: false,
        category: catId,
        subcategory: subId,
        childCategory: childId,
      }],
      shippingCharge: 0,
      shippingAddress: { state: 'Maharashtra' },
    });

    expect(result.taxBreakdown.items[0].taxRate).toBeCloseTo(28, 5);
    expect(result.totalTax).toBeCloseTo(280, 5);
  });

  test('child rate wins over subcategory and category when product taxRate is 0', async () => {
    mockSelectById(ChildCategory, { [childId]: { taxRate: 5 } });
    mockSelectById(Subcategory, { [subId]: { taxRate: 12 } });
    mockSelectById(Category, { [catId]: { taxRate: 18 } });

    const result = await gstEngineService.calculateGST({
      items: [{
        name: 'Child wins',
        price: 1000,
        quantity: 1,
        taxRate: 0,
        taxIncluded: false,
        category: catId,
        subcategory: subId,
        childCategory: childId,
      }],
      shippingCharge: 0,
      shippingAddress: { state: 'Maharashtra' },
    });

    expect(result.taxBreakdown.items[0].taxRate).toBe(5);
    expect(result.totalTax).toBe(50);
  });

  test('subcategory rate wins over category when child rate is unset', async () => {
    mockSelectById(ChildCategory, { [childId]: { taxRate: undefined } });
    mockSelectById(Subcategory, { [subId]: { taxRate: 12 } });
    mockSelectById(Category, { [catId]: { taxRate: 18 } });

    const result = await gstEngineService.calculateGST({
      items: [{
        name: 'Sub wins',
        price: 1000,
        quantity: 1,
        taxRate: 0,
        taxIncluded: false,
        category: catId,
        subcategory: subId,
        childCategory: childId,
      }],
      shippingCharge: 0,
      shippingAddress: { state: 'Maharashtra' },
    });

    expect(result.taxBreakdown.items[0].taxRate).toBe(12);
    expect(result.totalTax).toBe(120);
  });

  test('category rate is used when lower taxonomy levels are unset', async () => {
    mockSelectById(ChildCategory, {});
    mockSelectById(Subcategory, { [subId]: { taxRate: null } });
    mockSelectById(Category, { [catId]: { taxRate: 18 } });

    const result = await gstEngineService.calculateGST({
      items: [{
        name: 'Category fallback',
        price: 1000,
        quantity: 1,
        taxRate: 0,
        taxIncluded: false,
        category: catId,
        subcategory: subId,
      }],
      shippingCharge: 0,
      shippingAddress: { state: 'Maharashtra' },
    });

    expect(result.taxBreakdown.items[0].taxRate).toBe(18);
    expect(result.totalTax).toBe(180);
  });

  test('explicit taxonomy 0 is different from unset inherit', async () => {
    mockSelectById(ChildCategory, { [childId]: { taxRate: 0 } });
    mockSelectById(Subcategory, { [subId]: { taxRate: 12 } });
    mockSelectById(Category, { [catId]: { taxRate: 18 } });

    const withExplicitZero = await gstEngineService.calculateGST({
      items: [{
        name: 'Explicit zero child',
        price: 1000,
        quantity: 1,
        taxRate: 0,
        taxIncluded: false,
        category: catId,
        subcategory: subId,
        childCategory: childId,
      }],
      shippingCharge: 0,
      shippingAddress: { state: 'Maharashtra' },
    });

    mockSelectById(ChildCategory, { [childId]: { taxRate: undefined } });

    const withUnsetChild = await gstEngineService.calculateGST({
      items: [{
        name: 'Unset child inherits sub',
        price: 1000,
        quantity: 1,
        taxRate: 0,
        taxIncluded: false,
        category: catId,
        subcategory: subId,
        childCategory: childId,
      }],
      shippingCharge: 0,
      shippingAddress: { state: 'Maharashtra' },
    });

    expect(withExplicitZero.taxBreakdown.items[0].taxRate).toBe(0);
    expect(withExplicitZero.totalTax).toBe(0);
    expect(withUnsetChild.taxBreakdown.items[0].taxRate).toBe(12);
    expect(withUnsetChild.totalTax).toBe(120);
  });

  test('taxIncluded controls inclusive vs exclusive calculation', async () => {
    mockSelectById(Category, { [catId]: { taxRate: 18 } });

    const exclusive = await gstEngineService.calculateGST({
      items: [{
        name: 'Exclusive',
        price: 1000,
        quantity: 1,
        taxRate: 18,
        taxIncluded: false,
        category: catId,
      }],
      shippingCharge: 0,
      shippingAddress: { state: 'Maharashtra' },
    });

    const inclusive = await gstEngineService.calculateGST({
      items: [{
        name: 'Inclusive',
        price: 1180,
        quantity: 1,
        taxRate: 18,
        taxIncluded: true,
        category: catId,
      }],
      shippingCharge: 0,
      shippingAddress: { state: 'Maharashtra' },
    });

    expect(exclusive.totalTax).toBe(180);
    expect(exclusive.totalTaxAdded).toBe(180);
    expect(inclusive.totalTax).toBe(180);
    expect(inclusive.totalTaxAdded).toBe(0);
    expect(inclusive.taxBreakdown.items[0].inclusive).toBe(true);
  });
});
