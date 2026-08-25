import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");

test("storefront env example has no secrets", () => {
  const text = fs.readFileSync(path.join(ROOT, ".env.example"), "utf8");
  assert.match(text, /NEXT_PUBLIC_API_BASE_URL/);
  assert.equal(/JWT_SECRET|PHONEPE|SHIPROCKET|MONGODB|CLOUDFLARE_R2_SECRET/.test(text), false);
});

test("storefront auth storage keys are session tokens, not JWT secrets", () => {
  const text = fs.readFileSync(path.join(ROOT, "src/lib/api/token-store.ts"), "utf8");
  assert.match(text, /aaurikaa\.shopper\.token/);
  assert.equal(/JWT_SECRET/.test(text), false);
});

test("merchandising API client does not embed Instagram integration or seller pickers", () => {
  const text = fs.readFileSync(path.join(ROOT, "src/lib/api/merchandising.ts"), "utf8");
  assert.match(text, /fetchList\("ugc"/);
  assert.equal(/instagram|sellerId/i.test(text), false);
});
