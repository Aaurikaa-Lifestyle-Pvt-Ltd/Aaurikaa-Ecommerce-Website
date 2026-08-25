const {
  NEW_ARRIVAL_DAYS,
  LABEL_KEYS,
  isOnSale,
  isNewArrival,
  isDeal,
  isFeatured,
  getProductLabels,
  applyMerchandisingCollectionFilter,
} = require('../../utils/productLabels');

describe('productLabels (WS-4 / 1.9)', () => {
  const now = new Date('2026-08-18T00:00:00.000Z');

  test('Sale uses the existing regularPrice > salePrice condition', () => {
    expect(isOnSale({ regularPrice: 100, salePrice: 80 })).toBe(true);
    expect(isOnSale({ regularPrice: 100, salePrice: 100 })).toBe(false);
    expect(isOnSale({ regularPrice: 100 })).toBe(false);
    expect(isOnSale({})).toBe(false);
  });

  test('New uses createdAt recency and is omitted without createdAt', () => {
    const fresh = { createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000) };
    const old = { createdAt: new Date(now.getTime() - (NEW_ARRIVAL_DAYS + 1) * 24 * 60 * 60 * 1000) };
    expect(isNewArrival(fresh, now)).toBe(true);
    expect(isNewArrival(old, now)).toBe(false);
    expect(isNewArrival({}, now)).toBe(false);
  });

  test('Deal reuses bulkDiscount.enabled', () => {
    expect(isDeal({ bulkDiscount: { enabled: true, tiers: [] } })).toBe(true);
    expect(isDeal({ bulkDiscount: { enabled: false } })).toBe(false);
    expect(isDeal({})).toBe(false);
  });

  test('Featured reuses isFeatured', () => {
    expect(isFeatured({ isFeatured: true })).toBe(true);
    expect(isFeatured({ isFeatured: false })).toBe(false);
  });

  test('returns multiple applicable labels and none when conditions are unmet', () => {
    const product = {
      regularPrice: 200,
      salePrice: 150,
      createdAt: now,
      bulkDiscount: { enabled: true },
      isFeatured: true,
    };
    expect(getProductLabels(product, now).map((l) => l.key)).toEqual([
      LABEL_KEYS.NEW,
      LABEL_KEYS.SALE,
      LABEL_KEYS.DEAL,
      LABEL_KEYS.FEATURED,
    ]);
    expect(getProductLabels({ regularPrice: 50, salePrice: 50 }, now)).toEqual([]);
  });

  test('collection filters reuse existing merchandising fields', () => {
    const saleFilter = applyMerchandisingCollectionFilter({}, { label: 'sale' });
    expect(saleFilter.$and[0].$expr).toBeDefined();

    const newFilter = applyMerchandisingCollectionFilter({}, { label: 'new' }, now);
    expect(newFilter.createdAt.$gte).toBeInstanceOf(Date);

    const dealFilter = applyMerchandisingCollectionFilter({}, { label: 'deal' });
    expect(dealFilter['bulkDiscount.enabled']).toBe(true);

    const featuredFilter = applyMerchandisingCollectionFilter({}, { featured: 'true' });
    expect(featuredFilter.isFeatured).toBe(true);
  });
});
