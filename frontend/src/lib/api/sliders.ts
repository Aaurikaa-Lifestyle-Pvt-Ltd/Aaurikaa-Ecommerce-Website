import { cache } from "react";
import { apiRequest, unwrapData } from "./client";
import {
  groupActiveSlidesByPlacement,
  type BannerPlacement,
  type HomepageSlide,
  type RawSlider,
} from "../mappers/slider";

async function fetchSlidersRaw(): Promise<RawSlider[]> {
  const response = await apiRequest<{ data?: unknown }>("/api/sliders", {
    auth: false,
  });
  const data = unwrapData(response);
  if (!Array.isArray(data)) return [];
  return data as RawSlider[];
}

/** Active slides grouped by placement (request-deduped). */
export const fetchHomepageSlidesByPlacement = cache(
  async (): Promise<Record<BannerPlacement, HomepageSlide[]>> => {
    const all = await fetchSlidersRaw();
    return groupActiveSlidesByPlacement(all);
  },
);

export async function fetchSlidesForPlacement(
  placement: BannerPlacement,
): Promise<HomepageSlide[]> {
  const grouped = await fetchHomepageSlidesByPlacement();
  return grouped[placement] ?? [];
}
