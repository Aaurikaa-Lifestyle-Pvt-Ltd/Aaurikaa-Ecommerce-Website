import { apiRequest, unwrapData } from "./client";
import { ApiError } from "./errors";

export type PublicStaticPageSeo = {
  title?: string;
  metaDescription?: string;
};

export type PublicStaticPage = {
  pageKey: string;
  slug: string;
  status: string;
  seo: PublicStaticPageSeo;
  zones: Record<string, unknown>;
  publishedAt?: string | null;
  updatedAt?: string | null;
};

type PublicStaticPageResponse = {
  data?: { page?: PublicStaticPage };
  page?: PublicStaticPage;
};

/**
 * Fetch a published static page by pageKey.
 * Returns null when unpublished, missing, or marketplace-rejected (4xx).
 */
export async function fetchPublishedStaticPage(
  pageKey: string,
): Promise<PublicStaticPage | null> {
  try {
    const response = await apiRequest<PublicStaticPageResponse>(
      `/api/static-pages/public?pageKey=${encodeURIComponent(pageKey)}`,
      { auth: false },
    );
    const data = unwrapData(response);
    const page =
      (data && typeof data === "object" && "page" in data
        ? (data as { page?: PublicStaticPage }).page
        : null) ??
      (response as PublicStaticPageResponse).page ??
      null;
    if (!page?.pageKey) return null;
    return {
      pageKey: page.pageKey,
      slug: page.slug ?? "",
      status: page.status ?? "published",
      seo: page.seo ?? { title: "", metaDescription: "" },
      zones: page.zones && typeof page.zones === "object" ? page.zones : {},
      publishedAt: page.publishedAt ?? null,
      updatedAt: page.updatedAt ?? null,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      if (
        error.kind === "not_found" ||
        error.kind === "validation" ||
        error.kind === "forbidden" ||
        error.status === 400 ||
        error.status === 404
      ) {
        return null;
      }
    }
    throw error;
  }
}
