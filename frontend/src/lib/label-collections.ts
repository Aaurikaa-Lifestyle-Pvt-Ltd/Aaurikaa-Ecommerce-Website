import type { Collection } from "@/types/commerce";
import type { ProductListPage } from "@/lib/discovery";

const PLACEHOLDER = "/images/placeholder.svg";

/** Operational label destinations — neutral names only, no editorial copy. */
export const LABEL_COLLECTION_SLUGS = ["new-arrivals", "best-sellers"] as const;

export type LabelCollectionSlug = (typeof LABEL_COLLECTION_SLUGS)[number];

export function isLabelCollectionSlug(slug: string): slug is LabelCollectionSlug {
  return (LABEL_COLLECTION_SLUGS as readonly string[]).includes(slug);
}

export function virtualLabelCollection(
  slug: string,
): Collection | undefined {
  if (slug === "new-arrivals") {
    return {
      id: "virtual-new-arrivals",
      slug: "new-arrivals",
      name: "New Arrivals",
      image: { src: PLACEHOLDER, alt: "New Arrivals" },
      href: "/collections/new-arrivals",
    };
  }
  if (slug === "best-sellers") {
    return {
      id: "virtual-best-sellers",
      slug: "best-sellers",
      name: "Bestsellers",
      image: { src: PLACEHOLDER, alt: "Bestsellers" },
      href: "/collections/best-sellers",
    };
  }
  return undefined;
}

/** Append virtual label destinations missing from an API MerchCollection list. */
export function mergeLabelCollections(apiCollections: Collection[]): Collection[] {
  const slugs = new Set(apiCollections.map((c) => c.slug));
  const merged = [...apiCollections];
  for (const slug of LABEL_COLLECTION_SLUGS) {
    if (slugs.has(slug)) continue;
    const virtual = virtualLabelCollection(slug);
    if (virtual) merged.push(virtual);
  }
  return merged;
}

export type LabelProductFetcher = (
  query: Record<string, string | number | undefined>,
) => Promise<ProductListPage>;

function hasResults(page: ProductListPage): boolean {
  return page.totalCount > 0 || page.products.length > 0;
}

/**
 * Products for known label destinations via public product query.
 * Prefer merchandising labels / sales sort — never invent catalogue rows.
 * Inject `fetchProducts` so unit tests stay free of the API client graph.
 *
 * `listQuery` carries page/limit/inStock/onSale (and optional sortBy) from discovery.
 */
export async function fetchProductsForLabelSlug(
  slug: string,
  fetchProducts: LabelProductFetcher,
  listQuery: Record<string, string | number | undefined> = {},
): Promise<ProductListPage> {
  const empty: ProductListPage = {
    products: [],
    totalCount: 0,
    totalPages: 1,
    currentPage: 1,
  };

  if (slug === "new-arrivals") {
    const labeled = await fetchProducts({
      ...listQuery,
      label: "new",
      sortBy: listQuery.sortBy ?? "newest",
    });
    if (hasResults(labeled)) return labeled;
    return fetchProducts({
      ...listQuery,
      sortBy: listQuery.sortBy ?? "newest",
    });
  }

  if (slug === "best-sellers") {
    if (listQuery.sortBy) {
      return fetchProducts({ ...listQuery });
    }

    const bySales = await fetchProducts({
      ...listQuery,
      sortBy: "sales",
    });
    if (hasResults(bySales)) return bySales;

    return fetchProducts({
      ...listQuery,
      label: "featured",
      sortBy: "newest",
    });
  }

  return empty;
}

/**
 * Backend list query extras for a label destination's price-bounds request.
 * Mirrors {@link fetchProductsForLabelSlug} scope (minus pagination/sort).
 */
export function labelSlugPriceBoundsQuery(
  slug: string,
  listQuery: Record<string, string | number | undefined> = {},
): Record<string, string | number | undefined> {
  if (slug === "new-arrivals") {
    return { ...listQuery, label: "new" };
  }
  if (slug === "best-sellers") {
    return { ...listQuery };
  }
  return listQuery;
}

