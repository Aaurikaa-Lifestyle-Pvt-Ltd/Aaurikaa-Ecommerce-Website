export function getApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  return raw.trim().replace(/\/+$/, "");
}

export function isApiConfigured(): boolean {
  return getApiBaseUrl().length > 0;
}
