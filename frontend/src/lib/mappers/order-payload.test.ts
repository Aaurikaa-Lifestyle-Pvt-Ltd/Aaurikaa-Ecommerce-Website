import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSafeOrderPayload,
  buildCreateOrderPayload,
} from "./order-payload.ts";

test("order payload uses product/variant identity and ignores client money and seller fields", () => {
  const payload = buildCreateOrderPayload({
    items: [
      {
        productId: "64b000000000000000000001",
        quantity: 2,
        variantKey: "color:red|size:large",
        options: { color: "red", size: "large" },
      },
    ],
    shipping: {
      name: "Asha Rao",
      email: "asha@example.com",
      phone: "9876543210",
      address1: "12 Lake Road",
      city: "Bengaluru",
      state: "Karnataka",
      zip: "560001",
    },
    clientTotal: 99,
    clientLinePrice: 1,
    sellerId: "seller-should-not-appear",
  });

  assert.equal(payload.paymentMethod, "cod");
  assert.equal(payload.coupon, undefined);
  assert.deepEqual(payload.items[0], {
    product: "64b000000000000000000001",
    quantity: 2,
    variantKey: "color:red|size:large",
    variantCombination: { color: "red", size: "large" },
  });
  assert.equal("price" in payload.items[0], false);
  assert.equal("sellerId" in payload, false);
  assert.equal("totalAmount" in payload, false);
  assert.equal("paymentStatus" in payload, false);
  assert.equal("buyer" in payload, false);
  assert.deepEqual(assertSafeOrderPayload(payload as unknown as Record<string, unknown>), []);
});

test("variantKey is derived from options when the catalog key is omitted", () => {
  const payload = buildCreateOrderPayload({
    items: [
      {
        productId: "p1",
        quantity: 1,
        options: { Finish: "Gold", Size: "6" },
      },
    ],
    shipping: {
      name: "Asha",
      email: "a@b.co",
      phone: "9999999999",
      address1: "1 Street",
      city: "Pune",
      state: "MH",
      zip: "411001",
    },
  });
  assert.equal(payload.items[0].variantKey, "finish:gold|size:6");
  assert.deepEqual(payload.items[0].variantCombination, { Finish: "Gold", Size: "6" });
});

test("coupon and PhonePe method are sent without client totals", () => {
  const payload = buildCreateOrderPayload({
    items: [{ productId: "p1", quantity: 1, variantKey: "color:gold" }],
    shipping: {
      name: "Asha",
      email: "a@b.co",
      phone: "9999999999",
      address1: "1 Street",
      city: "Pune",
      state: "MH",
      zip: "411001",
    },
    coupon: "festive10",
    paymentMethod: "phonepe",
    clientTotal: 12,
  });
  assert.equal(payload.paymentMethod, "phonepe");
  assert.equal(payload.coupon, "FESTIVE10");
  assert.equal(payload.items[0].variantCombination?.color, "gold");
  assert.equal("totalAmount" in payload, false);
});
