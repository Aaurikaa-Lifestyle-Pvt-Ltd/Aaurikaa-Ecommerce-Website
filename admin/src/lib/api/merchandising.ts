import { apiRequest, unwrapData } from "./client";
import {
  mapAdminMerchItem,
  mapAdminMerchItems,
  type AdminMerchItem,
  type AdminMerchKind,
} from "../mappers/merchandising";

export type { AdminMerchItem, AdminMerchKind };

type ListResponse = { items?: unknown[] };
type ItemResponse = { item?: Record<string, unknown> };

export type MerchWriteInput = {
  name?: string;
  title?: string;
  slug?: string;
  description?: string;
  imageUrl?: string;
  imageAlt?: string;
  mobileImageUrl?: string;
  mobileImageAlt?: string;
  seoTitle?: string;
  seoDescription?: string;
  ctaLabel?: string;
  ctaHref?: string;
  mediaType?: "image" | "video";
  videoUrl?: string;
  creatorName?: string;
  caption?: string;
  externalUrl?: string;
  productIds?: string;
  isActive?: boolean;
  showOnHome?: boolean;
  displayOrder?: number;
};

export async function fetchAdminMerch(kind: AdminMerchKind): Promise<AdminMerchItem[]> {
  const response = await apiRequest<{ data?: ListResponse }>(`/api/admin/merchandising/${kind}`);
  return mapAdminMerchItems(unwrapData(response)?.items);
}

export async function createAdminMerch(
  kind: AdminMerchKind,
  input: MerchWriteInput,
): Promise<AdminMerchItem | null> {
  const response = await apiRequest<{ data?: ItemResponse }>(`/api/admin/merchandising/${kind}`, {
    method: "POST",
    body: input,
  });
  return mapAdminMerchItem(unwrapData(response)?.item ?? null);
}

export async function updateAdminMerch(
  kind: AdminMerchKind,
  id: string,
  input: MerchWriteInput,
): Promise<AdminMerchItem | null> {
  const response = await apiRequest<{ data?: ItemResponse }>(
    `/api/admin/merchandising/${kind}/${encodeURIComponent(id)}`,
    { method: "PUT", body: input },
  );
  return mapAdminMerchItem(unwrapData(response)?.item ?? null);
}

export async function deleteAdminMerch(kind: AdminMerchKind, id: string): Promise<void> {
  await apiRequest(`/api/admin/merchandising/${kind}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
