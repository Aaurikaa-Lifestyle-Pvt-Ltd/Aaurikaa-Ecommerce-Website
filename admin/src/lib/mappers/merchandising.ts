import type { EntityStatus } from "@/types/admin";
import { idString } from "./media";

export type AdminMerchKind = "collections" | "occasions" | "looks" | "ugc";

export type AdminMerchItem = {
  id: string;
  name: string;
  slug: string;
  description: string;
  imageUrl: string;
  imageAlt: string;
  mobileImageUrl: string;
  mobileImageAlt: string;
  seoTitle: string;
  seoDescription: string;
  ctaLabel: string;
  ctaHref: string;
  mediaType: "image" | "video";
  videoUrl: string;
  creatorName: string;
  caption: string;
  externalUrl: string;
  productIds: string;
  isActive: boolean;
  showOnHome: boolean;
  displayOrder: number;
  status: EntityStatus;
};

export function mapAdminMerchItem(raw: Record<string, unknown> | null | undefined): AdminMerchItem | null {
  if (!raw) return null;
  const id = idString(raw._id ?? raw.id);
  if (!id) return null;
  const productIds = Array.isArray(raw.productIds)
    ? raw.productIds.map((value) => idString(value)).filter(Boolean).join(", ")
    : "";
  const isActive = Boolean(raw.isActive);
  return {
    id,
    name: String(raw.name ?? raw.title ?? "").trim(),
    slug: String(raw.slug ?? "").trim(),
    description: String(raw.description ?? "").trim(),
    imageUrl: String(raw.imageUrl ?? "").trim(),
    imageAlt: String(raw.imageAlt ?? "").trim(),
    mobileImageUrl: String(raw.mobileImageUrl ?? "").trim(),
    mobileImageAlt: String(raw.mobileImageAlt ?? "").trim(),
    seoTitle: String(raw.seoTitle ?? "").trim(),
    seoDescription: String(raw.seoDescription ?? "").trim(),
    ctaLabel: String(raw.ctaLabel ?? "").trim(),
    ctaHref: String(raw.ctaHref ?? "").trim(),
    mediaType: raw.mediaType === "video" ? "video" : "image",
    videoUrl: String(raw.videoUrl ?? "").trim(),
    creatorName: String(raw.creatorName ?? "").trim(),
    caption: String(raw.caption ?? "").trim(),
    externalUrl: String(raw.externalUrl ?? "").trim(),
    productIds,
    isActive,
    showOnHome: Boolean(raw.showOnHome),
    displayOrder: Number(raw.displayOrder) || 0,
    status: isActive ? "Active" : "Inactive",
  };
}

export function mapAdminMerchItems(raw: unknown): AdminMerchItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => mapAdminMerchItem(item as Record<string, unknown>))
    .filter((item): item is AdminMerchItem => Boolean(item));
}
