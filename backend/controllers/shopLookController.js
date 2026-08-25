const ShopLook = require("../models/ShopLook");
const { createMerchandisingController } = require("./merchandisingCrud");

module.exports = createMerchandisingController({
  Model: ShopLook,
  label: "Look",
  titleKey: "title",
  hasSlug: true,
  stringFields: [
    "title",
    "description",
    "imageUrl",
    "imageAlt",
    "mobileImageUrl",
    "mobileImageAlt",
    "ctaLabel",
    "ctaHref",
  ],
  urlFields: ["imageUrl", "mobileImageUrl"],
  booleanFields: ["isActive"],
  extraValidators(doc) {
    if (doc.ctaHref && !/^(\/|https?:)/i.test(doc.ctaHref)) {
      return { error: "ctaHref must be a site-relative path or http(s) URL." };
    }
    return { ok: true };
  },
});
