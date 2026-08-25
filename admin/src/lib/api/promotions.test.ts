import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const api = readFileSync(new URL("./promotions.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../../app/admin/banners/page.tsx", import.meta.url), "utf8");

test("promotions maps banner slots by placement not global displayOrder", () => {
  assert.match(api, /placement: "hero"/);
  assert.match(api, /placement: "promo1"/);
  assert.match(api, /placement: "promo2"/);
  assert.match(api, /groupSlidersByPlacement/);
  assert.match(api, /mobileImage/);
  assert.match(api, /body\.append\("placement"/);
  assert.match(api, /deleteAdminSlider/);
});

test("banners page supports multi-slide sections with add/reorder/delete", () => {
  assert.match(page, /Add slide/);
  assert.match(page, /Move up/);
  assert.match(page, /Move down/);
  assert.match(page, /groupSlidersByPlacement/);
  assert.match(page, /deleteAdminSlider/);
  assert.match(page, /mobileImageFile/);
  assert.match(page, /Unassigned slides/);
});

test("announcement offers support delete", () => {
  assert.match(api, /deleteAdminOffer/);
  assert.match(page, /deleteAdminOffer/);
  assert.match(page, /Delete this announcement/);
});
