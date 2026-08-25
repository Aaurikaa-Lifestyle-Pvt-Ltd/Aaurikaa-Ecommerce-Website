const StyledByYou = require("../models/StyledByYou");
const { createMerchandisingController } = require("./merchandisingCrud");
const { isHttpUrl } = require("../utils/merchandising");

module.exports = createMerchandisingController({
  Model: StyledByYou,
  label: "Styled by You item",
  titleKey: "creatorName",
  requireTitle: false,
  hasSlug: false,
  attachFirstProductSlug: true,
  stringFields: ["mediaType", "imageUrl", "imageAlt", "videoUrl", "creatorName", "caption", "externalUrl"],
  urlFields: ["imageUrl", "videoUrl", "externalUrl"],
  booleanFields: ["isActive"],
  extraValidators(doc) {
    if (doc.mediaType && !["image", "video"].includes(doc.mediaType)) {
      return { error: "mediaType must be image or video." };
    }
    if (doc.mediaType === "video") {
      if (!doc.videoUrl) return { error: "videoUrl is required for video content." };
    } else if (!doc.imageUrl) {
      return { error: "imageUrl is required for image content." };
    }
    if (doc.externalUrl && !isHttpUrl(doc.externalUrl)) {
      return { error: "externalUrl must be an http(s) URL." };
    }
    return { ok: true };
  },
});
