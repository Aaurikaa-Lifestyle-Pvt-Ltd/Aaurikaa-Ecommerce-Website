import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

/** Mirrors stock-notifications.ts payload builder without loading apiRequest. */
function buildStockNotificationPayload(input: {
  productId: string;
  variantCombination?: Record<string, string>;
}): Record<string, unknown> {
  const productId = String(input.productId ?? "").trim();
  const payload: Record<string, unknown> = { productId };
  if (
    input.variantCombination &&
    typeof input.variantCombination === "object" &&
    Object.keys(input.variantCombination).length > 0
  ) {
    payload.variantCombination = { ...input.variantCombination };
  }
  return payload;
}

test("stock notification payload includes variantCombination only when present", () => {
  assert.deepEqual(buildStockNotificationPayload({ productId: "p1" }), {
    productId: "p1",
  });
  assert.deepEqual(
    buildStockNotificationPayload({
      productId: "p1",
      variantCombination: { Color: "Gold" },
    }),
    { productId: "p1", variantCombination: { Color: "Gold" } },
  );
  assert.deepEqual(
    buildStockNotificationPayload({
      productId: "p1",
      variantCombination: {},
    }),
    { productId: "p1" },
  );
});

test("stock-notifications client requires shopper auth and posts known path", () => {
  const text = fs.readFileSync(
    path.join(import.meta.dirname, "stock-notifications.ts"),
    "utf8",
  );
  assert.match(text, /\/api\/shopper\/stock-notifications/);
  assert.match(text, /auth:\s*true/);
  assert.match(text, /alreadyExists/);
  assert.match(text, /buildStockNotificationPayload/);
  assert.equal(/\/api\/shopper\/stock-notifications\/guest/i.test(text), false);
});
