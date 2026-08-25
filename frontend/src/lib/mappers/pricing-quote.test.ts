import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSafePricingQuotePayload,
  buildPricingQuotePayload,
  mapPricingQuote,
} from "./pricing-quote.ts";

test("pricing quote payload omits client prices and seller fields", () => {
  const payload = buildPricingQuotePayload({
    items: [
      {
        productId: "64b000000000000000000001",
        quantity: 2,
        variantKey: "color:red|size:large",
        options: { color: "red", size: "large" },
      },
    ],
    coupon: "save10",
    shipping: {
      name: "Asha",
      email: "a@b.co",
      phone: "9999999999",
      address1: "1 Street",
      city: "Pune",
      state: "Maharashtra",
      zip: "411001",
    },
    clientLinePrice: 1,
    variantPriceSnapshot: 99,
  });

  assert.deepEqual(payload.cartItems[0], {
    product: "64b000000000000000000001",
    quantity: 2,
    variantKey: "color:red|size:large",
    variantCombination: { color: "red", size: "large" },
  });
  assert.equal(payload.couponCode, "SAVE10");
  assert.equal("price" in payload.cartItems[0], false);
  assert.equal("variantPriceSnapshot" in payload.cartItems[0], false);
  assert.deepEqual(assertSafePricingQuotePayload(payload), []);
});

test("mapPricingQuote prefers taxAdded and inclusive subtotal label", () => {
  const quote = mapPricingQuote({
    subtotal: 1000,
    total: 1056,
    shipping: { amount: 50, method: "flat", label: "Standard Delivery" },
    discount: { total: 0, coupon: 0, freeShipping: false },
    tax: {
      amount: 180,
      rate: 12,
      taxAdded: 6,
      included: true,
      shippingTax: {
        taxAmount: 6,
        taxRate: 12,
        cgst: 3,
        sgst: 3,
        ugst: 0,
        igst: 0,
      },
      addedCgst: 3,
      addedSgst: 3,
      addedIgst: 0,
      addedUgst: 0,
      cgst: 93,
      sgst: 93,
    },
  });

  assert.equal(quote.taxAdded, 6);
  assert.equal(quote.tax, 6);
  assert.equal(quote.taxIncluded, true);
  assert.equal(quote.subtotalLabel, "Subtotal (incl. GST)");
  assert.equal(quote.shippingTax, 6);
  assert.equal(quote.shippingTaxRate, 12);
  assert.equal(quote.shippingCgst, 3);
  assert.equal(quote.shippingSgst, 3);
  assert.equal(quote.shippingLabel, "Standard Delivery");
  assert.equal(quote.gstRate, 12);
  assert.equal(quote.cgst, 93);
  assert.equal(quote.sgst, 93);
  assert.equal(quote.total, 1056);
});

test("mapPricingQuote treats numeric coupon as valid when amount or free shipping", () => {
  const withDiscount = mapPricingQuote(
    {
      subtotal: 500,
      total: 450,
      shipping: { amount: 0 },
      discount: { total: 50, coupon: 50, freeShipping: false },
      tax: { taxAdded: 0, included: false },
    },
    { couponCode: "SAVE50" },
  );
  assert.equal(withDiscount.couponValid, true);
  assert.equal(withDiscount.shippingPending, false);

  const freeShip = mapPricingQuote(
    {
      subtotal: 500,
      total: 500,
      shipping: { amount: 0 },
      discount: { total: 0, coupon: 0, freeShipping: true },
      tax: { taxAdded: 0 },
    },
    { couponCode: "FREESHIP" },
  );
  assert.equal(freeShip.couponValid, true);
  assert.equal(freeShip.freeShipping, true);

  const invalid = mapPricingQuote(
    {
      subtotal: 500,
      total: 550,
      shipping: { amount: 50 },
      discount: { total: 0, coupon: 0, freeShipping: false },
      tax: { taxAdded: 0 },
    },
    { couponCode: "BADCODE" },
  );
  assert.equal(invalid.couponValid, false);
});

test("mapPricingQuote marks shippingPending when method is pending", () => {
  const quote = mapPricingQuote({
    subtotal: 1390,
    total: 1290,
    shipping: { amount: 0, method: "pending", label: "Shipping" },
    discount: { total: 100, coupon: 100 },
    tax: { taxAdded: 0, included: true },
  }, { couponCode: "TESTSPIN" });
  assert.equal(quote.shippingPending, true);
  assert.equal(quote.discount, 100);
  assert.equal(quote.couponValid, true);
});

test("mapPricingQuote maps exclusive added GST splits without inventing totals", () => {
  const quote = mapPricingQuote({
    subtotal: 1000,
    total: 1180,
    shipping: { amount: 0 },
    discount: { total: 0 },
    tax: {
      rate: 18,
      taxAdded: 180,
      included: false,
      addedCgst: 90,
      addedSgst: 90,
      addedIgst: 0,
      addedUgst: 0,
      shippingTax: { taxAmount: 6 },
    },
  });
  assert.equal(quote.taxIncluded, false);
  assert.equal(quote.subtotalLabel, "Subtotal");
  assert.equal(quote.addedCgst, 90);
  assert.equal(quote.addedSgst, 90);
  assert.equal(quote.gstRate, 18);
  assert.equal(quote.shippingTax, 6);
  assert.equal(quote.total, 1180);
  assert.equal(quote.couponValid, null);
});
