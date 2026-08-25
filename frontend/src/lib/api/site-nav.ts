export type HeaderNavLink = { label: string; href: string };

/**
 * Parse SiteSettings header.menuLinks into nav items.
 * Supported entries: `/path`, `Label|/path`, `Label|https://…`
 * Unusable strings (label-only) are skipped — fall back to siteConfig nav.
 */
export function parseHeaderMenuLinks(
  menuLinks: string[] | null | undefined,
): HeaderNavLink[] {
  if (!Array.isArray(menuLinks) || menuLinks.length === 0) return [];

  const links: HeaderNavLink[] = [];
  for (const raw of menuLinks) {
    const value = String(raw ?? "").trim();
    if (!value) continue;

    let label = "";
    let hrefRaw = value;
    const pipe = value.indexOf("|");
    if (pipe > 0) {
      label = value.slice(0, pipe).trim();
      hrefRaw = value.slice(pipe + 1).trim();
    }

    const href = sanitizeHeaderHref(hrefRaw);
    if (!href) continue;
    if (!label) {
      const segment = href.split("/").filter(Boolean).pop() || "Page";
      label = segment
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
    links.push({ label, href });
  }
  return links;
}

function sanitizeHeaderHref(href: string): string | null {
  const value = href.trim();
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return value;
  } catch {
    return null;
  }
  return null;
}
