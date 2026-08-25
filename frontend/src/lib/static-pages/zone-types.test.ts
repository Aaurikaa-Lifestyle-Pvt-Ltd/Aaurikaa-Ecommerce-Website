import assert from "node:assert/strict";
import test from "node:test";
import {
  hasRenderableZones,
  isEmptyZoneValue,
  resolveZoneType,
} from "./zone-types.ts";

test("resolves jewellery CMS zone ids", () => {
  assert.equal(
    resolveZoneType("hero", {
      media: { url: "https://cdn.example/h.jpg", alt: "Hero" },
      title: "Care",
    }),
    "heroBanner",
  );
  assert.equal(resolveZoneType("faqItems", [{ q: "Q?", a: "A" }]), "faqList");
  assert.equal(
    resolveZoneType("closingCta", {
      heading: "Talk to us",
      buttonLabel: "Contact",
      buttonHref: "/contact",
    }),
    "ctaCard",
  );
});

test("sections zone prefers orderedSections when typed", () => {
  assert.equal(
    resolveZoneType("sections", [
      { type: "richText", heading: "Hello", bodyRichText: "{}" },
    ]),
    "orderedSections",
  );
  assert.equal(
    resolveZoneType("sections", [
      { title: "Policy", bodyRichText: JSON.stringify({ type: "doc", content: [] }) },
    ]),
    "sectionList",
  );
});

test("empty published-looking zones are detected", () => {
  assert.equal(
    isEmptyZoneValue("heroBanner", {
      media: { mediaId: "", url: "", alt: "" },
      title: "",
      subcopy: "",
    }),
    true,
  );
  assert.equal(
    isEmptyZoneValue("image", { media: { url: "https://cdn.example/a.jpg", alt: "" } }),
    false,
  );
  assert.equal(isEmptyZoneValue("orderedSections", []), true);
  assert.equal(
    hasRenderableZones({
      hero: { media: { url: "", alt: "" }, title: "" },
      sections: [],
    }),
    false,
  );
  assert.equal(
    hasRenderableZones({
      hero: {
        media: { url: "https://cdn.example/h.jpg", alt: "Ring" },
        title: "About",
      },
    }),
    true,
  );
});

test("unknown zone shapes are ignored", () => {
  assert.equal(resolveZoneType("mystery", { foo: 1 }), null);
  assert.equal(resolveZoneType("mystery", [{ weird: true }]), null);
});
