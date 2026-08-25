const MerchCollection = require("../models/MerchCollection");
const { createMerchandisingController } = require("./merchandisingCrud");

module.exports = createMerchandisingController({
  Model: MerchCollection,
  label: "Collection",
  titleKey: "name",
  hasSlug: true,
  hasHomeFilter: true,
  stringFields: ["name", "description", "imageUrl", "imageAlt", "seoTitle", "seoDescription"],
  urlFields: ["imageUrl"],
  booleanFields: ["isActive", "showOnHome"],
});
