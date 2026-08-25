import type { HomepageSlide } from "@/lib/mappers/slider";
import type { BannerPlacement } from "@/lib/mappers/slider";
import { getHomepageSlides } from "@/lib/data";
import { HomepageBannerSlider } from "./homepage-banner-slider";

const LABELS: Record<BannerPlacement, string> = {
  hero: "Hero banners",
  promo1: "Promotional banner 1",
  promo2: "Promotional banner 2",
};

type Props = {
  placement: BannerPlacement;
  size?: "hero" | "promo";
  /** Optional preloaded slides (tests). */
  slides?: HomepageSlide[];
};

export async function HomepageBannerSection({
  placement,
  size = placement === "hero" ? "hero" : "promo",
  slides: preloaded,
}: Props) {
  const slides = preloaded ?? (await getHomepageSlides(placement));
  if (!slides.length) return null;
  return (
    <HomepageBannerSlider
      slides={slides}
      label={LABELS[placement]}
      size={size}
    />
  );
}
