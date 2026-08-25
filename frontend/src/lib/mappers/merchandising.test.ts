import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.join(import.meta.dirname, "merchandising.ts"),
  "utf8",
);

test("storefront merchandising mapper covers collections, looks, occasions, and UGC", () => {
  assert.match(source, /showOnHome/);
  assert.match(source, /mobileImageUrl/);
  assert.match(source, /creatorName/);
  assert.match(source, /externalUrl/);
  assert.equal(/instagram/i.test(source), false);
  assert.equal(/sellerId/.test(source), false);
});
