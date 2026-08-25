import type { AdminMediaAsset } from "@/types/admin";
import { idString, resolveMediaUrl } from "./media";

export type BackendMedia = {
  _id?: unknown;
  public_url?: string;
  media_type?: string;
  display_name?: string;
  alt_text?: string;
  original_filename?: string;
  mime_type?: string;
  size?: number;
  is_shared?: boolean;
  createdAt?: string;
};

export function mapAdminMedia(raw: BackendMedia | null | undefined): AdminMediaAsset | null {
  if (!raw) return null;
  const id = idString(raw._id);
  if (!id) return null;
  const mediaType = raw.media_type === "video" ? "video" : "image";
  return {
    id,
    url: resolveMediaUrl(raw.public_url),
    mediaType,
    displayName: String(raw.display_name || raw.original_filename || "Untitled"),
    altText: String(raw.alt_text ?? ""),
    originalFilename: String(raw.original_filename ?? ""),
    mimeType: String(raw.mime_type ?? ""),
    size: Number(raw.size) || 0,
    isShared: Boolean(raw.is_shared),
    createdAt: String(raw.createdAt ?? ""),
  };
}

export function mapAdminMediaList(raw: unknown): AdminMediaAsset[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => mapAdminMedia(item as BackendMedia))
    .filter((item): item is AdminMediaAsset => Boolean(item));
}
