import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../..");

test("admin spin campaigns API uses promotions RBAC routes", () => {
  const text = fs.readFileSync(path.join(import.meta.dirname, "spin-campaigns.ts"), "utf8");
  assert.match(text, /\/api\/admin\/spin-campaigns/);
  assert.match(text, /fetchSpinCampaigns/);
  assert.match(text, /createSpinCampaign/);
  assert.match(text, /updateSpinCampaignStatus/);
  assert.match(text, /\/status/);
  assert.match(text, /fetchSpinAttempts/);
  assert.match(text, /\/attempts/);
  assert.match(text, /couponTemplate/);
  assert.match(text, /SpinSegmentType.*coupon/);
  assert.equal(/sellerId|marketplace/i.test(text), false);
});

test("admin spin nav sits alongside coupons in promotions area", () => {
  const nav = fs.readFileSync(path.join(ROOT, "lib/nav.ts"), "utf8");
  assert.match(nav, /\/admin\/coupons/);
  assert.match(nav, /\/admin\/spin-campaigns/);
  assert.match(nav, /Spin to Win/);
});

test("admin spin pages support CRUD lifecycle and attempt audit", () => {
  const list = fs.readFileSync(
    path.join(ROOT, "app/admin/spin-campaigns/page.tsx"),
    "utf8",
  );
  const detail = fs.readFileSync(
    path.join(ROOT, "app/admin/spin-campaigns/[id]/page.tsx"),
    "utf8",
  );
  assert.match(list, /fetchSpinCampaigns/);
  assert.match(list, /New campaign/);
  assert.match(detail, /createSpinCampaign/);
  assert.match(detail, /updateSpinCampaign/);
  assert.match(detail, /updateSpinCampaignStatus/);
  assert.match(detail, /deleteSpinCampaign/);
  assert.match(detail, /fetchSpinAttempts/);
  assert.match(detail, /SegmentEditor/);
  assert.match(detail, /couponTemplate/);
  assert.equal(/hardcoded.*prize|default.*10%/i.test(detail), false);
});
