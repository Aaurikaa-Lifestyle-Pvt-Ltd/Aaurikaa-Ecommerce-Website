/**
 * Safe href helpers for CMS-authored links.
 * TipTap content: http(s) and same-origin paths only.
 * Structured CTAs: also mailto: / tel:.
 */

function trimHref(href: unknown): string {
  return typeof href === "string" ? href.trim() : "";
}

/** Pathname only (lowercase, no trailing slash) for marketplace matching. */
function hrefPathname(href: string): string {
  const raw = href.startsWith("http")
    ? (() => {
        try {
          return new URL(href).pathname;
        } catch {
          return href;
        }
      })()
    : (href.split("?")[0] ?? href);
  return raw.toLowerCase().replace(/\/+$/, "");
}

/** Reject javascript:, data:, protocol-relative, and unknown schemes. */
export function sanitizeContentHref(href: unknown): string | null {
  const value = trimHref(href);
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    const protocol = url.protocol.toLowerCase();
    if (protocol === "http:" || protocol === "https:") return value;
  } catch {
    return null;
  }
  return null;
}

export function sanitizeActionHref(href: unknown): string | null {
  const value = trimHref(href);
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  if (value.startsWith("#") && !value.startsWith("#javascript")) return value;
  try {
    const url = new URL(value);
    const protocol = url.protocol.toLowerCase();
    if (["http:", "https:", "mailto:", "tel:"].includes(protocol)) return value;
  } catch {
    return null;
  }
  return null;
}

/**
 * Marketplace / seller portal paths — never link from AAURIKAA footer or CMS columns.
 * Matches /seller*, become-seller, vendor dashboard style URLs.
 */
export function isMarketplaceFooterHref(href: string): boolean {
  const path = hrefPathname(href);
  if (!path) return false;
  if (path.includes("become-seller")) return true;
  if (/(^|\/)seller(\/|$|-)/.test(path)) return true;
  if (/(^|\/)vendors?(\/|$)/.test(path)) return true;
  if (path.includes("vendor-dashboard") || path.includes("/dashboard/seller")) {
    return true;
  }
  return false;
}

/** Sanitize then drop marketplace seller/vendor footer links. */
export function scrubFooterHref(raw: unknown): string | null {
  const sanitized = sanitizeActionHref(raw);
  if (!sanitized) return null;
  if (isMarketplaceFooterHref(sanitized)) return null;
  return sanitized;
}
