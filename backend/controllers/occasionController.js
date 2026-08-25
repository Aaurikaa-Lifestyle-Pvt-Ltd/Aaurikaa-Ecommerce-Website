const Occasion = require("../models/Occasion");
const { createMerchandisingController } = require("./merchandisingCrud");

module.exports = createMerchandisingController({
  Model: Occasion,
  label: "Occasion",
  titleKey: "name",
  hasSlug: true,
  hasHomeFilter: true,
  stringFields: ["name", "description", "imageUrl", "imageAlt", "seoTitle", "seoDescription"],
  urlFields: ["imageUrl"],
  booleanFields: ["isActive", "showOnHome"],
});
