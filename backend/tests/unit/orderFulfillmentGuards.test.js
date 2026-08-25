const {
  resolveOrderShippingApplicability,
  orderRequiresShipping,
  isLineShippable,
  filterShippableItems,
  deriveFulfillmentBehavior,
  sellerRequiresShipping,
  getAllowedTransitions,
  isAllowedStatusTransition,
  requiresTrackingForStatus,
} = require('../../utils/orderFulfillmentGuards');

describe('orderFulfillmentGuards', () => {
  describe('resolveOrderShippingApplicability', () => {
    it('defaults legacy orders to full', () => {
      expect(resolveOrderShippingApplicability({})).toBe('full');
    });

    it('reads order snapshot', () => {
      expect(resolveOrderShippingApplicability({ shippingApplicability: 'none' })).toBe('none');
    });
  });

  describe('orderRequiresShipping (P5 always-physical for new orders)', () => {
    it('requires shipping when applicability is missing (legacy / new default)', () => {
      expect(orderRequiresShipping({})).toBe(true);
    });

    it('requires shipping for full and partial profiles', () => {
      expect(orderRequiresShipping({ shippingApplicability: 'full' })).toBe(true);
      expect(orderRequiresShipping({ shippingApplicability: 'partial' })).toBe(true);
    });

    it('skips shipping only for legacy none snapshot', () => {
      expect(orderRequiresShipping({ shippingApplicability: 'none' })).toBe(false);
    });
  });

  describe('deriveFulfillmentBehavior', () => {
    it('disables physical fulfillment for none profile', () => {
      expect(deriveFulfillmentBehavior({ shippingApplicability: 'none' })).toEqual({
        physical: false,
        shiprocket: false,
        tracking: false,
      });
    });

    it('keeps physical fulfillment for full profile', () => {
      expect(deriveFulfillmentBehavior({ shippingApplicability: 'full' })).toEqual({
        physical: true,
        shiprocket: true,
        tracking: true,
      });
    });

    it('keeps physical fulfillment for ₹0-charge full orders (No Shipping Charge slab)', () => {
      expect(
        deriveFulfillmentBehavior({
          shippingApplicability: 'full',
          shippingCharge: 0,
        })
      ).toEqual({
        physical: true,
        shiprocket: true,
        tracking: true,
      });
    });
  });

  describe('line filtering', () => {
    it('filters not_applicable lines when order context is omitted', () => {
      const items = [
        { lineShippingApplicability: 'applicable' },
        { lineShippingApplicability: 'not_applicable' },
      ];
      expect(filterShippableItems(items)).toHaveLength(1);
      expect(isLineShippable(items[1])).toBe(false);
    });

    it('includes all lines for full orders even if line snapshots say not_applicable', () => {
      const items = [
        { lineShippingApplicability: 'applicable' },
        { lineShippingApplicability: 'not_applicable' },
      ];
      expect(filterShippableItems(items, { shippingApplicability: 'full' })).toHaveLength(2);
    });

    it('returns empty for legacy none orders', () => {
      const items = [{ lineShippingApplicability: 'applicable' }];
      expect(filterShippableItems(items, { shippingApplicability: 'none' })).toHaveLength(0);
    });

    it('filters lines for partial orders', () => {
      const items = [
        { lineShippingApplicability: 'applicable' },
        { lineShippingApplicability: 'not_applicable' },
      ];
      expect(filterShippableItems(items, { shippingApplicability: 'partial' })).toHaveLength(1);
    });
  });

  describe('sellerRequiresShipping', () => {
    const productA = 'product-a';
    const productB = 'product-b';

    it('is false for none orders', () => {
      const order = {
        shippingApplicability: 'none',
        items: [{ product: productA, lineShippingApplicability: 'not_applicable' }],
      };
      expect(sellerRequiresShipping(order, [productA])).toBe(false);
    });

    it('is false for partial orders when seller only has digital lines', () => {
      const order = {
        shippingApplicability: 'partial',
        items: [
          { product: productA, lineShippingApplicability: 'not_applicable' },
          { product: productB, lineShippingApplicability: 'applicable' },
        ],
      };
      expect(sellerRequiresShipping(order, [productA])).toBe(false);
      expect(sellerRequiresShipping(order, [productB])).toBe(true);
    });
  });

  describe('status transitions', () => {
    it('rejects pending to paid — payment confirmation is not a fulfilment transition', () => {
      const order = { shippingApplicability: 'full' };
      expect(isAllowedStatusTransition(order, 'pending', 'paid')).toBe(false);
      expect(isAllowedStatusTransition(order, 'pending', 'cancelled')).toBe(true);
      expect(getAllowedTransitions(order).pending).toEqual(['cancelled']);
    });

    it('allows processing to delivered for none orders', () => {
      const order = { shippingApplicability: 'none' };
      expect(isAllowedStatusTransition(order, 'processing', 'delivered')).toBe(true);
      expect(isAllowedStatusTransition(order, 'processing', 'shipped')).toBe(false);
    });

    it('requires shipped for full orders', () => {
      const order = { shippingApplicability: 'full' };
      expect(isAllowedStatusTransition(order, 'processing', 'shipped')).toBe(true);
      expect(isAllowedStatusTransition(order, 'processing', 'delivered')).toBe(false);
    });

    it('allows seller digital-only partial orders to skip shipped', () => {
      const order = {
        shippingApplicability: 'partial',
        items: [
          { product: 'p1', lineShippingApplicability: 'not_applicable' },
          { product: 'p2', lineShippingApplicability: 'applicable' },
        ],
      };
      expect(isAllowedStatusTransition(order, 'processing', 'delivered', ['p1'])).toBe(true);
      expect(isAllowedStatusTransition(order, 'processing', 'shipped', ['p2'])).toBe(true);
      expect(isAllowedStatusTransition(order, 'processing', 'delivered', ['p2'])).toBe(false);
    });

    it('does not require tracking when shipping is not applicable', () => {
      const order = { shippingApplicability: 'none' };
      expect(requiresTrackingForStatus(order, ['p1'], 'shipped')).toBe(false);
    });

    it('requires tracking when shipping applicable seller marks shipped', () => {
      const order = {
        shippingApplicability: 'full',
        items: [{ product: 'p1', lineShippingApplicability: 'applicable' }],
      };
      expect(requiresTrackingForStatus(order, ['p1'], 'shipped')).toBe(true);
    });
  });

  describe('getAllowedTransitions', () => {
    it('exposes delivered shortcut on processing for none profile', () => {
      expect(getAllowedTransitions({ shippingApplicability: 'none' }).processing).toEqual(['delivered']);
    });
  });
});
