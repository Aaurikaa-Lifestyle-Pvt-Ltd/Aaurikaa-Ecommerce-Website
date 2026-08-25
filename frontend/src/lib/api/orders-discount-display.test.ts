import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");

test("order pricing breakdown shows coupon code and prefers orderSummary discount", () => {
  const text = readFileSync(
    join(root, "components/orders/order-pricing-breakdown.tsx"),
    "utf8",
  );
  assert.match(text, /Discount \(\$\{couponCode\}\)/);
  assert.match(text, /summary\.discountAmount !== undefined/);
  assert.equal(/Number\(summary\?\.discountAmount\)\s*\|\|/.test(text), false);
});

test("checkout summary labels discount with applied coupon code", () => {
  const text = readFileSync(
    join(root, "components/checkout/checkout-summary.tsx"),
    "utf8",
  );
  assert.match(text, /Discount \(\$\{couponCode\.trim\(\)\.toUpperCase\(\)\}\)/);
  assert.match(text, /Promo code \{couponCode\.trim\(\)\.toUpperCase\(\)\} applied/);
});

test("shopper order list surfaces server discountAmount and couponCode", () => {
  const page = readFileSync(join(root, "app/account/orders/page.tsx"), "utf8");
  const types = readFileSync(join(root, "lib/api/orders.ts"), "utf8");
  assert.match(types, /discountAmount\?:/);
  assert.match(types, /couponCode\?:/);
  assert.match(page, /order\.discountAmount/);
  assert.match(page, /order\.couponCode/);
});

test("payment return reuses OrderPricingBreakdown from shopper order DTO", () => {
  const text = readFileSync(
    join(root, "components/checkout/payment-return-view.tsx"),
    "utf8",
  );
  assert.match(text, /OrderPricingBreakdown/);
  assert.match(text, /fetchShopperOrder/);
  assert.match(text, /pricingSummary/);
  assert.equal(/Server total/.test(text) && !/OrderPricingBreakdown/.test(text), false);
  assert.match(text, /fallbackTotal/);
});

test("order-total surfaces keep discount wiring", () => {
  const confirmation = readFileSync(
    join(root, "components/checkout/order-confirmation-view.tsx"),
    "utf8",
  );
  const detail = readFileSync(join(root, "app/account/orders/[id]/page.tsx"), "utf8");
  const checkout = readFileSync(
    join(root, "components/checkout/checkout-summary.tsx"),
    "utf8",
  );
  assert.match(confirmation, /OrderPricingBreakdown/);
  assert.match(detail, /OrderPricingBreakdown/);
  assert.match(checkout, /quote\.discount/);
});
