/**
 * Core commerce domain types for the IMAGINEAIRY single-vendor storefront.
 *
 * These types describe the demo's mock data but are shaped to resemble the
 * future Laravel API domain (see ECOMMERCE_DEMO_MASTER_BRIEF.md §33/§34), so
 * that swapping the data source does not require rewriting presentation
 * components.
 *
 * The vocabulary here is intentionally industry-neutral. Nothing should assume
 * "jewellery" — the same model must be able to power fashion, furniture or
 * general retail storefronts.
 */

/** A monetary amount. Kept minor-unit-agnostic for the demo. */
export interface Money {
  amount: number;
  currency: string;
}

/** Restrained badge system (brief §15). Normally only one is shown per card. */
export type ProductBadge =
  | "new"
  | "bestseller"
  | "trending"
  | "sale"
  | "sold-out";

export interface ProductImage {
  src: string;
  alt: string;
}

/** A purchasable variant of a product (size, colour, material, etc.). */
export interface ProductVariant {
  id: string;
  title: string;
  /** e.g. { Size: "M", Colour: "Gold" } */
  options: Record<string, string>;
  price: Money;
  compareAtPrice?: Money;
  inStock: boolean;
  /** Available units when API provides variantStock (UI qty cap only). */
  stock?: number;
  sku?: string;
}

/**
 * Expandable PDP detail section (description, materials, care, shipping…).
 * Industry-neutral key/title/content — not jewellery-specific.
 *
 * Mixed content shape:
 * - `content` — plain attribute/list lines (whitespace-pre-line)
 * - `richContents` — TipTap JSON or plain narrative blobs (StructuredContent)
 */
export interface ProductDetailSection {
  id: string;
  title: string;
  content?: string;
  richContents?: string[];
}

/** Product Q&A pair from Admin/API `qandas`. */
export interface ProductFaq {
  question: string;
  answer: string;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  /** Product-level SKU from API (distinct from variant sku). */
  sku?: string;
  /** Primary and (optional) secondary/hover imagery. */
  image: ProductImage;
  hoverImage?: ProductImage;
  gallery?: ProductImage[];
  /** Product video URL from API `video` when present. */
  video?: string;
  price: Money;
  /** Original price when discounted. */
  compareAtPrice?: Money;
  badge?: ProductBadge;
  inStock: boolean;
  /** Parent stock units when API provides `stock` (UI qty cap only). */
  stock?: number;
  /** Optional brand display name (API `brand.name` when populated). */
  brand?: string;
  /** Category slugs this product belongs to. */
  categoryIds?: string[];
  /** Subcategory slug when populated by the catalogue API. */
  subcategorySlug?: string;
  /** Child-category slug when populated by the catalogue API. */
  childCategorySlug?: string;
  /** Collection slugs used for merchandising (e.g. "new-arrivals"). */
  collectionIds?: string[];
  variants?: ProductVariant[];
  shortDescription?: string;
  /** Longer product copy for the PDP details area. */
  description?: string;
  /** Structured expandable sections (materials, care, shipping, etc.). */
  details?: ProductDetailSection[];
  /** Product FAQs from API `qandas`. */
  faqs?: ProductFaq[];
  /** SEO overrides from API `metaTitle` / `metaDescription`. */
  seoTitle?: string;
  seoDescription?: string;
  /** Catalogue avg rating when API provides `avgRating`. */
  avgRating?: number;
  /** Catalogue review count when API provides `reviewCount`. */
  reviewCount?: number;
  /** When API provides `taxIncluded` — display copy only; prices unchanged. */
  taxIncluded?: boolean;
  /** Seller verification metadata (for verified seller badge display). */
  seller?: {
    shopName?: string;
    name?: string;
    isVerified?: boolean;
  };
}

/** A browsable catalogue entry point (brief §14). */
export interface Category {
  id: string;
  slug: string;
  name: string;
  image: ProductImage;
  href: string;
  /** Optional display title from taxonomy CMS fields. */
  title?: string;
  /** Optional listing description from taxonomy CMS fields. */
  description?: string;
}

/** A curated, aesthetic-led grouping of products (brief §17). */
export interface Collection {
  id: string;
  slug: string;
  name: string;
  description?: string;
  image: ProductImage;
  href: string;
  /**
   * Editorial/"story" collection surfaced in Collection Stories (brief §17),
   * as opposed to a merchandising collection (e.g. new-arrivals, best-sellers)
   * that drives a ProductShowcase.
   */
  editorial?: boolean;
  seoTitle?: string;
  seoDescription?: string;
}

/** An editorial styling "look" that maps inspiration to products (brief §16). */
export interface Look {
  id: string;
  slug?: string;
  title: string;
  description?: string;
  image: ProductImage;
  mobileImage?: ProductImage;
  ctaLabel?: string;
  href: string;
  productIds?: string[];
}

/** A moment/context in which a customer intends to wear/use products (brief §18). */
export interface Occasion {
  id: string;
  slug: string;
  name: string;
  description?: string;
  image: ProductImage;
  href: string;
  seoTitle?: string;
  seoDescription?: string;
}

/** Real-world / social validation content (brief §19). */
export interface UGCContent {
  id: string;
  image: ProductImage;
  videoUrl?: string;
  creator?: string;
  caption?: string;
  productIds?: string[];
  href?: string;
}

/** Brand narrative block (brief §23). */
export interface BrandContent {
  eyebrow?: string;
  heading: string;
  description: string;
  image: ProductImage;
  ctaLabel?: string;
  href?: string;
}

/**
 * Lightweight trust / service benefit (brief §24).
 * Icon keys map to the in-repo icon set — not an icon library.
 */
export type TrustIconKey = "shipping" | "returns" | "support" | "secure";

export interface TrustItem {
  id: string;
  icon: TrustIconKey;
  title: string;
  description: string;
}

/** Newsletter / retention invitation content (brief §25). */
export interface NewsletterContent {
  eyebrow?: string;
  heading: string;
  description: string;
  placeholder?: string;
  ctaLabel?: string;
  successMessage?: string;
  /** Optional supporting image; omit when typography-led is preferred. */
  image?: ProductImage;
}

/** A labelled navigational call-to-action. */
export interface Cta {
  label: string;
  href: string;
}

/**
 * Static, editorial hero content (brief §13).
 *
 * The hero is image-led and CTA-driven — no carousel. All fields are content,
 * so a future client re-brands the hero by editing data, not the component.
 */
export interface HeroContent {
  eyebrow?: string;
  /** Optional — image-only heroes are valid when heading is empty/missing. */
  heading?: string;
  supportingText?: string;
  /** Primary/desktop image. */
  image: ProductImage;
  /** Optional dedicated crop for small screens (brief §31). */
  mobileImage?: ProductImage;
  /** Optional — render CTA only when present with a valid destination. */
  primaryCta?: Cta;
  secondaryCta?: Cta;
  /** Content alignment over the image. */
  align?: "left" | "center";
  /** Overlay treatment used to keep text legible over photography. */
  overlay?: "dark" | "light" | "none";
}

/**
 * Controlled campaign-banner variants (brief §16 / §19).
 *
 * Both homepage campaign positions reuse one component with different content
 * and type — industry-neutral (not jewellery-specific campaigns).
 */
export type CampaignBannerVariant =
  | "collection-seasonal"
  | "editorial-lifestyle";

/**
 * Full-width campaign presentation content (brief §16 / §19).
 *
 * Configurable fields: variant, heading, supporting copy, image, mobile image,
 * CTA / destination, visibility. Not a product grid, carousel, or second hero.
 */
export interface CampaignBannerContent {
  id: string;
  variant: CampaignBannerVariant;
  eyebrow?: string;
  /** Optional — image-led banners may omit heading. */
  heading?: string;
  supportingText?: string;
  /** Primary/desktop image. */
  image: ProductImage;
  /** Optional dedicated crop for small screens (brief §33). */
  mobileImage?: ProductImage;
  /** Optional — render CTA / wrap only when present with a valid destination. */
  cta?: Cta;
  /** When false, the banner is omitted from the page. Defaults to true. */
  visible?: boolean;
  /** Content alignment over the image. */
  align?: "left" | "center";
  /** Overlay treatment used to keep text legible over photography. */
  overlay?: "dark" | "light" | "none";
}
