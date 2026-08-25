import type { Cta } from "@/types/commerce";

export type RawSlider = Record<string, unknown>;

export type BannerPlacement = "hero" | "promo1" | "promo2";

export type HomepageSlide = {
  id: string;
  placement: BannerPlacement;
  displayOrder: number;
  heading?: string;
  caption?: string;
  image: { src: string; alt: string };
  mobileImage?: { src: string; alt: string };
  /** Valid destination — slide is clickable when set. */
  href?: string;
  /** CTA only when label + valid href both exist. */
  cta?: Cta;
};

const PLACEHOLDER = "/images/placeholder.svg";
const PLACEMENTS: BannerPlacement[] = ["hero", "promo1", "promo2"];

/** Local media resolve so unit tests do not need the Next path alias graph. */
function resolveMediaUrl(src: unknown): string | null {
  if (typeof src !== "string" || !src.trim()) return null;
  const value = src.trim();
  if (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("/")
  ) {
    return value;
  }
  const base = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "")
    .trim()
    .replace(/\/+$/, "");
  if (!base) return null;
  return `${base}/uploads/${value.replace(/^\/+/, "")}`;
}

function idString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "_id" in value) {
    return String((value as { _id: unknown })._id);
  }
  return String(value);
}

function sortByDisplayOrder(a: RawSlider, b: RawSlider): number {
  const orderA = Number(a.displayOrder);
  const orderB = Number(b.displayOrder);
  const safeA = Number.isFinite(orderA) ? orderA : 0;
  const safeB = Number.isFinite(orderB) ? orderB : 0;
  if (safeA !== safeB) return safeA - safeB;
  return idString(a._id ?? a.id).localeCompare(idString(b._id ?? b.id));
}

function parsePlacement(value: unknown): BannerPlacement | null {
  const raw = String(value ?? "").trim();
  return PLACEMENTS.includes(raw as BannerPlacement)
    ? (raw as BannerPlacement)
    : null;
}

/** Empty, absolute path, or http(s) URL — mirrors Admin destination rules. */
export function isValidSliderDestination(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function mapOptionalCta(buttonText: unknown, buttonLink: unknown): Cta | undefined {
  const href = String(buttonLink ?? "").trim();
  if (!href || !isValidSliderDestination(href)) return undefined;
  const label = String(buttonText ?? "").trim();
  if (!label) return undefined;
  return { label, href };
}

function mapOptionalHref(buttonLink: unknown): string | undefined {
  const href = String(buttonLink ?? "").trim();
  if (!href || !isValidSliderDestination(href)) return undefined;
  return href;
}

/** Active sliders only, stable displayOrder sort (placement-agnostic). */
export function filterActiveSliders(raw: unknown): RawSlider[] {
  if (!Array.isArray(raw)) return [];
  return (raw as RawSlider[])
    .filter((item) => item && item.isActive === true)
    .sort(sortByDisplayOrder);
}

export function mapSliderToHomepageSlide(
  raw: RawSlider | null | undefined,
): HomepageSlide | null {
  if (!raw) return null;
  const placement = parsePlacement(raw.placement);
  if (!placement) return null;

  const imageSrc = resolveMediaUrl(raw.image);
  if (!imageSrc || imageSrc === PLACEHOLDER) return null;

  const heading = String(raw.heading ?? "").trim();
  const caption = String(raw.offerText ?? "").trim();
  const mobileSrc = resolveMediaUrl(raw.mobileImage);
  const href = mapOptionalHref(raw.buttonLink);
  const cta = mapOptionalCta(raw.buttonText, raw.buttonLink);
  const alt = heading || "Banner";

  return {
    id: idString(raw._id ?? raw.id) || `${placement}-${raw.displayOrder}`,
    placement,
    displayOrder: Number(raw.displayOrder) || 0,
    heading: heading || undefined,
    caption: caption || undefined,
    image: { src: imageSrc, alt },
    mobileImage:
      mobileSrc && mobileSrc !== PLACEHOLDER && mobileSrc !== imageSrc
        ? { src: mobileSrc, alt }
        : mobileSrc && mobileSrc !== PLACEHOLDER
          ? { src: mobileSrc, alt }
          : undefined,
    href,
    cta,
  };
}

/**
 * Active slides grouped by placement, each list sorted by displayOrder.
 * Slides without a valid placement are ignored (no invent).
 */
export function groupActiveSlidesByPlacement(raw: unknown): Record<
  BannerPlacement,
  HomepageSlide[]
> {
  const result: Record<BannerPlacement, HomepageSlide[]> = {
    hero: [],
    promo1: [],
    promo2: [],
  };

  for (const item of filterActiveSliders(raw)) {
    const slide = mapSliderToHomepageSlide(item);
    if (!slide) continue;
    result[slide.placement].push(slide);
  }

  for (const key of PLACEMENTS) {
    result[key].sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
      return a.id.localeCompare(b.id);
    });
  }

  return result;
}

/** @deprecated Prefer groupActiveSlidesByPlacement — kept for transitional imports. */
export function mapSliderToHero(raw: RawSlider | null | undefined) {
  const slide = mapSliderToHomepageSlide(
    raw?.placement ? raw : raw ? { ...raw, placement: "hero" } : raw,
  );
  if (!slide) return null;
  return {
    heading: slide.heading,
    supportingText: slide.caption,
    image: slide.image,
    mobileImage: slide.mobileImage,
    primaryCta: slide.cta,
    align: "left" as const,
    overlay: "dark" as const,
  };
}

/** @deprecated Prefer groupActiveSlidesByPlacement. */
export function mapSliderToCampaignBanner(
  raw: RawSlider | null | undefined,
  variant: "collection-seasonal" | "editorial-lifestyle",
) {
  const placement = variant === "collection-seasonal" ? "promo1" : "promo2";
  const slide = mapSliderToHomepageSlide(
    raw?.placement ? raw : raw ? { ...raw, placement } : raw,
  );
  if (!slide) return null;
  return {
    id: slide.id,
    variant,
    heading: slide.heading,
    supportingText: slide.caption,
    image: slide.image,
    mobileImage: slide.mobileImage,
    cta: slide.cta,
    visible: true,
    align:
      variant === "editorial-lifestyle"
        ? ("center" as const)
        : ("left" as const),
    overlay: "dark" as const,
  };
}

/** @deprecated Prefer groupActiveSlidesByPlacement. */
export function mapActiveSlidersToHomepage(raw: unknown) {
  const grouped = groupActiveSlidesByPlacement(raw);
  const heroSlide = grouped.hero[0];
  const hero = heroSlide
    ? {
        heading: heroSlide.heading,
        supportingText: heroSlide.caption,
        image: heroSlide.image,
        mobileImage: heroSlide.mobileImage,
        primaryCta: heroSlide.cta,
        align: "left" as const,
        overlay: "dark" as const,
      }
    : null;
  const campaigns = [
    ...grouped.promo1.slice(0, 1).map((s) => ({
      id: s.id,
      variant: "collection-seasonal" as const,
      heading: s.heading,
      supportingText: s.caption,
      image: s.image,
      mobileImage: s.mobileImage,
      cta: s.cta,
      visible: true,
      align: "left" as const,
      overlay: "dark" as const,
    })),
    ...grouped.promo2.slice(0, 1).map((s) => ({
      id: s.id,
      variant: "editorial-lifestyle" as const,
      heading: s.heading,
      supportingText: s.caption,
      image: s.image,
      mobileImage: s.mobileImage,
      cta: s.cta,
      visible: true,
      align: "center" as const,
      overlay: "dark" as const,
    })),
  ];
  return { hero, campaigns };
}
