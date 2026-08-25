import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "../../..");

test("storefront spin API uses public and shopper contracts", () => {
  const text = readFileSync(join(here, "spin.ts"), "utf8");
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
  const page = readFileSync(
    join(ROOT, "src/app/spin-to-win/page.tsx"),
    "utf8",
  );
  const wheel = readFileSync(
    join(ROOT, "src/components/spin/spin-wheel.tsx"),
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
  const page = readFileSync(
    join(ROOT, "src/app/spin-to-win/page.tsx"),
    "utf8",
  );
  assert.match(page, /"inactive"/);
  assert.match(page, /"eligible"/);
  assert.match(page, /"already_spun"/);
  assert.match(page, /"spinning"/);
  assert.match(page, /couponCode/);
  assert.match(page, /no_active_campaign/);
});

test("spin entry point wires to active campaign and mounts in root layout", () => {
  const entryPoint = readFileSync(
    join(ROOT, "src/components/spin/spin-entry-point.tsx"),
    "utf8",
  );
  const layout = readFileSync(
    join(ROOT, "src/app/layout.tsx"),
    "utf8",
  );
  assert.match(entryPoint, /fetchActiveSpinCampaign/);
  assert.match(entryPoint, /href="\/spin-to-win"/);
  assert.match(entryPoint, /pathname === "\/spin-to-win"/);
  assert.match(layout, /SpinEntryPoint/);
});

test("spin promotional modal handles session delays and dismissal", () => {
  const entryPoint = readFileSync(
    join(ROOT, "src/components/spin/spin-entry-point.tsx"),
    "utf8",
  );
  assert.match(entryPoint, /sessionStorage/);
  assert.match(entryPoint, /setTimeout/);
  assert.match(entryPoint, /aaurikaa_spin_modal_dismissed/);
  assert.match(entryPoint, /Maybe later/i);
  assert.match(entryPoint, /Spin & Win/i);
  assert.match(entryPoint, /Escape/i);
});


