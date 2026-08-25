import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.join(import.meta.dirname, "merchandising.ts"),
  "utf8",
);

test("admin merch mapper keeps product ids as a writable list", () => {
  assert.match(source, /productIds\.map/);
  assert.match(source, /join\(", "\)/);
  assert.match(source, /isActive \? "Active" : "Inactive"/);
  assert.equal(/sellerId/.test(source), false);
});
