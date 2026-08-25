/**
 * Storefront static-page routing: registry pageKeys ↔ public slugs + short aliases.
 * Marketplace/seller keys are intentionally excluded (single-store).
 */

export type StaticPageRoute = {
  pageKey: string;
  /** Registry slug path without leading slash (e.g. privacy-policy). */
  slug: string;
  title: string;
  /** Short aliases currently used by siteConfig / marketing links. */
  aliases?: readonly string[];
};

/** Seller/marketplace keys — must not be linked from storefront defaults. */
export const MARKETPLACE_STATIC_PAGE_KEYS = [
  "become-seller",
  "seller-faq",
  "seller-help-center",
  "seller-terms-condition",
  "seller-training",
] as const;

export const STATIC_PAGE_ROUTES: readonly StaticPageRoute[] = [
  { pageKey: "about", slug: "about", title: "About Us" },
  { pageKey: "contact", slug: "contact", title: "Contact Us" },
  { pageKey: "faq", slug: "faq", title: "FAQ", aliases: ["faqs"] },
  { pageKey: "help-center", slug: "help-center", title: "Help Center" },
  {
    pageKey: "jewellery-care",
    slug: "jewellery-care",
    title: "Jewellery Care",
    aliases: ["jewelry-care", "care"],
  },
  {
    pageKey: "shipping-policy",
    slug: "shipping-policy",
    title: "Shipping Policy",
    aliases: ["shipping"],
  },
  {
    pageKey: "returns-refund-policy",
    slug: "returns-refund-policy",
    title: "Returns & Refund Policy",
    aliases: ["returns", "refund-policy"],
  },
  {
    pageKey: "privacy-policy",
    slug: "privacy-policy",
    title: "Privacy Policy",
    aliases: ["privacy"],
  },
  {
    pageKey: "terms-condition",
    slug: "terms-condition",
    title: "Terms & Conditions",
    aliases: ["terms"],
  },
  { pageKey: "cookies", slug: "cookies", title: "Cookies Policy" },
  { pageKey: "security-policy", slug: "security-policy", title: "Security Policy" },
  {
    pageKey: "warranty-guarantee",
    slug: "warranty-guarantee",
    title: "Warranty & Guarantee",
  },
  { pageKey: "delivery-info", slug: "delivery-info", title: "Delivery Info" },
  { pageKey: "payment-options", slug: "payment-options", title: "Payment Options" },
  { pageKey: "accessibility", slug: "accessibility", title: "Accessibility" },
  {
    pageKey: "well-wisher-suggestions",
    slug: "well-wisher-suggestions",
    title: "Well-Wisher Suggestions",
    aliases: ["well-wisher", "feedback"],
  },
] as const;

const slugToPageKey = new Map<string, string>();
const pageKeyToRoute = new Map<string, StaticPageRoute>();

for (const route of STATIC_PAGE_ROUTES) {
  pageKeyToRoute.set(route.pageKey, route);
  slugToPageKey.set(route.slug, route.pageKey);
  for (const alias of route.aliases ?? []) {
    slugToPageKey.set(alias, route.pageKey);
  }
}

export function isMarketplaceStaticPageKey(pageKey: string): boolean {
  return (MARKETPLACE_STATIC_PAGE_KEYS as readonly string[]).includes(pageKey);
}

/** Resolve a URL path segment (no leading slash) to a pageKey. */
export function resolvePageKeyFromSlug(slug: string): string | null {
  const normalized = slug.replace(/^\/+|\/+$/g, "").trim().toLowerCase();
  if (!normalized) return null;
  const pageKey = slugToPageKey.get(normalized) ?? null;
  if (!pageKey || isMarketplaceStaticPageKey(pageKey)) return null;
  return pageKey;
}

export function getStaticPageRoute(pageKey: string): StaticPageRoute | null {
  if (isMarketplaceStaticPageKey(pageKey)) return null;
  return pageKeyToRoute.get(pageKey) ?? null;
}

/** Canonical public path for a pageKey (with leading slash). */
export function canonicalPathForPageKey(pageKey: string): string | null {
  const route = getStaticPageRoute(pageKey);
  return route ? `/${route.slug}` : null;
}

export function listPublicStaticSlugs(): string[] {
  const slugs: string[] = [];
  for (const route of STATIC_PAGE_ROUTES) {
    slugs.push(route.slug);
    for (const alias of route.aliases ?? []) slugs.push(alias);
  }
  return slugs;
}
