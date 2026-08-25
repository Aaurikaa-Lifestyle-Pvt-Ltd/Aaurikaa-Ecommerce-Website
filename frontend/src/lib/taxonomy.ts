/**
 * Pure taxonomy path helpers — catch-all `/categories/[...path]` segments.
 */

export type TaxonomyPath = {
  categorySlug: string;
  subSlug?: string;
  childSlug?: string;
  depth: 1 | 2 | 3;
};

/** Build a canonical storefront taxonomy href (1–3 segments). */
export function buildTaxonomyHref(
  categorySlug: string,
  subSlug?: string,
  childSlug?: string,
): string {
  const parts = [categorySlug, subSlug, childSlug]
    .map((p) => String(p ?? "").trim())
    .filter(Boolean);
  if (parts.length === 0) return "/categories";
  return `/categories/${parts.map(encodeURIComponent).join("/")}`;
}

/**
 * Parse catch-all path segments into a taxonomy path.
 * Returns null when empty or deeper than 3 segments.
 */
export function parseTaxonomyPath(
  segments: string[] | undefined | null,
): TaxonomyPath | null {
  if (!segments || segments.length === 0) return null;
  if (segments.length > 3) return null;

  const cleaned = segments
    .map((s) => decodeURIComponent(String(s ?? "").trim()))
    .filter(Boolean);
  if (cleaned.length === 0 || cleaned.length > 3) return null;

  const categorySlug = cleaned[0]!;
  if (!categorySlug) return null;

  if (cleaned.length === 1) {
    return { categorySlug, depth: 1 };
  }
  if (cleaned.length === 2) {
    return { categorySlug, subSlug: cleaned[1], depth: 2 };
  }
  return {
    categorySlug,
    subSlug: cleaned[1],
    childSlug: cleaned[2],
    depth: 3,
  };
}
