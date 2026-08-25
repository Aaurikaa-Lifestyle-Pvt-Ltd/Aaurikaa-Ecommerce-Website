import { getApiBaseUrl } from "../api/config";

const PLACEHOLDER = "/images/placeholder.svg";

function getR2PublicBase(): string {
  return (process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL ?? "")
    .trim()
    .replace(/\/+$/, "");
}

function normalizeMediaStorageKey(stored: string): string {
  let clean = stored.trim().replace(/^\/+/, "");
  if (clean.startsWith("uploads/")) {
    const rest = clean.slice("uploads/".length);
    if (rest.includes("/")) return rest;
  }
  return clean;
}

function resolveR2MediaUrl(stored: string): string | null {
  const trimmed = stored.trim();
  if (!trimmed) return null;

  const r2Base = getR2PublicBase();
  if (!r2Base) return null;

  let key = trimmed;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const mistakenLocal = /\/uploads\/admin\/gallery\//i.test(trimmed);
    if (/\.r2\.dev\//i.test(trimmed)) return trimmed;
    if (!mistakenLocal) return null;
    try {
      key = new URL(trimmed).pathname.replace(/^\/+/, "");
    } catch {
      return null;
    }
  }

  const normalized = normalizeMediaStorageKey(key);
  if (!normalized.includes("/")) return null;
  return `${r2Base}/${normalized}`;
}

export function resolveMediaUrl(src: unknown): string {
  if (typeof src !== "string" || !src.trim()) return PLACEHOLDER;
  const value = src.trim();
  if (value.startsWith("/")) return value;

  const r2Url = resolveR2MediaUrl(value);
  if (r2Url) return r2Url;

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  const base = getApiBaseUrl();
  if (!base) return PLACEHOLDER;
  return `${base}/uploads/${value.replace(/^\/+/, "")}`;
}

export function isRemoteSrc(src: string): boolean {
  return src.startsWith("http://") || src.startsWith("https://");
}

export function idString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "_id" in value) {
    return String((value as { _id: unknown })._id);
  }
  return String(value);
}
