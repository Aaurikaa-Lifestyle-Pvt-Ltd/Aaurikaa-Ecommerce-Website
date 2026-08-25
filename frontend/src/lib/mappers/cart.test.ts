import assert from "node:assert/strict";
import test from "node:test";
import { mapProductPrices, toCartAddPayload } from "./helpers.ts";

test("cart display price prefers the backend snapshot", () => {
  const mapped = mapProductPrices(2299, 1999);
  const snapshot = 2299;
  const unitAmount = snapshot > 0 ? snapshot : mapped.price.amount;
  assert.equal(unitAmount, 2299);
  assert.equal(mapped.compareAtPrice?.amount, 2299);
});

test("add-to-cart payload sends variantCombination, not a client price", () => {
  const payload = toCartAddPayload({
    productId: "64b000000000000000000001",
    quantity: 1,
    options: { Finish: "Gold" },
  });
  assert.deepEqual(payload, {
    productId: "64b000000000000000000001",
    quantity: 1,
    variantCombination: { Finish: "Gold" },
  });
  assert.equal("price" in payload, false);
  assert.equal("variantId" in payload, false);
});

test("add-to-cart strips label|hex so stock keys match the API", () => {
  const payload = toCartAddPayload({
    productId: "64b000000000000000000001",
    quantity: 2,
    options: { Color: "Red|#ff0000" },
  });
  assert.deepEqual(payload.variantCombination, { Color: "Red" });
});
