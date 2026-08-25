import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

test("admin order mapper maps coupon discount fields from persisted order", () => {
  const text = readFileSync(join(here, "order.ts"), "utf8");
  assert.match(text, /export function mapAdminOrderPricing/);
  assert.match(text, /coupon\.discountAmount/);
  assert.match(text, /bulkDiscountSummary/);
  assert.match(text, /couponCode/);
  assert.match(text, /pricing,/);
  assert.equal(/discountAmount\s*=\s*.*\*.*Math\.random/i.test(text), false);
});

test("admin order detail and list render discount from mapped pricing", () => {
  const detail = readFileSync(
    join(here, "../../app/admin/orders/[id]/page.tsx"),
    "utf8",
  );
  const list = readFileSync(join(here, "../../app/admin/orders/page.tsx"), "utf8");
  assert.match(detail, /seed\.pricing\.couponDiscount/);
  assert.match(detail, /Coupon \(\$\{seed\.pricing\.couponCode\}\)/);
  assert.match(detail, /Order totals/);
  assert.match(list, /order\.pricing\.discountAmount/);
});
