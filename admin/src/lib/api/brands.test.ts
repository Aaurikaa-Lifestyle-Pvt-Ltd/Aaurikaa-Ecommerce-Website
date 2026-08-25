import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const brandsSrc = readFileSync(new URL("./brands.ts", import.meta.url), "utf8");
const importSrc = readFileSync(new URL("./catalogue-import.ts", import.meta.url), "utf8");

test("brands client uses /api/brands and never sends sellerId", () => {
  assert.match(brandsSrc, /\/api\/brands/);
  assert.match(brandsSrc, /includeInactive=1/);
  assert.doesNotMatch(brandsSrc, /sellerId/);
});

test("catalogue import client targets admin product and category import routes", () => {
  assert.match(importSrc, /\/api\/admin\/products\/export/);
  assert.match(importSrc, /\/api\/admin\/products\/bulk-upload/);
  assert.match(importSrc, /\/api\/admin\/products\/import-json/);
  assert.match(importSrc, /\/api\/admin\/products\/import-template/);
  assert.match(importSrc, /\/api\/admin\/import-batches/);
  assert.match(importSrc, /\/api\/categories\/export/);
  assert.match(importSrc, /\/api\/categories\/import-template/);
  assert.match(importSrc, /csvFile/);
  assert.doesNotMatch(importSrc, /sellerId|Select seller/);
});
