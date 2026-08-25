/**
 * Product-discovery query model.
 *
 * Shared by category/collection listings and search so both surfaces speak the
 * same filter/sort vocabulary. Industry-neutral — no jewellery assumptions.
 */

export type ProductSort =
  | "featured"
  | "newest"
  | "price-asc"
  | "price-desc"
  | "name-asc";

export interface DiscoveryQuery {
  /** Free-text search (search results page). */
  q?: string;
  sort: ProductSort;
  /** When true, only in-stock products. */
  inStockOnly: boolean;
  /** When true, only products with a compare-at price. */
  onSaleOnly: boolean;
  /** 1-based page for catalogue listings (delegated to backend when possible). */
  page: number;
  /**
   * Taxonomy facet slugs — primarily for search / global listing filters.
   * On taxonomy PLP the path is source of truth (do not duplicate into query).
   */
  category?: string;
  subcategory?: string;
  child?: string;
  /** Inclusive price floor (INR major units as returned by catalogue). */
  minPrice?: number;
  /** Inclusive price ceiling. */
  maxPrice?: number;
}

/** Default page size aligned with public product / taxonomy listing defaults. */
export const DISCOVERY_PAGE_SIZE = 24;

/** URL search-param keys used across discovery routes. */
export const DISCOVERY_PARAM = {
  q: "q",
  sort: "sort",
  availability: "availability",
  sale: "sale",
  page: "page",
  category: "category",
  subcategory: "subcategory",
  child: "child",
  minPrice: "minPrice",
  maxPrice: "maxPrice",
} as const;

/** Catalogue price range for PLP range UI (null when empty catalogue). */
export type PriceBounds = {
  minPrice: number | null;
  maxPrice: number | null;
};
