import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");

test("storefront spin API uses public and shopper contracts", () => {
  const text = fs.readFileSync(path.join(import.meta.dirname, "spin.ts"), "utf8");
  assert.match(text, /\/api\/spin\/active/);
  assert.match(text, /\/api\/shopper\/spin\/status/);
  assert.match(text, /\/api\/shopper\/spin\/spin/);
  assert.match(text, /fetchActiveSpinCampaign/);
  assert.match(text, /fetchSpinStatus/);
  assert.match(text, /executeSpin/);
  assert.match(text, /attemptFromSpinConflict/);
  assert.match(text, /auth:\s*false/);
  assert.match(text, /auth:\s*true/);
  assert.equal(/sellerId|wallet|guest.*spin/i.test(text), false);
});

test("spin-to-win page gates guests and follows server outcome", () => {
  const page = fs.readFileSync(
    path.join(ROOT, "src/app/spin-to-win/page.tsx"),
    "utf8",
  );
  const wheel = fs.readFileSync(
    path.join(ROOT, "src/components/spin/spin-wheel.tsx"),
    "utf8",
  );
  assert.match(page, /ShopperAuthPanel/);
  assert.match(page, /executeSpin/);
  assert.match(page, /fetchActiveSpinCampaign/);
  assert.match(page, /fetchSpinStatus/);
  assert.match(page, /spinLockRef/);
  assert.match(page, /targetSegmentId/);
  assert.match(page, /attemptFromSpinConflict/);
  assert.match(wheel, /targetSegmentId/);
  assert.equal(/Math\.random|pickWeighted|client.*outcome/i.test(page), false);
});

test("spin page covers inactive eligible and already spun states", () => {
  const page = fs.readFileSync(
    path.join(ROOT, "src/app/spin-to-win/page.tsx"),
    "utf8",
  );
  assert.match(page, /"inactive"/);
  assert.match(page, /"eligible"/);
  assert.match(page, /"already_spun"/);
  assert.match(page, /"spinning"/);
  assert.match(page, /couponCode/);
  assert.match(page, /no_active_campaign/);
});
