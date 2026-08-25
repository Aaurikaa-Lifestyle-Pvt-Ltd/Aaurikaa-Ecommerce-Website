import type { AdminBrand, EntityStatus } from "@/types/admin";
import { apiRequest, unwrapData } from "./client";
import { idString, resolveMediaUrl } from "../mappers/media";

type BackendBrand = {
  _id?: unknown;
  name?: string;
  logo?: string;
  description?: string;
  isActive?: boolean;
};

function mapBrand(raw: BackendBrand | null | undefined): AdminBrand | null {
  if (!raw) return null;
  const id = idString(raw._id);
  if (!id) return null;
  return {
    id,
    name: String(raw.name ?? "").trim() || "Untitled",
    logo: raw.logo ? resolveMediaUrl(raw.logo) : "",
    description: String(raw.description ?? ""),
    status: raw.isActive === false ? "Inactive" : "Active",
  };
}

function mapBrands(raw: unknown): AdminBrand[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => mapBrand(item as BackendBrand))
    .filter((item): item is AdminBrand => Boolean(item));
}

/** Admin catalogue listing — includes inactive brands. */
export async function fetchAdminBrands(): Promise<AdminBrand[]> {
  const response = await apiRequest<
    { data?: unknown; brands?: unknown } | unknown[]
  >("/api/brands?includeInactive=1");

  if (Array.isArray(response)) return mapBrands(response);
  if (Array.isArray(response.brands)) return mapBrands(response.brands);
  return mapBrands(unwrapData(response));
}

/** Active brands only — for product brand selector. */
export async function fetchActiveAdminBrands(): Promise<AdminBrand[]> {
  const response = await apiRequest<{ data?: unknown } | unknown[]>("/api/brands");
  const data = Array.isArray(response) ? response : unwrapData(response);
  return mapBrands(data).filter((b) => b.status === "Active");
}

export async function createAdminBrand(input: {
  name: string;
  description?: string;
  logo?: File | null;
}): Promise<AdminBrand | null> {
  const body = new FormData();
  body.append("name", input.name.trim());
  if (input.description !== undefined) {
    body.append("description", input.description);
  }
  if (input.logo) body.append("logo", input.logo);
  const response = await apiRequest<{ data?: BackendBrand }>("/api/brands", {
    method: "POST",
    body,
  });
  return mapBrand(unwrapData(response));
}

export async function updateAdminBrand(
  id: string,
  input: {
    name: string;
    description?: string;
    status: EntityStatus;
    logo?: File | null;
  },
): Promise<AdminBrand | null> {
  const body = new FormData();
  body.append("name", input.name.trim());
  if (input.description !== undefined) {
    body.append("description", input.description);
  }
  body.append("isActive", input.status === "Active" ? "true" : "false");
  if (input.logo) body.append("logo", input.logo);
  const response = await apiRequest<{ data?: BackendBrand }>(
    `/api/brands/${encodeURIComponent(id)}`,
    { method: "PUT", body },
  );
  return mapBrand(unwrapData(response));
}

export async function deleteAdminBrand(id: string): Promise<void> {
  await apiRequest(`/api/brands/${encodeURIComponent(id)}`, { method: "DELETE" });
}
