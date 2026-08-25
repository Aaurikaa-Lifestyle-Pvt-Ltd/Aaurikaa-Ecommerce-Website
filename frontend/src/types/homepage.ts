/**
 * Homepage composition types.
 *
 * The homepage is expressed as an ordered list of typed sections (brief §28).
 * This is deliberately a small, closed union — NOT a generic page-builder /
 * CMS engine (explicitly out of scope, brief §35). It exists so the locked
 * section order (brief §10) lives as data rather than being hardcoded into a
 * single component tree.
 */

import type { CampaignBannerVariant } from "./commerce";
import type { BannerPlacement } from "@/lib/mappers/slider";

export type HomepageSectionType =
  | "announcement"
  | "hero"
  | "banner-slider"
  | "category-showcase"
  | "product-showcase"
  | "campaign-banner"
  | "shop-the-look"
  | "collection-stories"
  | "occasion-showcase"
  | "ugc-gallery"
  | "brand-story"
  | "trust-strip"
  | "wear-your-story";

export interface HomepageSection {
  type: HomepageSectionType;
  /**
   * Collection slug for data-driven merchandising sections
   * (e.g. product-showcase with collection "new-arrivals" / "best-sellers").
   */
  collection?: string;
  /**
   * Controlled campaign-banner variant (brief §16 / §19) —
   * "collection-seasonal" or "editorial-lifestyle".
   */
  variant?: CampaignBannerVariant;
  /** Banner slider placement when type is banner-slider. */
  placement?: BannerPlacement;
}
