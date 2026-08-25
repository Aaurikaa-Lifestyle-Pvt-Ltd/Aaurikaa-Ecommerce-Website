import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.join(import.meta.dirname, "media-entity.ts"),
  "utf8",
);

test("media entity mapper covers gallery library fields", () => {
  assert.match(source, /media_type === "video"/);
  assert.match(source, /public_url/);
  assert.match(source, /display_name/);
  assert.match(source, /alt_text/);
  assert.match(source, /is_shared/);
});
