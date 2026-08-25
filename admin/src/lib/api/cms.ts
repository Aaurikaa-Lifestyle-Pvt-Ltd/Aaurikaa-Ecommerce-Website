import { apiRequest, unwrapData } from "./client";
import { isMarketplaceCmsPageKey } from "../cms-pages";

export type StaticPageListItem = {
  pageKey: string;
  slug: string;
  title: string;
  type: string;
  cmsEnabled: boolean;
  cmsStatus: string;
  updatedAt?: string | null;
};

export type StaticPageRecord = {
  pageKey: string;
  slug: string;
  status: "draft" | "published" | "trashed";
  seo?: { title?: string; metaDescription?: string };
  zones?: Record<string, unknown>;
};

export type CmsManifestZone = {
  id: string;
  type: string;
  label?: string;
  /** Allowlisted section types when type === orderedSections */
  allowedSectionTypes?: string[];
};

export type CmsManifest = {
  pageKey: string;
  label?: string;
  zones: CmsManifestZone[];
};

type RegistryResponse = { pages?: StaticPageListItem[] };
type PageResponse = {
  page?: StaticPageRecord | null;
  manifest?: CmsManifest;
  emptyZones?: Record<string, unknown>;
};

export async function fetchStaticPageRegistry(): Promise<StaticPageListItem[]> {
  const response = await apiRequest<{ data?: RegistryResponse }>("/api/admin/static-pages");
  const pages = unwrapData(response)?.pages ?? [];
  return pages.filter((page) => !isMarketplaceCmsPageKey(page.pageKey));
}

export async function fetchStaticPage(pageKey: string): Promise<{
  page: StaticPageRecord | null;
  manifest: CmsManifest | null;
  emptyZones: Record<string, unknown>;
}> {
  const response = await apiRequest<{ data?: PageResponse }>(
    `/api/admin/static-pages/${encodeURIComponent(pageKey)}`,
  );
  const data = unwrapData(response) ?? {};
  return {
    page: data.page ?? null,
    manifest: data.manifest ?? null,
    emptyZones: data.emptyZones ?? {},
  };
}

export async function saveStaticPage(
  pageKey: string,
  input: { status: string; seo: { title: string; metaDescription: string }; zones: Record<string, unknown> },
): Promise<void> {
  await apiRequest(`/api/admin/static-pages/${encodeURIComponent(pageKey)}`, {
    method: "PUT",
    body: input,
  });
}
