import type { HomepageSection } from "@/types/homepage";

/**
 * Locked homepage section order (brief §10).
 *
 * Announcement, Header and Footer are part of the app layout/shell rather than
 * the composed page body, so the composition below covers the in-page sections
 * (Hero → Newsletter) in their locked order. Do not reorder or drop sections
 * without explicit product approval.
 */
export const homepageSections: HomepageSection[] = [
  { type: "banner-slider", placement: "hero" },
  { type: "category-showcase" },
  { type: "product-showcase", collection: "new-arrivals" },
  { type: "banner-slider", placement: "promo1" },
  { type: "shop-the-look" },
  { type: "collection-stories" },
  { type: "banner-slider", placement: "promo2" },
  { type: "occasion-showcase" },
  { type: "ugc-gallery" },
  { type: "product-showcase", collection: "best-sellers" },
  { type: "brand-story" },
  { type: "trust-strip" },
  { type: "wear-your-story" },
];
