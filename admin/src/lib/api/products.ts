import { apiRequest, unwrapData } from "./client";
import { mapAdminProduct, mapAdminProducts, type BackendAdminProduct } from "../mappers/product";
import { buildAdminProductWriteBody, type AdminProductWriteInput } from "../mappers/product-write";
import type { AdminProduct } from "@/types/admin";

export type AdminProductListQuery = {
  page?: number;
  limit?: number;
  search?: string;
  sku?: string;
  status?: string;
  tab?: string;
  category?: string;
  subcategory?: string;
  childCategory?: string;
  approvalStatus?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
};

export type AdminProductListResult = {
  products: AdminProduct[];
  pagination: { page: number; limit: number; total: number; pages: number };
  tabCounts?: { all: number; published: number; draft: number; trash: number };
};

type ListResponse =
  | BackendAdminProduct[]
  | {
      products?: BackendAdminProduct[];
      pagination?: { page?: number; limit?: number; total?: number; pages?: number };
      tabCounts?: { all?: number; published?: number; draft?: number; trash?: number };
    };

export async function fetchAdminProductsPage(
  query: AdminProductListQuery = {},
): Promise<AdminProductListResult> {
  const params = new URLSearchParams();
  params.set("page", String(query.page ?? 1));
  params.set("limit", String(query.limit ?? 20));
  if (query.search && query.search.trim().length >= 2) {
    params.set("search", query.search.trim());
  }
  if (query.sku?.trim()) params.set("sku", query.sku.trim());
  // Prefer status filter when set. Otherwise tab=all excludes trash.
  // Do not send both: tab=all would overwrite a specific status filter.
  if (query.status && query.status !== "all") {
    params.set("status", query.status);
  } else if (query.tab && query.tab !== "all") {
    params.set("tab", query.tab);
  } else {
    params.set("tab", "all");
  }
  if (query.category) params.set("category", query.category);
  if (query.subcategory) params.set("subcategory", query.subcategory);
  if (query.childCategory) params.set("childCategory", query.childCategory);
  if (query.approvalStatus && query.approvalStatus !== "all") {
    params.set("approvalStatus", query.approvalStatus);
  }
  if (query.sortBy) params.set("sortBy", query.sortBy);
  if (query.sortOrder) params.set("sortOrder", query.sortOrder);

  const response = await apiRequest<ListResponse>(`/api/admin/products?${params.toString()}`);

  if (Array.isArray(response)) {
    return {
      products: mapAdminProducts(response),
      pagination: { page: 1, limit: response.length, total: response.length, pages: 1 },
    };
  }

  const pagination = response.pagination ?? {};
  const tabCounts = response.tabCounts;
  return {
    products: mapAdminProducts(response.products),
    pagination: {
      page: Number(pagination.page) || 1,
      limit: Number(pagination.limit) || 20,
      total: Number(pagination.total) || 0,
      pages: Math.max(1, Number(pagination.pages) || 1),
    },
    tabCounts: tabCounts
      ? {
          all: Number(tabCounts.all) || 0,
          published: Number(tabCounts.published) || 0,
          draft: Number(tabCounts.draft) || 0,
          trash: Number(tabCounts.trash) || 0,
        }
      : undefined,
  };
}

/** @deprecated Prefer fetchAdminProductsPage for server pagination. */
export async function fetchAdminProducts(search?: string): Promise<AdminProduct[]> {
  const result = await fetchAdminProductsPage({
    page: 1,
    limit: 50,
    search,
  });
  return result.products;
}

export async function fetchAdminProduct(id: string): Promise<AdminProduct | null> {
  const raw = await apiRequest<BackendAdminProduct>(`/api/admin/products/${id}`);
  return mapAdminProduct(raw);
}

/** JSON body for draft autosave (existing admin auto-save engine). */
export type AdminProductAutosaveInput = Record<string, unknown> & {
  id?: string;
  name?: string;
  status?: string;
};

/**
 * Draft-only autosave. Backend returns 409 when the product is not a draft.
 */
export async function autoSaveAdminProduct(
  input: AdminProductAutosaveInput,
  options?: { signal?: AbortSignal },
): Promise<AdminProduct | null> {
  const response = await apiRequest<{ product?: BackendAdminProduct }>(
    "/api/admin/products/auto-save",
    {
      method: "POST",
      body: { ...input, status: "draft" },
      signal: options?.signal,
    },
  );
  return mapAdminProduct(response.product);
}

/** Latest draft owned by the signed-in admin (for restore on /products/new). */
export async function fetchLatestAdminDraft(): Promise<AdminProduct | null> {
  const response = await apiRequest<{ draft?: BackendAdminProduct | null }>(
    "/api/admin/products/latest-draft",
  );
  return mapAdminProduct(response.draft ?? undefined);
}

export async function createAdminProduct(input: AdminProductWriteInput): Promise<AdminProduct | null> {
  const body = buildAdminProductWriteBody(input);
  const response = await apiRequest<{ product?: BackendAdminProduct }>("/api/admin/products", {
    method: "POST",
    body,
  });
  return mapAdminProduct(response.product);
}

export async function updateAdminProduct(
  id: string,
  input: AdminProductWriteInput,
): Promise<AdminProduct | null> {
  const body = buildAdminProductWriteBody(input);
  const response = await apiRequest<{ data?: { product?: BackendAdminProduct }; product?: BackendAdminProduct }>(
    `/api/admin/products/${id}`,
    { method: "PUT", body },
  );
  const product = unwrapData(response).product ?? response.product;
  return mapAdminProduct(product);
}

/** Move a product to trash (PUT /:id/trash). */
export async function trashAdminProduct(id: string): Promise<void> {
  await apiRequest(`/api/admin/products/${id}/trash`, { method: "PUT" });
}

/**
 * Permanent delete when already trashed; otherwise moves to trash
 * (DELETE /:id — existing backend semantics).
 */
export async function deleteAdminProduct(id: string): Promise<void> {
  await apiRequest(`/api/admin/products/${id}`, { method: "DELETE" });
}

/** Restore a trashed product to draft (PUT /:id/restore). */
export async function restoreAdminProduct(id: string): Promise<void> {
  await apiRequest(`/api/admin/products/${id}/restore`, { method: "PUT" });
}
