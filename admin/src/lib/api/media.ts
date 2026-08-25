import { apiRequest, unwrapData } from "./client";
import { mapAdminMedia, mapAdminMediaList, type BackendMedia } from "../mappers/media-entity";
import type { AdminMediaAsset } from "@/types/admin";

type MediaListPayload = {
  myMedia?: BackendMedia[];
  sharedMedia?: BackendMedia[];
};

export async function fetchAdminMedia(): Promise<AdminMediaAsset[]> {
  const response = await apiRequest<{ data?: MediaListPayload } | MediaListPayload>("/api/media");
  const data = unwrapData(response) as MediaListPayload;
  return mapAdminMediaList(data?.myMedia);
}

export async function uploadAdminMedia(input: {
  file: File;
  displayName?: string;
  altText?: string;
  isShared?: boolean;
}): Promise<AdminMediaAsset | null> {
  const body = new FormData();
  body.append("file", input.file);
  if (input.displayName?.trim()) body.append("display_name", input.displayName.trim());
  if (input.altText !== undefined) body.append("alt_text", input.altText);
  if (input.isShared) body.append("is_shared", "true");
  const response = await apiRequest<{ data?: BackendMedia } | BackendMedia>("/api/media/upload", {
    method: "POST",
    body,
  });
  return mapAdminMedia(unwrapData(response) as BackendMedia);
}

export async function updateAdminMedia(
  id: string,
  input: { displayName?: string; altText?: string; isShared?: boolean },
): Promise<AdminMediaAsset | null> {
  const payload: Record<string, unknown> = {};
  if (input.displayName !== undefined) payload.display_name = input.displayName;
  if (input.altText !== undefined) payload.alt_text = input.altText;
  if (input.isShared !== undefined) payload.is_shared = input.isShared;
  const response = await apiRequest<{ data?: BackendMedia } | BackendMedia>(
    `/api/media/${encodeURIComponent(id)}`,
    { method: "PUT", body: payload },
  );
  return mapAdminMedia(unwrapData(response) as BackendMedia);
}

export async function deleteAdminMedia(id: string): Promise<void> {
  await apiRequest(`/api/media/${encodeURIComponent(id)}`, { method: "DELETE" });
}
