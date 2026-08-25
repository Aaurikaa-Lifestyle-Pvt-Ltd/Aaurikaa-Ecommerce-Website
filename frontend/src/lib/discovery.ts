import type { Product } from "@/types/commerce";
import type { DiscoveryQuery, ProductSort } from "@/types/discovery";
import {
  DISCOVERY_PAGE_SIZE,
  DISCOVERY_PARAM,
} from "../types/discovery.ts";

const SORT_VALUES: ProductSort[] = [
  "featured",
  "newest",
  "price-asc",
  "price-desc",
  "name-asc",
];

export const SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
];

/** Paginated catalogue page returned by discovery data helpers. */
export type ProductListPage = {
  products: Product[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
};

/** Optional ObjectId overrides when calling `/api/products` (search facets). */
export type BackendTaxonomyIds = {
  categoryId?: string;
  subcategoryId?: string;
  childCategoryId?: string;
};

export function defaultDiscoveryQuery(
  overrides: Partial<DiscoveryQuery> = {},
): DiscoveryQuery {
  return {
    sort: "featured",
    inStockOnly: false,
    onSaleOnly: false,
    page: 1,
    ...overrides,
  };
}

function first(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseOptionalPrice(
  raw: string | undefined,
): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

/** Parse discovery params from a Next.js `searchParams` object. */
export function parseDiscoveryQuery(
  searchParams: Record<string, string | string[] | undefined>,
): DiscoveryQuery {
  const rawSort = first(searchParams[DISCOVERY_PARAM.sort]);
  const sort: ProductSort =
    rawSort && SORT_VALUES.includes(rawSort as ProductSort)
      ? (rawSort as ProductSort)
      : "featured";

  const rawPage = first(searchParams[DISCOVERY_PARAM.page]);
  const page = Math.max(1, parseInt(rawPage || "1", 10) || 1);

  const category = first(searchParams[DISCOVERY_PARAM.category])?.trim() || undefined;
  const subcategory =
    first(searchParams[DISCOVERY_PARAM.subcategory])?.trim() || undefined;
  const child = first(searchParams[DISCOVERY_PARAM.child])?.trim() || undefined;

  return {
    q: first(searchParams[DISCOVERY_PARAM.q])?.trim() || undefined,
    sort,
    inStockOnly: first(searchParams[DISCOVERY_PARAM.availability]) === "in-stock",
    onSaleOnly: first(searchParams[DISCOVERY_PARAM.sale]) === "1",
    page,
    category,
    subcategory: category ? subcategory : undefined,
    child: category && subcategory ? child : undefined,
    minPrice: parseOptionalPrice(first(searchParams[DISCOVERY_PARAM.minPrice])),
    maxPrice: parseOptionalPrice(first(searchParams[DISCOVERY_PARAM.maxPrice])),
  };
}

/** Build a query string from the current discovery state (omits defaults). */
export function buildDiscoverySearchParams(
  query: DiscoveryQuery,
  extras?: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams();

  if (query.q) params.set(DISCOVERY_PARAM.q, query.q);
  if (query.sort !== "featured") params.set(DISCOVERY_PARAM.sort, query.sort);
  if (query.inStockOnly) params.set(DISCOVERY_PARAM.availability, "in-stock");
  if (query.onSaleOnly) params.set(DISCOVERY_PARAM.sale, "1");
  if (query.page > 1) params.set(DISCOVERY_PARAM.page, String(query.page));
  if (query.category) params.set(DISCOVERY_PARAM.category, query.category);
  if (query.category && query.subcategory) {
    params.set(DISCOVERY_PARAM.subcategory, query.subcategory);
  }
  if (query.category && query.subcategory && query.child) {
    params.set(DISCOVERY_PARAM.child, query.child);
  }
  if (query.minPrice != null) {
    params.set(DISCOVERY_PARAM.minPrice, String(query.minPrice));
  }
  if (query.maxPrice != null) {
    params.set(DISCOVERY_PARAM.maxPrice, String(query.maxPrice));
  }

  if (extras) {
    for (const [key, value] of Object.entries(extras)) {
      if (value) params.set(key, value);
    }
  }

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Map storefront discovery vocabulary → public catalogue / taxonomy query params.
 * Uses existing backend keys (`sortBy`, `inStock`, `onSale`, `page`, `limit`, `q`,
 * `minPrice`, `maxPrice`, and ObjectId taxonomy filters when provided).
 */
export function toBackendListQuery(
  query: DiscoveryQuery,
  taxonomyIds?: BackendTaxonomyIds,
): Record<string, string | number> {
  const params: Record<string, string | number> = {
    page: query.page > 0 ? query.page : 1,
    limit: DISCOVERY_PAGE_SIZE,
  };

  switch (query.sort) {
    case "price-asc":
      params.sortBy = "price-low";
      break;
    case "price-desc":
      params.sortBy = "price-high";
      break;
    case "name-asc":
      params.sortBy = "name";
      break;
    case "newest":
      params.sortBy = "newest";
      break;
    case "featured":
    default:
      // Backend has no featured sort; newest is the public listing default.
      params.sortBy = "newest";
      break;
  }

  if (query.inStockOnly) params.inStock = "true";
  if (query.onSaleOnly) params.onSale = "true";
  if (query.q) params.q = query.q;
  if (query.minPrice != null) params.minPrice = query.minPrice;
  if (query.maxPrice != null) params.maxPrice = query.maxPrice;

  if (taxonomyIds?.categoryId) params.category = taxonomyIds.categoryId;
  if (taxonomyIds?.subcategoryId) params.subcategory = taxonomyIds.subcategoryId;
  if (taxonomyIds?.childCategoryId) {
    params.childCategory = taxonomyIds.childCategoryId;
  }

  return params;
}

/** Case-insensitive match against name and short description. */
export function matchProductQuery(product: Product, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [product.name, product.shortDescription ?? ""]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

export function filterProducts(
  products: Product[],
  query: DiscoveryQuery,
): Product[] {
  return products.filter((product) => {
    if (query.q && !matchProductQuery(product, query.q)) return false;
    if (query.inStockOnly && !product.inStock) return false;
    if (
      query.onSaleOnly &&
      !(
        product.compareAtPrice != null &&
        product.compareAtPrice.amount > product.price.amount
      )
    ) {
      return false;
    }
    if (query.minPrice != null && product.price.amount < query.minPrice) {
      return false;
    }
    if (query.maxPrice != null && product.price.amount > query.maxPrice) {
      return false;
    }
    return true;
  });
}

export function sortProducts(
  products: Product[],
  sort: ProductSort,
): Product[] {
  const next = [...products];

  switch (sort) {
    case "price-asc":
      return next.sort((a, b) => a.price.amount - b.price.amount);
    case "price-desc":
      return next.sort((a, b) => b.price.amount - a.price.amount);
    case "name-asc":
      return next.sort((a, b) => a.name.localeCompare(b.name));
    case "newest":
      // Demo catalogue has no createdAt — treat "new" badge / collection order
      // as a stand-in, then fall back to reverse insertion order.
      return next.sort((a, b) => {
        const aNew = a.badge === "new" ? 1 : 0;
        const bNew = b.badge === "new" ? 1 : 0;
        if (aNew !== bNew) return bNew - aNew;
        return 0;
      });
    case "featured":
    default:
      return next;
  }
}

/** Apply filter + sort to a product set (mock / curated merch fallback). */
export function applyDiscovery(
  products: Product[],
  query: DiscoveryQuery,
): Product[] {
  return sortProducts(filterProducts(products, query), query.sort);
}

/** Slice a filtered product set into a catalogue page (mock / merch paths). */
export function paginateProducts(
  products: Product[],
  page: number,
  limit: number = DISCOVERY_PAGE_SIZE,
): ProductListPage {
  const totalCount = products.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit) || 1);
  const currentPage = Math.min(Math.max(1, page || 1), totalPages);
  const start = (currentPage - 1) * limit;
  return {
    products: products.slice(start, start + limit),
    totalCount,
    totalPages,
    currentPage,
  };
}

/** Filter, sort, then paginate — for non-delegated catalogue paths. */
export function applyDiscoveryPage(
  products: Product[],
  query: DiscoveryQuery,
): ProductListPage {
  return paginateProducts(applyDiscovery(products, query), query.page);
}

export function hasActiveFilters(query: DiscoveryQuery): boolean {
  return Boolean(
    query.inStockOnly ||
      query.onSaleOnly ||
      query.minPrice != null ||
      query.maxPrice != null ||
      query.category ||
      query.subcategory ||
      query.child,
  );
}

/** Clear facet filters while preserving search text (and default sort/page). */
export function clearDiscoveryFilters(query: DiscoveryQuery): DiscoveryQuery {
  return defaultDiscoveryQuery({
    q: query.q,
    sort: query.sort,
  });
}
