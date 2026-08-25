import assert from "node:assert/strict";
import test from "node:test";
import { parseCartLineId } from "./cart.ts";

test("parses product and variantKey from cart line ids", () => {
  assert.deepEqual(parseCartLineId("abc::color:gold"), {
    productId: "abc",
    variantKey: "color:gold",
  });
  assert.deepEqual(parseCartLineId("abc::default"), {
    productId: "abc",
    variantKey: undefined,
  });
});
