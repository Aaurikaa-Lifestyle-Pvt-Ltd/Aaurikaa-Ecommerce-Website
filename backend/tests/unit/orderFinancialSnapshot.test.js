const {
  buildOrderFinancialSnapshot,
  buildOrderTaxVisibility,
  resolveTaxAdded,
  resolveSubtotal,
} = require("../../utils/orderFinancialSnapshot");

describe("orderFinancialSnapshot", () => {
  const bulkDiscountOrder = {
    totalAmount: 573.48,
    shippingCharge: 0,
    bulkDiscountSummary: {
      totalOriginalAmount: 540,
      totalDiscountAmount: 54,
      itemsWithBulkDiscount: 1,
    },
    coupon: null,
    items: [{ quantity: 6, price: 81, originalPrice: 90 }],
    tax: {
      totalTaxAmount: 87.48,
      totalTaxAdded: 87.48,
      taxType: "exclusive",
    },
  };

  const couponOrder = {
    totalAmount: 1299,
    shippingCharge: 49,
    bulkDiscountSummary: {
      totalOriginalAmount: 1400,
      totalDiscountAmount: 100,
    },
    coupon: { discountAmount: 50 },
    items: [{ quantity: 1, price: 1300, originalPrice: 1400 }],
    tax: { totalTaxAmount: 0, totalTaxAdded: 0 },
  };

  const inclusiveOrder = {
    totalAmount: 409,
    shippingCharge: 60,
    bulkDiscountSummary: { totalOriginalAmount: 349, totalDiscountAmount: 0 },
    items: [{ quantity: 1, price: 349, originalPrice: 349 }],
    tax: {
      totalTaxAmount: 0,
      totalTaxAdded: 0,
      taxType: "mixed/inclusive",
      totalTaxableAmount: 409,
    },
  };

  it("uses pre-discount subtotal from bulkDiscountSummary", () => {
    const snapshot = buildOrderFinancialSnapshot(bulkDiscountOrder);
    expect(snapshot.subtotal).toBe(540);
    expect(snapshot.discountAmount).toBe(54);
    expect(snapshot.taxAmount).toBe(87.48);
    expect(snapshot.total).toBe(573.48);
  });

  it("balances subtotal - discounts + shipping + tax = total", () => {
    const snapshot = buildOrderFinancialSnapshot(couponOrder);
    expect(snapshot.subtotal).toBe(1400);
    expect(snapshot.discountAmount).toBe(150);
    expect(snapshot.shippingCharge).toBe(49);
    expect(snapshot.taxAmount).toBe(0);
    expect(
      snapshot.subtotal - snapshot.discountAmount + snapshot.shippingCharge + snapshot.taxAmount
    ).toBe(snapshot.total);
  });

  it("derives taxAdded from persisted total when snapshot field is missing", () => {
    const order = {
      ...bulkDiscountOrder,
      tax: { totalTaxAmount: 87.48, taxType: "exclusive" },
    };
    delete order.tax.totalTaxAdded;
    const snapshot = buildOrderFinancialSnapshot(order);
    expect(snapshot.taxAdded).toBe(87.48);
    expect(snapshot.taxAmount).toBe(87.48);
  });

  it("treats inclusive tax as zero additive tax", () => {
    const snapshot = buildOrderFinancialSnapshot(inclusiveOrder);
    expect(snapshot.isInclusiveTax).toBe(true);
    expect(snapshot.taxAmount).toBe(0);
    expect(snapshot.total).toBe(409);
  });

  it("resolveTaxAdded prefers persisted totalTaxAdded", () => {
    expect(
      resolveTaxAdded(
        { tax: { totalTaxAdded: 18 } },
        { subtotal: 100, discountAmount: 0, shippingCharge: 10, total: 128 }
      )
    ).toBe(18);
  });

  it("resolveTaxAdded derives from subtotal, discounts, shipping, and total", () => {
    expect(
      resolveTaxAdded(
        { tax: {} },
        { subtotal: 540, discountAmount: 54, shippingCharge: 0, total: 573.48 }
      )
    ).toBe(87.48);
  });

  it("resolveSubtotal falls back to original item prices", () => {
    expect(
      resolveSubtotal({}, [{ quantity: 2, price: 80, originalPrice: 100 }])
    ).toBe(200);
  });

  describe("buildOrderTaxVisibility", () => {
    const scenarioA = {
      totalAmount: 415,
      shippingCharge: 60,
      items: [{ quantity: 1, price: 349, originalPrice: 349 }],
      bulkDiscountSummary: { totalOriginalAmount: 349, totalDiscountAmount: 0 },
      tax: {
        totalTaxAmount: 59,
        totalTaxAdded: 6,
        taxType: "mixed/inclusive",
        shippingTax: { taxAmount: 6 },
        taxBreakdownSnapshot: {
          items: [{ inclusive: true, taxAmount: 53 }],
        },
      },
    };

    const scenarioB = {
      totalAmount: 534,
      shippingCharge: 50,
      items: [
        { quantity: 1, price: 300, originalPrice: 300 },
        { quantity: 1, price: 178, originalPrice: 178 },
      ],
      bulkDiscountSummary: { totalOriginalAmount: 478, totalDiscountAmount: 0 },
      tax: {
        totalTaxAmount: 57.22,
        totalTaxAdded: 6,
        taxType: "mixed/inclusive",
        shippingTax: { taxAmount: 6 },
        taxBreakdownSnapshot: {
          items: [
            { inclusive: true, taxAmount: 30 },
            { inclusive: true, taxAmount: 21.22 },
          ],
        },
      },
    };

    const scenarioC = {
      totalAmount: 2199,
      shippingCharge: 75,
      items: [{ quantity: 1, price: 1800, originalPrice: 1800 }],
      bulkDiscountSummary: { totalOriginalAmount: 1800, totalDiscountAmount: 0 },
      tax: {
        totalTaxAmount: 324,
        totalTaxAdded: 324,
        taxType: "exclusive",
        shippingTax: { taxAmount: 0 },
        taxBreakdownSnapshot: {
          items: [{ inclusive: false, taxAmount: 324 }],
        },
      },
    };

    it("scenario A: fully inclusive GST — payable formula balances", () => {
      const v = buildOrderTaxVisibility(scenarioA);
      expect(v.itemsNetSubtotal).toBe(349);
      expect(v.itemsGstAdded).toBe(0);
      expect(v.shippingGst).toBe(6);
      expect(v.includedGstInProductPrices).toBe(53);
      expect(v.subtotalLabel).toBe("Subtotal (incl. GST)");
      expect(v.hasInclusiveItems).toBe(true);
      expect(v.hasExclusiveItems).toBe(false);
      expect(v.itemsNetSubtotal + v.shippingCharge + v.shippingGst).toBe(v.total);
    });

    it("scenario B: mixed inclusive GST — no product GST added at checkout", () => {
      const v = buildOrderTaxVisibility(scenarioB);
      expect(v.itemsNetSubtotal).toBe(478);
      expect(v.itemsGstAdded).toBe(0);
      expect(v.shippingGst).toBe(6);
      expect(v.includedGstInProductPrices).toBe(51.22);
      expect(v.subtotalLabel).toBe("Subtotal (incl. GST)");
      expect(v.itemsNetSubtotal + v.shippingCharge + v.shippingGst).toBe(v.total);
    });

    it("scenario C: exclusive GST — product GST is payable", () => {
      const v = buildOrderTaxVisibility(scenarioC);
      expect(v.itemsNetSubtotal).toBe(1800);
      expect(v.itemsGstAdded).toBe(324);
      expect(v.shippingGst).toBe(0);
      expect(v.includedGstInProductPrices).toBe(0);
      expect(v.subtotalLabel).toBe("Subtotal");
      expect(v.hasExclusiveItems).toBe(true);
      expect(
        v.itemsNetSubtotal + v.itemsGstAdded + v.shippingCharge + v.shippingGst
      ).toBe(v.total);
    });
  });
});
