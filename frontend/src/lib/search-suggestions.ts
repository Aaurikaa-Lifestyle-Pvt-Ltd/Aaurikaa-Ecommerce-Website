import type { SearchSuggestionsResponse } from "./api/search.ts";

export type SuggestionKind =
  | "product"
  | "category"
  | "subcategory"
  | "childCategory";

export type SuggestionItem = {
  id: string;
  kind: SuggestionKind;
  label: string;
  href: string;
  /** Optional hierarchy hint under the label (taxonomy only). */
  meta?: string;
};

export const SUGGESTION_SECTION_LABELS: Record<SuggestionKind, string> = {
  product: "Pieces",
  category: "Categories",
  subcategory: "Collections",
  childCategory: "Styles",
};

const SECTION_ORDER: SuggestionKind[] = [
  "product",
  "category",
  "subcategory",
  "childCategory",
];

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Build storefront hrefs from suggestion slugs (existing category/product routes). */
export function hrefForSuggestion(
  kind: SuggestionKind,
  item: {
    slug?: string;
    category?: { slug?: string } | null;
    subcategory?: { slug?: string } | null;
  },
): string | null {
  const slug = asText(item.slug);
  if (!slug) return null;

  if (kind === "product") return `/products/${encodeURIComponent(slug)}`;

  if (kind === "category") return `/categories/${encodeURIComponent(slug)}`;

  const categorySlug = asText(item.category?.slug);
  if (kind === "subcategory") {
    if (!categorySlug) return null;
    return `/categories/${encodeURIComponent(categorySlug)}/${encodeURIComponent(slug)}`;
  }

  const subSlug = asText(item.subcategory?.slug);
  if (!categorySlug || !subSlug) return null;
  return `/categories/${encodeURIComponent(categorySlug)}/${encodeURIComponent(subSlug)}/${encodeURIComponent(slug)}`;
}

/**
 * Map backend grouped suggestions → flat listbox rows.
 * Intentionally omits brands, sellers, and tags (single-store jewellery UX).
 */
export function mapGroupedSuggestions(
  raw: SearchSuggestionsResponse | null | undefined,
): SuggestionItem[] {
  if (!raw) return [];

  const items: SuggestionItem[] = [];

  for (const product of raw.products ?? []) {
    const label = asText(product.name);
    const href = hrefForSuggestion("product", product);
    const id = asText(product._id) || href || label;
    if (!label || !href) continue;
    items.push({ id: `product:${id}`, kind: "product", label, href });
  }

  for (const category of raw.categories ?? []) {
    const label = asText(category.name);
    const href = hrefForSuggestion("category", category);
    const id = asText(category._id) || href || label;
    if (!label || !href) continue;
    items.push({ id: `category:${id}`, kind: "category", label, href });
  }

  for (const sub of raw.subcategories ?? []) {
    const label = asText(sub.name);
    const href = hrefForSuggestion("subcategory", sub);
    const id = asText(sub._id) || href || label;
    if (!label || !href) continue;
    const parent = asText(sub.category?.name);
    items.push({
      id: `subcategory:${id}`,
      kind: "subcategory",
      label,
      href,
      meta: parent || undefined,
    });
  }

  for (const child of raw.childCategories ?? []) {
    const label = asText(child.name);
    const href = hrefForSuggestion("childCategory", child);
    const id = asText(child._id) || href || label;
    if (!label || !href) continue;
    const crumbs = [asText(child.category?.name), asText(child.subcategory?.name)]
      .filter(Boolean)
      .join(" · ");
    items.push({
      id: `childCategory:${id}`,
      kind: "childCategory",
      label,
      href,
      meta: crumbs || undefined,
    });
  }

  return items;
}

/** Group flat items for sectioned rendering while preserving global index order. */
export function groupSuggestionItems(
  items: SuggestionItem[],
): Array<{ kind: SuggestionKind; label: string; items: SuggestionItem[] }> {
  return SECTION_ORDER.map((kind) => ({
    kind,
    label: SUGGESTION_SECTION_LABELS[kind],
    items: items.filter((item) => item.kind === kind),
  })).filter((section) => section.items.length > 0);
}

/**
 * Case-insensitive highlight of `query` inside `text`.
 * Returns alternating plain / match segments for React rendering.
 */
export function highlightQuery(
  text: string,
  query: string,
): Array<{ text: string; match: boolean }> {
  const needle = query.trim();
  if (!needle || !text) return [{ text, match: false }];

  const lowerText = text.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const parts: Array<{ text: string; match: boolean }> = [];
  let cursor = 0;

  while (cursor < text.length) {
    const index = lowerText.indexOf(lowerNeedle, cursor);
    if (index === -1) {
      parts.push({ text: text.slice(cursor), match: false });
      break;
    }
    if (index > cursor) {
      parts.push({ text: text.slice(cursor, index), match: false });
    }
    parts.push({
      text: text.slice(index, index + needle.length),
      match: true,
    });
    cursor = index + needle.length;
  }

  return parts.length ? parts : [{ text, match: false }];
}

export function isSuggestionTermReady(q: string): boolean {
  return q.trim().length >= 2;
}
