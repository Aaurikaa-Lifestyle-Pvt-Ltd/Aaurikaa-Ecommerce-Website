import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../..");

test("admin reviews API uses content-safety contracts without seller surfaces", () => {
  const text = fs.readFileSync(
    path.join(import.meta.dirname, "reviews.ts"),
    "utf8",
  );
  assert.match(text, /\/api\/reviews\/admin/);
  assert.match(text, /fetchAdminReviews/);
  assert.match(text, /rejectAdminReview/);
  assert.match(text, /deleteAdminReview/);
  assert.match(text, /\/reject/);
  assert.match(text, /method:\s*"DELETE"/);
  assert.match(text, /method:\s*"PATCH"/);
  assert.equal(/sellerId|\/api\/reviews\/seller/i.test(text), false);
  assert.equal(/approveAdminReview|\/admin\/[^"'`\s]+\/approve/.test(text), false);
});

test("admin Reviews page is hide/delete safety console not approve queue", () => {
  const page = fs.readFileSync(
    path.join(ROOT, "app/admin/reviews/page.tsx"),
    "utf8",
  );
  assert.match(page, /Remove inappropriate/);
  assert.match(page, /status:\s*"approved"/);
  assert.match(page, /Hide/);
  assert.match(page, /Delete/);
  assert.match(page, /rejectAdminReview/);
  assert.match(page, /deleteAdminReview/);
  assert.equal(/Pending queue|moderation queue/i.test(page), false);
  assert.equal(/sellerId|Seller rating/i.test(page), false);
  assert.equal(/\bApprove\b/.test(page), false);
});

test("admin nav includes Reviews under existing RBAC surface", () => {
  const nav = fs.readFileSync(path.join(ROOT, "lib/nav.ts"), "utf8");
  assert.match(nav, /\/admin\/reviews/);
  assert.match(nav, /label:\s*"Reviews"/);
});
