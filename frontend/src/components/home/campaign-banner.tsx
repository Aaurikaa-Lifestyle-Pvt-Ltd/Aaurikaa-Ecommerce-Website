import Image from "next/image";
import Link from "next/link";
import type {
  CampaignBannerContent,
  CampaignBannerVariant,
} from "@/types/commerce";
import { getCampaignBanner } from "@/lib/data";
import { cn } from "@/lib/cn";
import { Container } from "@/components/ui/container";

interface CampaignBannerProps {
  /**
   * Controlled variant (brief §16 / §19). When content is omitted, loads the
   * matching mock banner for this variant.
   */
  variant: CampaignBannerVariant;
  /** Pass content directly, or omit to load by variant. */
  content?: CampaignBannerContent;
}

const ctaBase =
  "inline-flex h-12 items-center justify-center rounded-control px-8 text-sm font-medium uppercase tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * CampaignBanner (brief §16 / §19) — focused full-width campaign moment.
 *
 * Not a second hero, product grid, carousel, or multi-card story module.
 * Both locked homepage positions reuse this component with different content
 * and type:
 * - collection-seasonal — commercial / seasonal / collection push
 * - editorial-lifestyle — single editorial / lifestyle campaign moment
 *
 * Heading and CTA are optional; image-led banners still render. Link/CTA only
 * when a valid destination is present — no invented default href.
 */
export async function CampaignBanner({
  variant,
  content,
}: CampaignBannerProps) {
  const banner = content ?? (await getCampaignBanner(variant));

  if (!banner || banner.visible === false) return null;

  const align = banner.align ?? (variant === "editorial-lifestyle" ? "center" : "left");
  const overlay = banner.overlay ?? "dark";
  const onDark = overlay === "dark";
  const isEditorial = banner.variant === "editorial-lifestyle";
  const hasCopy =
    Boolean(banner.eyebrow) ||
    Boolean(banner.heading?.trim()) ||
    Boolean(banner.supportingText) ||
    Boolean(banner.cta);

  const overlayClass =
    overlay === "dark"
      ? "bg-linear-to-t from-black/60 via-black/25 to-black/10"
      : overlay === "light"
        ? "bg-linear-to-t from-white/70 via-white/35 to-white/10"
        : "";

  const mobileSrc = banner.mobileImage?.src;
  const hasDistinctMobile =
    Boolean(mobileSrc) && mobileSrc !== banner.image.src;

  const headingId = `campaign-banner-${banner.id}`;

  return (
    <section
      className={cn("relative", isEditorial ? "py-2 sm:py-3" : "py-0")}
      data-variant={banner.variant}
      aria-labelledby={banner.heading?.trim() ? headingId : undefined}
      aria-label={!banner.heading?.trim() ? banner.image.alt || "Campaign banner" : undefined}
    >
      <div
        className={cn(
          "relative w-full overflow-hidden",
          // Heavy visual weight without competing with the full-viewport hero.
          // Pixel floors keep banners commercially credible on short mobile viewports.
          isEditorial
            ? "min-h-[280px] sm:min-h-[48svh] lg:min-h-[52svh]"
            : "min-h-[260px] sm:min-h-[44svh] lg:min-h-[48svh]",
        )}
      >
        {hasDistinctMobile ? (
          <>
            <Image
              src={mobileSrc!}
              alt={banner.mobileImage?.alt ?? banner.image.alt}
              fill
              sizes="(min-width: 768px) 0px, 100vw"
              className="object-cover md:hidden"
            />
            <Image
              src={banner.image.src}
              alt={banner.image.alt}
              fill
              sizes="(min-width: 768px) 100vw, 0px"
              className="hidden object-cover md:block"
            />
          </>
        ) : (
          <Image
            src={banner.image.src}
            alt={banner.image.alt}
            fill
            sizes="100vw"
            className="object-cover"
          />
        )}

        {overlayClass && hasCopy ? (
          <div className={cn("absolute inset-0", overlayClass)} aria-hidden />
        ) : null}

        {hasCopy ? (
          <div className="absolute inset-0 flex items-end pb-10 sm:items-center sm:pb-0">
            <Container>
              <div
                className={cn(
                  "flex max-w-xl flex-col gap-4",
                  align === "center" &&
                    "mx-auto max-w-2xl items-center text-center",
                  onDark ? "text-white" : "text-foreground",
                )}
              >
                {banner.eyebrow ? (
                  <p
                    className={cn(
                      "text-xs uppercase tracking-[0.2em]",
                      onDark ? "text-white/80" : "text-muted-foreground",
                    )}
                  >
                    {banner.eyebrow}
                  </p>
                ) : null}

                {banner.heading?.trim() ? (
                  <h2
                    id={headingId}
                    className={cn(
                      "font-serif leading-[1.08] tracking-tight",
                      isEditorial
                        ? "text-3xl sm:text-4xl lg:text-5xl"
                        : "text-3xl sm:text-[2.5rem] lg:text-4xl",
                    )}
                  >
                    {banner.heading}
                  </h2>
                ) : null}

                {banner.supportingText ? (
                  <p
                    className={cn(
                      "max-w-md text-sm leading-relaxed sm:text-base",
                      align === "center" && "mx-auto",
                      onDark ? "text-white/85" : "text-muted-foreground",
                    )}
                  >
                    {banner.supportingText}
                  </p>
                ) : null}

                {banner.cta ? (
                  <div
                    className={cn(
                      "mt-1",
                      align === "center" && "flex justify-center",
                    )}
                  >
                    <Link
                      href={banner.cta.href}
                      className={cn(
                        ctaBase,
                        onDark
                          ? "bg-surface text-foreground hover:bg-surface/90"
                          : "bg-primary text-primary-foreground hover:bg-primary/90",
                      )}
                    >
                      {banner.cta.label}
                    </Link>
                  </div>
                ) : null}
              </div>
            </Container>
          </div>
        ) : null}
      </div>
    </section>
  );
}
