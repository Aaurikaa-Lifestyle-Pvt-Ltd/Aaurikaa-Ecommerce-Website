import assert from "node:assert/strict";
import test from "node:test";
import {
  clearBuyNowIntent,
  createBuyNowIntent,
  readBuyNowIntent,
  writeBuyNowIntent,
  type StorageLike,
} from "./buy-now.ts";

function memory(): StorageLike & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    getItem(key) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

test("Buy Now preserves variant and quantity without using the cart", () => {
  const storage = memory();
  const intent = writeBuyNowIntent(
    {
      productId: "prod-1",
      slug: "gold-ring",
      name: "Gold Ring",
      image: { src: "/images/placeholder.svg", alt: "Gold Ring" },
      quantity: 3,
      variantKey: "size:6|finish:gold",
      variantTitle: "6 / Gold",
      options: { Size: "6", Finish: "Gold" },
    },
    storage,
  );

  assert.equal(intent.source, "buy-now");
  const loaded = readBuyNowIntent(storage);
  assert.equal(loaded?.line.productId, "prod-1");
  assert.equal(loaded?.line.quantity, 3);
  assert.equal(loaded?.line.variantKey, "size:6|finish:gold");
  assert.deepEqual(loaded?.line.options, { Size: "6", Finish: "Gold" });
  clearBuyNowIntent(storage);
  assert.equal(readBuyNowIntent(storage), null);
});

test("Buy Now rejects a stored intent with an invalid quantity", () => {
  const storage = memory();
  const intent = createBuyNowIntent({
    productId: "prod-1",
    slug: "x",
    name: "x",
    image: { src: "/", alt: "x" },
    quantity: 2,
  });
  intent.line.quantity = 0;
  storage.setItem("aaurikaa.checkout.intent.v1", JSON.stringify(intent));
  assert.equal(readBuyNowIntent(storage), null);
});
