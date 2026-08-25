import { apiRequest, unwrapData } from "./client";
import { resolveMediaUrl } from "../mappers/media";

export type BannerPlacement = "hero" | "promo1" | "promo2";

export type AdminSlider = {
  id: string;
  placement: BannerPlacement | "";
  heading: string;
  offerText: string;
  buttonText: string;
  buttonLink: string;
  isActive: boolean;
  displayOrder: number;
  image: string;
  mobileImage: string;
};

/** Fixed homepage banner sections — keyed by backend `placement`. */
export const BANNER_SLOTS = [
  { placement: "hero" as const, label: "Hero", key: "hero" },
  { placement: "promo1" as const, label: "Promotional 1", key: "promo1" },
  { placement: "promo2" as const, label: "Promotional 2", key: "promo2" },
] as const;

export type BannerSlotKey = (typeof BANNER_SLOTS)[number]["key"];

const PLACEMENTS: BannerPlacement[] = ["hero", "promo1", "promo2"];

function parsePlacement(value: unknown): BannerPlacement | "" {
  const raw = String(value ?? "").trim();
  return PLACEMENTS.includes(raw as BannerPlacement) ? (raw as BannerPlacement) : "";
}

function mapSlider(raw: Record<string, unknown> | null): AdminSlider | null {
  if (!raw) return null;
  const id = String(raw._id ?? raw.id ?? "");
  if (!id) return null;
  return {
    id,
    placement: parsePlacement(raw.placement),
    heading: String(raw.heading ?? ""),
    offerText: String(raw.offerText ?? ""),
    buttonText: String(raw.buttonText ?? ""),
    buttonLink: String(raw.buttonLink ?? ""),
    isActive: Boolean(raw.isActive),
    displayOrder: Number(raw.displayOrder) || 0,
    image: resolveMediaUrl(raw.image),
    mobileImage: resolveMediaUrl(raw.mobileImage),
  };
}

export async function fetchAdminSliders(): Promise<AdminSlider[]> {
  const response = await apiRequest<{ data?: unknown }>("/api/sliders");
  const data = unwrapData(response);
  const list = Array.isArray(data) ? data : [];
  return list
    .map((item) => mapSlider(item as Record<string, unknown>))
    .filter((item): item is AdminSlider => Boolean(item));
}

/**
 * Group sliders by placement. Unassigned (no placement) are omitted from sections.
 */
export function groupSlidersByPlacement(
  sliders: AdminSlider[],
): Record<BannerSlotKey, AdminSlider[]> {
  const groups: Record<BannerSlotKey, AdminSlider[]> = {
    hero: [],
    promo1: [],
    promo2: [],
  };

  for (const slider of sliders) {
    if (!slider.placement || !(slider.placement in groups)) continue;
    groups[slider.placement as BannerSlotKey].push(slider);
  }

  for (const key of Object.keys(groups) as BannerSlotKey[]) {
    groups[key].sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
      return a.id.localeCompare(b.id);
    });
  }

  return groups;
}

/**
 * @deprecated Prefer groupSlidersByPlacement — returns first slide per section only.
 */
export function mapSlidersToBannerSlots(
  sliders: AdminSlider[],
): Record<BannerSlotKey, AdminSlider | null> {
  const groups = groupSlidersByPlacement(sliders);
  return {
    hero: groups.hero[0] ?? null,
    promo1: groups.promo1[0] ?? null,
    promo2: groups.promo2[0] ?? null,
  };
}

export function listUnassignedSliders(sliders: AdminSlider[]): AdminSlider[] {
  return sliders.filter((s) => !s.placement);
}

export async function createAdminSlider(input: {
  placement: BannerPlacement;
  heading: string;
  offerText: string;
  buttonText: string;
  buttonLink: string;
  isActive: boolean;
  displayOrder: number;
  image: File;
  mobileImage?: File;
}): Promise<void> {
  const body = new FormData();
  body.append("placement", input.placement);
  body.append("heading", input.heading);
  body.append("offerText", input.offerText);
  body.append("buttonText", input.buttonText);
  body.append("buttonLink", input.buttonLink);
  body.append("isActive", input.isActive ? "true" : "false");
  body.append("displayOrder", String(input.displayOrder));
  body.append("image", input.image);
  if (input.mobileImage) body.append("mobileImage", input.mobileImage);
  await apiRequest("/api/sliders", { method: "POST", body });
}

export async function updateAdminSlider(
  id: string,
  input: {
    placement: BannerPlacement;
    heading: string;
    offerText: string;
    buttonText: string;
    buttonLink: string;
    isActive: boolean;
    displayOrder: number;
    image?: File;
    mobileImage?: File;
  },
): Promise<void> {
  const body = new FormData();
  body.append("placement", input.placement);
  body.append("heading", input.heading);
  body.append("offerText", input.offerText);
  body.append("buttonText", input.buttonText);
  body.append("buttonLink", input.buttonLink);
  body.append("isActive", input.isActive ? "true" : "false");
  body.append("displayOrder", String(input.displayOrder));
  if (input.image) body.append("image", input.image);
  if (input.mobileImage) body.append("mobileImage", input.mobileImage);
  await apiRequest(`/api/sliders/${encodeURIComponent(id)}`, { method: "PUT", body });
}

export async function deleteAdminSlider(id: string): Promise<void> {
  await apiRequest(`/api/sliders/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export type AdminOffer = {
  id: string;
  text: string;
  title: string;
  type: string;
  isActive: boolean;
};

function mapOffer(item: unknown): AdminOffer | null {
  const raw = item as {
    _id?: string;
    id?: string;
    text?: string;
    title?: string;
    type?: string;
    isActive?: boolean;
  };
  const id = String(raw._id ?? raw.id ?? "");
  if (!id) return null;
  return {
    id,
    text: String(raw.text ?? ""),
    title: String(raw.title ?? ""),
    type: String(raw.type ?? "announcement"),
    isActive: Boolean(raw.isActive),
  };
}

/** Admin offers list — filter announcement type for homepage banner bar. */
export async function fetchAdminOffers(
  type: string = "announcement",
): Promise<AdminOffer[]> {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  const qs = params.toString();
  const response = await apiRequest<unknown>(`/api/admin/offers${qs ? `?${qs}` : ""}`);
  // Backend returns a raw array; tolerate `{ data: [] }` envelopes too.
  const unwrapped = unwrapData(response as { data?: unknown });
  const list = Array.isArray(unwrapped)
    ? unwrapped
    : Array.isArray(response)
      ? response
      : [];
  return list
    .map(mapOffer)
    .filter((item): item is AdminOffer => Boolean(item))
    .filter((item) => !type || item.type === type || !item.type);
}

export async function createAdminOffer(text: string): Promise<void> {
  await apiRequest("/api/admin/offers", {
    method: "POST",
    body: { text, type: "announcement" },
  });
}

export async function updateAdminOffer(
  id: string,
  input: { text?: string; title?: string; isActive?: boolean; type?: string },
): Promise<void> {
  await apiRequest(`/api/admin/offers/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: { ...input, type: input.type ?? "announcement" },
  });
}

export async function deleteAdminOffer(id: string): Promise<void> {
  await apiRequest(`/api/admin/offers/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/** Optional CTA destination: empty, absolute path, or http(s) URL. */
export function isValidBannerDestination(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
