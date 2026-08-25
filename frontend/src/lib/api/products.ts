import type { Product } from "@/types/commerce";
import type { PriceBounds } from "@/types/discovery";
import type { ProductListPage } from "@/lib/discovery";
import { apiRequest } from "./client";
import { mapBackendProduct, mapBackendProducts } from "../mappers/product";

type ProductListResponse = {
  products?: unknown[];
  totalCount?: number;
  totalPages?: number;
  currentPage?: number;
};

function toProductListPage(response: ProductListResponse): ProductListPage {
  const products = mapBackendProducts(response.products);
  const totalCount =
    typeof response.totalCount === "number" ? response.totalCount : products.length;
  const totalPages =
    typeof response.totalPages === "number"
      ? Math.max(1, response.totalPages)
      : Math.max(1, Math.ceil(totalCount / Math.max(products.length, 1)) || 1);
  const currentPage =
    typeof response.currentPage === "number"
      ? Math.max(1, response.currentPage)
      : 1;

  return { products, totalCount, totalPages, currentPage };
}

function appendQueryParams(
  params: URLSearchParams,
  query: Record<string, string | number | undefined>,
) {
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === "") continue;
    params.set(key, String(value));
  }
}

function parsePriceBounds(raw: unknown): PriceBounds {
  if (!raw || typeof raw !== "object") {
    return { minPrice: null, maxPrice: null };
  }
  const body = raw as { minPrice?: unknown; maxPrice?: unknown };
  const min =
    body.minPrice == null || body.minPrice === ""
      ? null
      : Number(body.minPrice);
  const max =
    body.maxPrice == null || body.maxPrice === ""
      ? null
      : Number(body.maxPrice);
  return {
    minPrice: min != null && Number.isFinite(min) ? min : null,
    maxPrice: max != null && Number.isFinite(max) ? max : null,
  };
}

export async function fetchPublicProducts(
  query: Record<string, string | number | undefined> = {},
): Promise<ProductListPage> {
  const params = new URLSearchParams();
  appendQueryParams(params, query);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await apiRequest<ProductListResponse>(`/api/products${suffix}`, {
    auth: false,
  });
  return toProductListPage(response);
}

export async function fetchPublicProductBySlug(slug: string): Promise<Product | null> {
  const raw = await apiRequest<unknown>(`/api/products/slug/${encodeURIComponent(slug)}`, {
    auth: false,
  });
  return mapBackendProduct(raw as Parameters<typeof mapBackendProduct>[0]);
}

export async function fetchRelatedProducts(productId: string): Promise<Product[]> {
  const response = await apiRequest<{ products?: unknown[] }>(
    `/api/products/related?productId=${encodeURIComponent(productId)}`,
    { auth: false },
  );
  return mapBackendProducts(response.products);
}

/**
 * Products at a taxonomy depth (category / sub / child).
 * Delegates filter/sort/pagination to `GET /api/taxonomy/products`.
 */
export async function fetchTaxonomyProducts(
  path: { categorySlug: string; subSlug?: string; childSlug?: string },
  query: Record<string, string | number | undefined> = {},
): Promise<ProductListPage> {
  const params = new URLSearchParams({
    categorySlug: path.categorySlug,
  });
  if (path.subSlug) params.set("subSlug", path.subSlug);
  if (path.childSlug) params.set("childSlug", path.childSlug);
  appendQueryParams(params, {
    page: 1,
    limit: 24,
    ...query,
  });
  const response = await apiRequest<ProductListResponse>(
    `/api/taxonomy/products?${params.toString()}`,
    { auth: false },
  );
  return toProductListPage(response);
}

/** @deprecated Prefer fetchTaxonomyProducts with optional sub/child. */
export async function fetchProductsByCategorySlug(
  slug: string,
  query: Record<string, string | number | undefined> = {},
): Promise<ProductListPage> {
  return fetchTaxonomyProducts({ categorySlug: slug }, query);
}

/** Price bounds for a taxonomy PLP scope. */
export async function fetchTaxonomyPriceBounds(path?: {
  categorySlug?: string;
  subSlug?: string;
  childSlug?: string;
}): Promise<PriceBounds> {
  const params = new URLSearchParams();
  if (path?.categorySlug) params.set("categorySlug", path.categorySlug);
  if (path?.subSlug) params.set("subSlug", path.subSlug);
  if (path?.childSlug) params.set("childSlug", path.childSlug);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await apiRequest<unknown>(
    `/api/taxonomy/price-bounds${suffix}`,
    { auth: false },
  );
  return parsePriceBounds(response);
}

/**
 * Price bounds for `/api/products` search/listing filters
 * (same filters minus applying min/max to itself).
 */
export async function fetchProductsPriceBounds(
  query: Record<string, string | number | undefined> = {},
): Promise<PriceBounds> {
  const params = new URLSearchParams();
  const { minPrice: _min, maxPrice: _max, page: _page, limit: _limit, ...rest } =
    query;
  appendQueryParams(params, rest);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await apiRequest<unknown>(
    `/api/products/price-bounds${suffix}`,
    { auth: false },
  );
  return parsePriceBounds(response);
}

export async function searchPublicProducts(
  query: Record<string, string | number | undefined>,
): Promise<ProductListPage> {
  return fetchPublicProducts(query);
}
