import type {
  AdminCategory,
  AdminCategoryHierarchyResult,
  EntityStatus,
} from "@/types/admin";
import { apiRequest, unwrapData } from "./client";
import {
  mapAdminCategories,
  mapAdminCategory,
  mapAdminCategoryHierarchy,
} from "../mappers/category";

export type CategoryHierarchyQuery = {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  categoryId?: string;
  subcategoryId?: string;
  childCategoryId?: string;
};

export type TaxonomyTaxTypeInput = "GST" | "VAT" | "NONE";

export type CategoryWriteInput = {
  name: string;
  isActive?: boolean;
  image?: File | null;
  /** Category base GST % (required for category level; defaults handled by backend). */
  taxRate?: number;
  /** Tax type enum supported by Category.taxType. */
  taxType?: TaxonomyTaxTypeInput;
  /** Optional SEO / listing title (Category.title). */
  title?: string;
  /** Optional SEO / listing description (Category.description). */
  description?: string;
};

/**
 * Sub/Child write tax:
 * - `null` = inherit (send empty string; never send 0 for inherit)
 * - `number` including `0` = explicit override
 * - `undefined` = omit field (create inherit / leave unchanged)
 */
export type TaxonomyTaxRateInput = number | null | undefined;

export type SubcategoryWriteInput = {
  name: string;
  image?: File | null;
  taxRate?: TaxonomyTaxRateInput;
  taxType?: TaxonomyTaxTypeInput;
};

export type ChildCategoryWriteInput = {
  name: string;
  image?: File | null;
  taxRate?: TaxonomyTaxRateInput;
  taxType?: TaxonomyTaxTypeInput;
};

/** Flat list for product dropdowns — includes inactive so assigned products remain editable. */
export async function fetchAdminCategories(): Promise<AdminCategory[]> {
  const response = await apiRequest<{ data?: unknown } | unknown[]>(
    "/api/categories?includeInactive=true",
  );
  const data = Array.isArray(response) ? response : unwrapData(response);
  return mapAdminCategories(data);
}

export type TaxonomyOption = { id: string; name: string };

function mapTaxonomyOptions(raw: unknown): TaxonomyOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const row = item as { _id?: unknown; name?: string };
      const id = String(row._id ?? "");
      const name = String(row.name ?? "").trim();
      if (!id || !name) return null;
      return { id, name };
    })
    .filter((item): item is TaxonomyOption => Boolean(item));
}

/** Existing Category → Subcategory cascade for product assignment. */
export async function fetchAdminSubcategories(categoryId: string): Promise<TaxonomyOption[]> {
  if (!categoryId) return [];
  const response = await apiRequest<unknown>(
    `/api/categories/${encodeURIComponent(categoryId)}/subcategories`,
  );
  return mapTaxonomyOptions(response);
}

/** Existing Subcategory → Child Category cascade for product assignment. */
export async function fetchAdminChildCategories(subcategoryId: string): Promise<TaxonomyOption[]> {
  if (!subcategoryId) return [];
  const response = await apiRequest<unknown>(
    `/api/categories/subcategories/${encodeURIComponent(subcategoryId)}/child-categories`,
  );
  return mapTaxonomyOptions(response);
}

export async function fetchAdminCategoryHierarchy(
  query: CategoryHierarchyQuery = {},
): Promise<AdminCategoryHierarchyResult> {
  const params = new URLSearchParams();
  if (query.page != null) params.set("page", String(query.page));
  if (query.limit != null) params.set("limit", String(query.limit));
  if (query.search?.trim()) params.set("search", query.search.trim());
  if (query.sortBy) params.set("sortBy", query.sortBy);
  if (query.sortOrder) params.set("sortOrder", query.sortOrder);
  if (query.categoryId) params.set("categoryId", query.categoryId);
  if (query.subcategoryId) params.set("subcategoryId", query.subcategoryId);
  if (query.childCategoryId) params.set("childCategoryId", query.childCategoryId);

  const qs = params.toString();
  const response = await apiRequest<{
    rows?: unknown;
    pagination?: { page?: number; limit?: number; total?: number; pages?: number };
  }>(`/api/categories/hierarchy${qs ? `?${qs}` : ""}`);

  return mapAdminCategoryHierarchy(response);
}

function appendInheritedTaxRate(body: FormData, taxRate: TaxonomyTaxRateInput) {
  if (taxRate === undefined) return;
  // Empty string → backend null (inherit). Never send "0" for inherit.
  if (taxRate === null) {
    body.append("taxRate", "");
    return;
  }
  body.append("taxRate", String(taxRate));
}

function appendCategoryWriteFields(body: FormData, input: CategoryWriteInput) {
  body.append("name", input.name.trim());
  if (input.isActive !== undefined) {
    body.append("isActive", input.isActive ? "true" : "false");
  }
  if (input.image) body.append("image", input.image);
  if (input.taxRate !== undefined) {
    body.append("taxRate", String(input.taxRate));
  }
  if (input.taxType !== undefined) {
    body.append("taxType", input.taxType);
  }
  if (input.title !== undefined) body.append("title", input.title);
  if (input.description !== undefined) body.append("description", input.description);
}

export async function createAdminCategory(input: CategoryWriteInput): Promise<AdminCategory | null> {
  const body = new FormData();
  appendCategoryWriteFields(body, input);
  const response = await apiRequest<{ data?: unknown }>("/api/categories", {
    method: "POST",
    body,
  });
  return mapAdminCategory(unwrapData(response) as Parameters<typeof mapAdminCategory>[0]);
}

export async function updateAdminCategory(
  id: string,
  input: CategoryWriteInput,
): Promise<AdminCategory | null> {
  const body = new FormData();
  appendCategoryWriteFields(body, input);
  const response = await apiRequest<{ data?: unknown }>(`/api/categories/${encodeURIComponent(id)}`, {
    method: "PUT",
    body,
  });
  return mapAdminCategory(unwrapData(response) as Parameters<typeof mapAdminCategory>[0]);
}

export async function deleteAdminCategory(id: string): Promise<void> {
  await apiRequest(`/api/categories/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function createAdminSubcategory(
  categoryId: string,
  input: SubcategoryWriteInput,
): Promise<void> {
  const body = new FormData();
  body.append("name", input.name.trim());
  if (input.image) body.append("image", input.image);
  appendInheritedTaxRate(body, input.taxRate);
  if (input.taxType !== undefined) body.append("taxType", input.taxType);
  await apiRequest(`/api/categories/${encodeURIComponent(categoryId)}/subcategories`, {
    method: "POST",
    body,
  });
}

export async function updateAdminSubcategory(
  id: string,
  input: SubcategoryWriteInput,
): Promise<void> {
  const body = new FormData();
  body.append("name", input.name.trim());
  if (input.image) body.append("image", input.image);
  appendInheritedTaxRate(body, input.taxRate);
  if (input.taxType !== undefined) body.append("taxType", input.taxType);
  await apiRequest(`/api/categories/subcategories/${encodeURIComponent(id)}`, {
    method: "PUT",
    body,
  });
}

export async function deleteAdminSubcategory(id: string): Promise<void> {
  await apiRequest(`/api/categories/subcategories/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function createAdminChildCategory(
  subcategoryId: string,
  input: ChildCategoryWriteInput,
): Promise<void> {
  const body = new FormData();
  body.append("name", input.name.trim());
  if (input.image) body.append("image", input.image);
  appendInheritedTaxRate(body, input.taxRate);
  if (input.taxType !== undefined) body.append("taxType", input.taxType);
  await apiRequest(
    `/api/categories/subcategories/${encodeURIComponent(subcategoryId)}/child-categories`,
    { method: "POST", body },
  );
}

export async function updateAdminChildCategory(
  id: string,
  input: ChildCategoryWriteInput,
): Promise<void> {
  const body = new FormData();
  body.append("name", input.name.trim());
  if (input.image) body.append("image", input.image);
  appendInheritedTaxRate(body, input.taxRate);
  if (input.taxType !== undefined) body.append("taxType", input.taxType);
  await apiRequest(`/api/categories/child-categories/${encodeURIComponent(id)}`, {
    method: "PUT",
    body,
  });
}

export async function deleteAdminChildCategory(id: string): Promise<void> {
  await apiRequest(`/api/categories/child-categories/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function statusToIsActive(status: EntityStatus): boolean {
  return status !== "Inactive";
}

