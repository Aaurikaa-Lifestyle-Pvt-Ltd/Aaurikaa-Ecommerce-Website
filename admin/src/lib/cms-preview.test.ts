import assert from "node:assert/strict";
import test from "node:test";
import { pruneOrderedSections } from "./cms-ordered-sections.ts";
import { storefrontPreviewPath } from "./cms-preview.ts";

test("storefrontPreviewPath maps AAURIKAA page keys", () => {
  const about = storefrontPreviewPath("about");
  assert.equal(about.path, "/about");
  assert.equal(about.href, null);
  assert.match(String(about.note), /NEXT_PUBLIC_STOREFRONT_URL/);

  assert.equal(storefrontPreviewPath("jewellery-care").path, "/jewellery-care");
  assert.equal(
    storefrontPreviewPath("contact", "/contact").path,
    "/contact",
  );
});

test("pruneOrderedSections drops incomplete stubs", () => {
  const pruned = pruneOrderedSections([
    { type: "richText", heading: "", bodyRichText: "" },
    { type: "image", media: { url: "", alt: "" } },
    {
      type: "ctaCard",
      heading: "Visit contact",
      buttonLabel: "Contact",
      buttonHref: "/contact",
    },
    { type: "faqList", items: [] },
    {
      type: "faqList",
      items: [{ q: "How to care?", a: "Store jewellery dry." }],
    },
  ]);
  assert.equal(pruned.length, 2);
  assert.equal(pruned[0]?.type, "ctaCard");
  assert.equal(pruned[1]?.type, "faqList");
});
