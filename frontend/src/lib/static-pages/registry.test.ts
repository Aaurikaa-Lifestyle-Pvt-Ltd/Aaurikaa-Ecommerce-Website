import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  MARKETPLACE_STATIC_PAGE_KEYS,
  canonicalPathForPageKey,
  isMarketplaceStaticPageKey,
  resolvePageKeyFromSlug,
} from "./registry.ts";
import { sanitizeContentHref, sanitizeActionHref } from "./sanitize-href.ts";
import { parseTipTapDoc } from "./tiptap-parse.ts";

test("registry maps canonical slugs to pageKeys", () => {
  assert.equal(resolvePageKeyFromSlug("privacy-policy"), "privacy-policy");
  assert.equal(resolvePageKeyFromSlug("terms-condition"), "terms-condition");
  assert.equal(resolvePageKeyFromSlug("shipping-policy"), "shipping-policy");
  assert.equal(resolvePageKeyFromSlug("returns-refund-policy"), "returns-refund-policy");
  assert.equal(resolvePageKeyFromSlug("faq"), "faq");
  assert.equal(resolvePageKeyFromSlug("about"), "about");
  assert.equal(resolvePageKeyFromSlug("contact"), "contact");
  assert.equal(resolvePageKeyFromSlug("help-center"), "help-center");
  assert.equal(resolvePageKeyFromSlug("jewellery-care"), "jewellery-care");
  assert.equal(resolvePageKeyFromSlug("well-wisher-suggestions"), "well-wisher-suggestions");
});

test("registry maps short aliases used by siteConfig footer", () => {
  assert.equal(resolvePageKeyFromSlug("privacy"), "privacy-policy");
  assert.equal(resolvePageKeyFromSlug("terms"), "terms-condition");
  assert.equal(resolvePageKeyFromSlug("shipping"), "shipping-policy");
  assert.equal(resolvePageKeyFromSlug("returns"), "returns-refund-policy");
  assert.equal(resolvePageKeyFromSlug("refund-policy"), "returns-refund-policy");
  assert.equal(resolvePageKeyFromSlug("faqs"), "faq");
  assert.equal(resolvePageKeyFromSlug("care"), "jewellery-care");
  assert.equal(resolvePageKeyFromSlug("well-wisher"), "well-wisher-suggestions");
  assert.equal(resolvePageKeyFromSlug("feedback"), "well-wisher-suggestions");
});

test("canonical paths prefer registry slugs", () => {
  assert.equal(canonicalPathForPageKey("privacy-policy"), "/privacy-policy");
  assert.equal(canonicalPathForPageKey("returns-refund-policy"), "/returns-refund-policy");
  assert.equal(canonicalPathForPageKey("faq"), "/faq");
  assert.equal(canonicalPathForPageKey("jewellery-care"), "/jewellery-care");
  assert.equal(
    canonicalPathForPageKey("well-wisher-suggestions"),
    "/well-wisher-suggestions",
  );
});

test("marketplace page keys are not resolvable from public slugs", () => {
  for (const key of MARKETPLACE_STATIC_PAGE_KEYS) {
    assert.equal(isMarketplaceStaticPageKey(key), true);
    assert.equal(resolvePageKeyFromSlug(key), null);
    assert.equal(canonicalPathForPageKey(key), null);
  }
});

test("sanitizeContentHref allows http(s) and absolute paths only", () => {
  assert.equal(sanitizeContentHref("/privacy-policy"), "/privacy-policy");
  assert.equal(sanitizeContentHref("https://example.com/a"), "https://example.com/a");
  assert.equal(sanitizeContentHref("http://example.com/a"), "http://example.com/a");
  assert.equal(sanitizeContentHref("javascript:alert(1)"), null);
  assert.equal(sanitizeContentHref("JAVASCRIPT:alert(1)"), null);
  assert.equal(sanitizeContentHref("data:text/html,hi"), null);
  assert.equal(sanitizeContentHref("//evil.example"), null);
  assert.equal(sanitizeContentHref("mailto:a@b.com"), null);
});

test("sanitizeActionHref allows mailto and tel for CTAs", () => {
  assert.equal(sanitizeActionHref("mailto:support@example.com"), "mailto:support@example.com");
  assert.equal(sanitizeActionHref("tel:+911234567890"), "tel:+911234567890");
  assert.equal(sanitizeActionHref("javascript:void(0)"), null);
});

test("parseTipTapDoc rejects non-doc payloads", () => {
  assert.equal(parseTipTapDoc(null), null);
  assert.equal(parseTipTapDoc("not-json"), null);
  assert.equal(parseTipTapDoc({ type: "paragraph" }), null);
  const doc = parseTipTapDoc(
    JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Hello",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
            },
          ],
        },
      ],
    }),
  );
  assert.ok(doc);
  const href = doc!.content?.[0]?.content?.[0]?.marks?.[0]?.attrs?.href;
  assert.equal(sanitizeContentHref(href), null);
});

test("siteConfig footer defaults avoid marketplace keys and resolve via aliases", () => {
  const sitePath = path.resolve(import.meta.dirname, "../../config/site.ts");
  const text = fs.readFileSync(sitePath, "utf8");
  assert.match(text, /name:\s*"AAURIKAA"/);
  assert.equal(/IMAGINEAIRY/.test(text), false);
  for (const key of MARKETPLACE_STATIC_PAGE_KEYS) {
    assert.equal(text.includes(`/${key}`), false, `footer must not link /${key}`);
    assert.equal(text.includes(key), false, `siteConfig must not mention ${key}`);
  }
  assert.match(text, /href: "\/privacy"/);
  assert.match(text, /href: "\/terms"/);
  assert.match(text, /href: "\/shipping"/);
  assert.match(text, /href: "\/returns"/);
  assert.match(text, /href: "\/faqs"/);
  assert.match(text, /href: "\/refund-policy"/);
  assert.match(text, /href: "\/about"/);
  assert.match(text, /href: "\/contact"/);
});

test("static page UI does not invent refund policy substance", () => {
  const root = path.resolve(import.meta.dirname, "../..");
  const files = [
    "components/static-pages/static-page-view.tsx",
    "components/static-pages/zone-renderer.tsx",
    "app/[pageSlug]/page.tsx",
  ];
  const banned = [
    "5–7 business days",
    "5-7 business days",
    "7 calendar days",
    "eligible for refund",
    "Non-Refundable Items",
    "Refund Processing Time",
  ];
  for (const rel of files) {
    const text = fs.readFileSync(path.join(root, rel), "utf8");
    for (const phrase of banned) {
      assert.equal(
        text.toLowerCase().includes(phrase.toLowerCase()),
        false,
        `${rel} must not contain invented policy copy: ${phrase}`,
      );
    }
    assert.match(text, /Content coming soon|StaticPageView|StaticPageZones/);
  }
});

test("CMS TipTapRenderer reuses StructuredContent and respects textAlign attrs", () => {
  const root = path.resolve(import.meta.dirname, "../..");
  const tiptap = fs.readFileSync(path.join(root, "lib/static-pages/tiptap.tsx"), "utf8");
  const structured = fs.readFileSync(
    path.join(root, "components/product/structured-content.tsx"),
    "utf8",
  );
  assert.match(tiptap, /StructuredContent/);
  assert.match(tiptap, /cms-rich-text/);
  assert.equal(/text-align:\s*center/.test(tiptap), false);
  assert.match(structured, /alignStyleFromNode/);
  assert.match(structured, /textAlign/);
  assert.match(structured, /TEXT_ALIGNS/);
});

test("static page content uses full container width (no narrow max-w-3xl gutter)", () => {
  const view = fs.readFileSync(
    path.resolve(import.meta.dirname, "../../components/static-pages/static-page-view.tsx"),
    "utf8",
  );
  assert.equal(view.includes("max-w-3xl"), false);
  assert.match(view, /StaticPageZones/);
  assert.match(view, /className="w-full"/);
});
