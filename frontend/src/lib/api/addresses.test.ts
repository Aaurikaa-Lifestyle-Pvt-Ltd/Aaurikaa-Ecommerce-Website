import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const addressesSource = readFileSync(join(here, "addresses.ts"), "utf8");
const addressesPageSource = readFileSync(
  join(here, "../../app/account/addresses/page.tsx"),
  "utf8",
);

test("address client maps landmark and exposes createShopperAddress", () => {
  assert.match(addressesSource, /landmark/);
  assert.match(addressesSource, /export async function createShopperAddress/);
  assert.match(addressesSource, /addressLine2/);
});

test("address client exposes PUT update for /api/addresses/shopper/:id", () => {
  assert.match(addressesSource, /export async function updateShopperAddress/);
  assert.match(addressesSource, /method:\s*"PUT"/);
  assert.match(
    addressesSource,
    /\/api\/addresses\/shopper\/\$\{encodeURIComponent\(id\)\}/,
  );
});

test("addresses page wires Edit → updateShopperAddress", () => {
  assert.match(addressesPageSource, /updateShopperAddress/);
  assert.match(addressesPageSource, /startEdit/);
  assert.match(addressesPageSource, /editingId/);
  assert.match(addressesPageSource, /Edit/);
});

test("addresses page uses line1 line2 landmark and city free text like checkout", () => {
  assert.match(addressesPageSource, /id="addr-line1"/);
  assert.match(addressesPageSource, /id="addr-line2"/);
  assert.match(addressesPageSource, /id="addr-landmark"/);
  assert.match(addressesPageSource, /City \/ Town/);
  assert.match(addressesPageSource, /addressLine2/);
  assert.match(addressesPageSource, /landmark/);
  assert.equal(/city:\s*option\?\.name/.test(addressesPageSource), false);
});
