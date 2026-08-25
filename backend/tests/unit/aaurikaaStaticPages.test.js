const {
  shouldExposeStaticPageKey,
  listVisibleRegistryEntries,
  emptyZonesFromManifest,
} = require("../../utils/aaurikaaStaticPages");
const {
  isMarketplaceStaticPageKey,
  isAllowedPageKey,
  getRegistryEntry,
} = require("../../config/staticPageRegistry");
const { getManifest, ZONE_TYPES } = require("../../config/staticPageManifests");
const { validateStaticPagePayload } = require("../../utils/staticPageValidation");
const {
  validateHeroBanner,
  validateImageBlock,
  validateImageText,
  validateCardGrid,
  AAURIKAA_SECTION_TYPES,
} = require("../../utils/staticPageStructuredZones");
const staticPageController = require("../../controllers/staticPageController");
const StaticPageContent = require("../../models/StaticPageContent");

jest.mock("../../models/StaticPageContent");

describe("AAURIKAA static CMS boundary", () => {
  const previousFlag = process.env.AAURIKAA_ENABLE_MARKETPLACE_SURFACES;

  afterEach(() => {
    if (previousFlag === undefined) {
      delete process.env.AAURIKAA_ENABLE_MARKETPLACE_SURFACES;
    } else {
      process.env.AAURIKAA_ENABLE_MARKETPLACE_SURFACES = previousFlag;
    }
    jest.clearAllMocks();
  });

  it("hides marketplace seller pages unless the marketplace flag is on", () => {
    delete process.env.AAURIKAA_ENABLE_MARKETPLACE_SURFACES;
    expect(isMarketplaceStaticPageKey("become-seller")).toBe(true);
    expect(shouldExposeStaticPageKey("become-seller")).toBe(false);
    expect(shouldExposeStaticPageKey("faq")).toBe(true);

    const keys = listVisibleRegistryEntries().map((entry) => entry.pageKey);
    expect(keys).not.toContain("seller-faq");
    expect(keys).not.toContain("seller-terms-condition");
    expect(keys).not.toContain("become-seller");
    expect(keys).not.toContain("seller-help-center");
    expect(keys).not.toContain("seller-training");
    expect(keys).toContain("privacy-policy");
    expect(keys).toContain("returns-refund-policy");
    expect(keys).toContain("jewellery-care");
    expect(keys).toContain("about");
    expect(keys).toContain("shipping-policy");
    expect(keys).toContain("contact");
  });

  it("registers jewellery-care with AAURIKAA-native care structure", () => {
    expect(isAllowedPageKey("jewellery-care")).toBe(true);
    expect(getRegistryEntry("jewellery-care")).toMatchObject({
      pageKey: "jewellery-care",
      slug: "/jewellery-care",
      title: "Jewellery Care",
    });
    const manifest = getManifest("jewellery-care");
    expect(manifest).toBeTruthy();
    expect(manifest.zones.map((z) => z.type)).toEqual([
      "heroBanner",
      "orderedSections",
      "supportPanel",
    ]);
    const empty = emptyZonesFromManifest(manifest);
    expect(empty.sections).toEqual([]);
    expect(empty.hero.media).toEqual({ mediaId: "", url: "", alt: "" });
    const serialized = JSON.stringify(empty);
    expect(serialized).not.toMatch(/Anbazar/i);
  });

  it("replaces AnBazar About slots with AAURIKAA-native section vocabulary", () => {
    const manifest = getManifest("about");
    const types = manifest.zones.map((z) => z.type);
    expect(types).toContain("heroBanner");
    expect(types).toContain("orderedSections");
    expect(types).toContain("ctaCard");
    expect(types).not.toContain("testimonialList");
    expect(types).not.toContain("linkCardList");
    const defaults = JSON.stringify(manifest.zoneDefaults);
    expect(defaults).not.toMatch(/Anbazar|AnBazar|marketplace/i);
    expect(manifest.zoneDefaults.sections).toEqual([]);
  });

  it("empty FAQ / legal editor zones do not copy AnBazar refund or marketplace copy", () => {
    for (const key of [
      "faq",
      "returns-refund-policy",
      "privacy-policy",
      "terms-condition",
      "shipping-policy",
    ]) {
      const zones = emptyZonesFromManifest(getManifest(key));
      const serialized = JSON.stringify(zones);
      expect(serialized).not.toMatch(/5–7 business days/);
      expect(serialized).not.toMatch(/Anbazar/i);
      expect(serialized).not.toMatch(/marketplace/i);
    }
    expect(emptyZonesFromManifest(getManifest("faq")).faqItems).toEqual([]);
    expect(emptyZonesFromManifest(getManifest("returns-refund-policy")).sections).toEqual([]);
  });

  it("exposes AAURIKAA-native zone types in ZONE_TYPES", () => {
    for (const type of [
      "heroBanner",
      "image",
      "imageText",
      "orderedSections",
      "cardGrid",
      "cta",
      "richText",
      "faqList",
      "ctaCard",
      "contactCard",
      "supportPanel",
    ]) {
      expect(ZONE_TYPES.has(type)).toBe(true);
    }
    for (const type of AAURIKAA_SECTION_TYPES) {
      expect(typeof type).toBe("string");
    }
  });

  it("requires image url for non-empty heroBanner / image / imageText", () => {
    expect(validateHeroBanner({ title: "Hello" }).ok).toBe(false);
    expect(
      validateHeroBanner({
        media: { url: "https://cdn.example.com/hero.jpg", alt: "Hero" },
        title: "Hello",
      }).ok
    ).toBe(true);

    expect(validateImageBlock({ media: { alt: "x" } }).ok).toBe(false);
    expect(
      validateImageBlock({
        media: { mediaId: "abc", url: "https://cdn.example.com/a.jpg", alt: "A", caption: "Cap" },
      }).normalized.media
    ).toMatchObject({
      mediaId: "abc",
      url: "https://cdn.example.com/a.jpg",
      alt: "A",
      caption: "Cap",
    });

    expect(
      validateImageText(
        { media: { url: "" }, bodyRichText: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hi" }] }] } },
        {
          parseRichText: (v) => (typeof v === "object" ? v : JSON.parse(v)),
          validateRichTextDoc: () => ({ ok: true }),
        }
      ).ok
    ).toBe(false);
  });

  it("rejects unknown ordered section types and accepts allowlisted ones", () => {
    const bad = validateStaticPagePayload({
      pageKey: "about",
      status: "draft",
      seo: { title: "", metaDescription: "" },
      zones: {
        hero: { media: { mediaId: "", url: "", alt: "" }, title: "", subcopy: "", ctaLabel: "", ctaHref: "" },
        sections: [{ type: "pageBuilderBlock", body: "nope" }],
        closingCta: { heading: "", description: "", buttonLabel: "", buttonHref: "" },
      },
    });
    expect(bad.ok).toBe(false);
    expect(bad.message).toMatch(/unknown section type/i);

    const good = validateStaticPagePayload({
      pageKey: "about",
      status: "draft",
      seo: { title: "About", metaDescription: "" },
      zones: {
        hero: {
          media: { mediaId: "m1", url: "https://cdn.example.com/h.jpg", alt: "Hero" },
          title: "About AAURIKAA",
          subcopy: "",
          ctaLabel: "",
          ctaHref: "",
        },
        sections: [
          {
            type: "imageText",
            media: { url: "https://cdn.example.com/s.jpg", alt: "Story", caption: "" },
            bodyRichText: JSON.stringify({
              type: "doc",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Our story" }] }],
            }),
            imagePosition: "left",
          },
          {
            type: "cardGrid",
            items: [{ title: "Craft", description: "Detail", href: "/shop", media: { url: "", alt: "" } }],
          },
        ],
        closingCta: { heading: "", description: "", buttonLabel: "", buttonHref: "" },
      },
    });
    expect(good.ok).toBe(true);
    expect(good.normalized.zones.sections).toHaveLength(2);
    expect(good.normalized.zones.sections[0].type).toBe("imageText");
    expect(good.normalized.zones.hero.media.url).toContain("cdn.example.com");
  });

  it("validates cardGrid and ignores empty draft hero", () => {
    expect(validateCardGrid([]).ok).toBe(true);
    expect(validateCardGrid([{ title: "Only title" }]).ok).toBe(true);
    expect(validateCardGrid([{ description: "no title" }]).ok).toBe(false);
    expect(validateHeroBanner({ media: { url: "", alt: "" }, title: "" }).ok).toBe(true);
  });

  it("admin GET of a missing page does not persist seeded content", async () => {
    StaticPageContent.findOne.mockResolvedValue(null);
    StaticPageContent.create = jest.fn();

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await staticPageController.getByPageKeyAdmin({ params: { pageKey: "faq" } }, res);

    expect(StaticPageContent.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.data.page).toBeNull();
    expect(body.data.emptyZones.faqItems).toEqual([]);
  });

  it("public GET rejects marketplace page keys in single-store mode", async () => {
    delete process.env.AAURIKAA_ENABLE_MARKETPLACE_SURFACES;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await staticPageController.getPublishedByPageKey(
      { query: { pageKey: "become-seller" } },
      res
    );

    expect(StaticPageContent.findOne).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
