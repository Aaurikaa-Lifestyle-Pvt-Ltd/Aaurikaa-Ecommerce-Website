/**
 * Resolve a storefront preview URL for a CMS page.
 * Uses NEXT_PUBLIC_STOREFRONT_URL when set; otherwise shows path-only guidance.
 */

const PAGE_KEY_TO_PATH: Record<string, string> = {
  about: "/about",
  contact: "/contact",
  faq: "/faq",
  "jewellery-care": "/jewellery-care",
  "shipping-policy": "/shipping-policy",
  "returns-refund-policy": "/returns-refund-policy",
  "privacy-policy": "/privacy-policy",
  "terms-condition": "/terms-condition",
  "well-wisher-suggestions": "/well-wisher-suggestions",
  cookies: "/cookies",
  "help-center": "/help-center",
  "security-policy": "/security-policy",
  "warranty-guarantee": "/warranty-guarantee",
  "delivery-info": "/delivery-info",
  "payment-options": "/payment-options",
  accessibility: "/accessibility",
};

function normalizeSlugPath(slug?: string | null): string | null {
  if (!slug) return null;
  const trimmed = String(slug).trim();
  if (!trimmed) return null;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function storefrontPreviewPath(
  pageKey: string,
  slug?: string | null,
): { path: string | null; href: string | null; note?: string } {
  const path =
    normalizeSlugPath(slug) ||
    PAGE_KEY_TO_PATH[pageKey] ||
    (pageKey ? `/${pageKey}` : null);

  if (!path) {
    return { path: null, href: null };
  }

  const base = (process.env.NEXT_PUBLIC_STOREFRONT_URL ?? "").trim().replace(/\/+$/, "");
  if (!base) {
    return {
      path,
      href: null,
      note: "Set NEXT_PUBLIC_STOREFRONT_URL for a clickable preview link.",
    };
  }

  return { path, href: `${base}${path}` };
}
