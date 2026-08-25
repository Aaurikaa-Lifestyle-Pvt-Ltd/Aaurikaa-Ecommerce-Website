const {
  combinationFromVariantKey,
  resolveAuthoritativeVariantPrice,
} = require('../../utils/variantUtils');

describe('variant price authority helpers', () => {
  it('parses a normalized variant key into a combination object', () => {
    expect(combinationFromVariantKey('color:gold|size:6')).toEqual({
      color: 'gold',
      size: '6',
    });
  });

  it('resolves sale price from Product.variantPricing and ignores client snapshots', () => {
    const product = {
      variantPricing: {
        'color:gold': { price: 1999, salePrice: 1899 },
      },
    };

    expect(
      resolveAuthoritativeVariantPrice(product, { Color: 'Gold' }, 'color:gold')
    ).toBe(1899);
  });
});
