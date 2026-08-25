import assert from "node:assert/strict";
import test from "node:test";
import type { CartItem } from "../types/cart.ts";
import {
  guestLinesAddedSince,
  guestLinesToCartAdds,
} from "./guest-cart-merge.ts";

function line(
  partial: Partial<CartItem> & Pick<CartItem, "id" | "productId" | "quantity">,
): CartItem {
  return {
    slug: "ring",
    name: "Ring",
    image: { src: "/x.jpg", alt: "Ring" },
    price: { amount: 100, currency: "INR" },
    ...partial,
  };
}

test("guestLinesToCartAdds maps options from variantId when needed", () => {
  const adds = guestLinesToCartAdds([
    line({
      id: "p1::metal:gold",
      productId: "p1",
      quantity: 2,
      variantId: "metal:gold",
    }),
  ]);
  assert.equal(adds.length, 1);
  assert.equal(adds[0].productId, "p1");
  assert.equal(adds[0].quantity, 2);
  assert.deepEqual(adds[0].options, { metal: "gold" });
});

test("guestLinesAddedSince returns full bag when no logout baseline", () => {
  const current = [line({ id: "a::default", productId: "a", quantity: 1 })];
  assert.deepEqual(guestLinesAddedSince(null, current), current);
});

test("guestLinesAddedSince only returns quantity deltas after logout", () => {
  const baseline = [
    line({ id: "a::default", productId: "a", quantity: 2 }),
    line({ id: "b::default", productId: "b", quantity: 1 }),
  ];
  const current = [
    line({ id: "a::default", productId: "a", quantity: 2 }),
    line({ id: "b::default", productId: "b", quantity: 3 }),
    line({ id: "c::default", productId: "c", quantity: 1 }),
  ];
  const deltas = guestLinesAddedSince(baseline, current);
  assert.deepEqual(
    deltas.map((item) => ({ id: item.id, quantity: item.quantity })),
    [
      { id: "b::default", quantity: 2 },
      { id: "c::default", quantity: 1 },
    ],
  );
});
