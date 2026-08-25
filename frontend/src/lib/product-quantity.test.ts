import assert from "node:assert/strict";
import test from "node:test";
import {
  clampPurchasableQuantity,
  maxPurchasableQuantity,
} from "./product-quantity.ts";

test("maxPurchasableQuantity uses variant stock when variants exist", () => {
  assert.equal(
    maxPurchasableQuantity({
      hasVariants: true,
      selectedVariantStock: 3,
      productStock: 99,
    }),
    3,
  );
  assert.equal(
    maxPurchasableQuantity({
      hasVariants: true,
      selectedVariantStock: 0,
      productStock: 99,
    }),
    0,
  );
  assert.equal(
    maxPurchasableQuantity({
      hasVariants: true,
      productStock: 99,
    }),
    undefined,
  );
});

test("maxPurchasableQuantity uses parent stock when no variants", () => {
  assert.equal(
    maxPurchasableQuantity({
      hasVariants: false,
      productStock: 5,
    }),
    5,
  );
  assert.equal(
    maxPurchasableQuantity({
      hasVariants: false,
    }),
    undefined,
  );
});

test("clampPurchasableQuantity respects optional max", () => {
  assert.equal(clampPurchasableQuantity(0, 4), 1);
  assert.equal(clampPurchasableQuantity(9, 4), 4);
  assert.equal(clampPurchasableQuantity(2, undefined), 2);
  assert.equal(clampPurchasableQuantity(2, 0), 1);
});
