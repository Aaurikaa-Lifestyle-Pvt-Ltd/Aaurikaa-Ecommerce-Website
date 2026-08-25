/**
 * Storefront API configuration.
 *
 * Base URL comes from NEXT_PUBLIC_API_BASE_URL only. No production URL is
 * hardcoded.
 *
 * Catalogue: set NEXT_PUBLIC_CATALOGUE_SOURCE=api (exact string) to read
 * products/categories/search from the backend. Any other value (including a
 * URL) falls through to mock demo catalogue data.
 */

export function getApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  return raw.trim().replace(/\/+$/, "");
}

export function isApiConfigured(): boolean {
  return getApiBaseUrl().length > 0;
}

/**
 * When "api", product/category/search reads hit the backend.
 * When "mock" (default), jewellery catalogue demo data is retained on purpose.
 * Only the literal value "api" enables the backend catalogue — not a base URL.
 */
export function getCatalogueSource(): "mock" | "api" {
  const raw = (process.env.NEXT_PUBLIC_CATALOGUE_SOURCE ?? "mock")
    .trim()
    .toLowerCase();
  return raw === "api" ? "api" : "mock";
}

export function isApiCatalogue(): boolean {
  return isApiConfigured() && getCatalogueSource() === "api";
}
