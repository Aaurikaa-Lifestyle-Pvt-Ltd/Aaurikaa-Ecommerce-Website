import { apiRequest } from "./client";
import { isApiConfigured } from "./config";

/** Raw grouped payload from `GET /api/search/suggestions` (sellers omitted by FE). */
export type SearchSuggestionsResponse = {
  products?: Array<{ _id?: string; name?: string; slug?: string }>;
  categories?: Array<{ _id?: string; name?: string; slug?: string }>;
  subcategories?: Array<{
    _id?: string;
    name?: string;
    slug?: string;
    category?: { _id?: string; name?: string; slug?: string } | null;
  }>;
  childCategories?: Array<{
    _id?: string;
    name?: string;
    slug?: string;
    subcategory?: { _id?: string; name?: string; slug?: string } | null;
    category?: { _id?: string; name?: string; slug?: string } | null;
  }>;
  brands?: unknown[];
  sellers?: unknown[];
  tags?: unknown[];
};

/**
 * Existing backend grouped suggestions — products + taxonomy.
 * Requires `q` with at least 2 characters (backend validation).
 */
export async function fetchSearchSuggestions(
  q: string,
  options: { signal?: AbortSignal } = {},
): Promise<SearchSuggestionsResponse> {
  if (!isApiConfigured()) {
    return {
      products: [],
      categories: [],
      subcategories: [],
      childCategories: [],
    };
  }

  const term = q.trim();
  const params = new URLSearchParams({ q: term });
  return apiRequest<SearchSuggestionsResponse>(
    `/api/search/suggestions?${params.toString()}`,
    { auth: false, signal: options.signal },
  );
}
