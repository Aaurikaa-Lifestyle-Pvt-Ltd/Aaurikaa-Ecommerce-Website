import assert from "node:assert/strict";
import test from "node:test";
import {
  isMarketplaceFooterHref,
  scrubFooterHref,
  sanitizeActionHref,
  sanitizeContentHref,
} from "./sanitize-href.ts";

test("sanitizeContentHref allows http(s) and same-origin paths only", () => {
  assert.equal(sanitizeContentHref("/privacy-policy"), "/privacy-policy");
  assert.equal(sanitizeContentHref("https://example.com/x"), "https://example.com/x");
  assert.equal(sanitizeContentHref("javascript:alert(1)"), null);
  assert.equal(sanitizeContentHref("//evil.example"), null);
});

test("sanitizeActionHref also allows mailto and tel", () => {
  assert.equal(sanitizeActionHref("mailto:hello@example.com"), "mailto:hello@example.com");
  assert.equal(sanitizeActionHref("tel:+910000000000"), "tel:+910000000000");
});

test("isMarketplaceFooterHref drops seller / become-seller / vendor dashboard paths", () => {
  assert.equal(isMarketplaceFooterHref("/seller"), true);
  assert.equal(isMarketplaceFooterHref("/seller/store"), true);
  assert.equal(isMarketplaceFooterHref("/become-seller"), true);
  assert.equal(isMarketplaceFooterHref("/vendors"), true);
  assert.equal(isMarketplaceFooterHref("/vendor-dashboard"), true);
  assert.equal(isMarketplaceFooterHref("/dashboard/seller"), true);
  assert.equal(isMarketplaceFooterHref("https://shop.example/seller/onboard"), true);
  assert.equal(isMarketplaceFooterHref("/privacy-policy"), false);
  assert.equal(isMarketplaceFooterHref("/about"), false);
  assert.equal(isMarketplaceFooterHref("/help-center"), false);
});

test("scrubFooterHref sanitizes then filters marketplace hrefs", () => {
  assert.equal(scrubFooterHref("/become-seller"), null);
  assert.equal(scrubFooterHref("/seller-faq"), null);
  assert.equal(scrubFooterHref("javascript:alert(1)"), null);
  assert.equal(scrubFooterHref("/privacy-policy"), "/privacy-policy");
  assert.equal(scrubFooterHref("/returns-refund-policy"), "/returns-refund-policy");
});
