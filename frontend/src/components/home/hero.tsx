import Image from "next/image";
import Link from "next/link";
import type { HeroContent } from "@/types/commerce";
import { getHero } from "@/lib/data";
import { cn } from "@/lib/cn";
import { Container } from "@/components/ui/container";

interface HeroProps {
  /** Pass content directly, or omit to load the configured hero. */
  content?: HeroContent | null;
}

// Shared CTA sizing/shape (mirrors the "lg" button) without a fixed colour, so
// contrast can adapt to the overlay treatment.
const ctaBase =
  "inline-flex h-12 items-center justify-center rounded-control px-8 text-sm font-medium uppercase tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Hero (brief §13) — static, editorial, image-led, CTA-driven. No carousel.
 *
 * The photography carries the emotion; copy stays concise. Content is supplied
 * as data (configurable), while overlay/alignment are controlled variants so
 * the same component can front any brand's storefront.
 *
 * When catalogue source is API and no active slider exists, renders nothing
 * (no demo jewellery imagery/copy). Heading and CTA are optional — image-only
 * heroes still render.
 */
export async function Hero({ content }: HeroProps) {
  const hero = content === undefined ? await getHero() : content;
  if (!hero) return null;

  const align = hero.align ?? "left";
  const overlay = hero.overlay ?? "dark";
  const onDark = overlay === "dark";
  const hasCopy =
    Boolean(hero.eyebrow) ||
    Boolean(hero.heading?.trim()) ||
    Boolean(hero.supportingText) ||
    Boolean(hero.primaryCta) ||
    Boolean(hero.secondaryCta);

  const overlayClass =
    overlay === "dark"
      ? "bg-linear-to-t from-black/55 via-black/25 to-black/10"
      : overlay === "light"
        ? "bg-linear-to-t from-white/70 via-white/35 to-white/10"
        : "";

  const mobileSrc = hero.mobileImage?.src;
  const hasDistinctMobile =
    Boolean(mobileSrc) && mobileSrc !== hero.image.src;

  return (
    <section className="relative">
      <div className="relative min-h-[420px] w-full overflow-hidden sm:min-h-[74svh] lg:min-h-[84svh]">
        {/*
         * Art-directed full-bleed imagery (brief §31). Phone + tablet use the
         * subject crop; desktop keeps the wide editorial banner. Breakpoint is
         * `lg` so tablets are not stuck on empty texture from object-cover.
         */}
        {hasDistinctMobile ? (
          <>
            <Image
              src={mobileSrc!}
              alt={hero.mobileImage?.alt ?? hero.image.alt}
              fill
              priority
              sizes="(min-width: 1024px) 0px, 100vw"
              className="object-cover object-[70%_30%] lg:hidden"
            />
            <Image
              src={hero.image.src}
              alt={hero.image.alt}
              fill
              priority
              sizes="(min-width: 1024px) 100vw, 0px"
              className="hidden object-cover object-right lg:block"
            />
          </>
        ) : (
          <Image
            src={hero.image.src}
            alt={hero.image.alt}
            fill
            priority
            sizes="100vw"
            className="object-cover object-right lg:object-center"
          />
        )}

        {overlayClass && hasCopy ? (
          <div className={cn("absolute inset-0", overlayClass)} aria-hidden />
        ) : null}

        {hasCopy ? (
          <div className="absolute inset-0 flex items-end pb-12 sm:items-center sm:pb-0">
            <Container>
              <div
                className={cn(
                  "flex max-w-xl flex-col gap-5",
                  align === "center" &&
                    "mx-auto max-w-2xl items-center text-center",
                  onDark ? "text-white" : "text-foreground",
                )}
              >
                {hero.eyebrow ? (
                  <p
                    className={cn(
                      "text-xs uppercase tracking-[0.2em]",
                      onDark ? "text-white/80" : "text-muted-foreground",
                    )}
                  >
                    {hero.eyebrow}
                  </p>
                ) : null}

                {hero.heading?.trim() ? (
                  <h1 className="font-serif text-4xl leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                    {hero.heading}
                  </h1>
                ) : null}

                {hero.supportingText ? (
                  <p
                    className={cn(
                      "max-w-md text-base leading-relaxed sm:text-lg",
                      align === "center" && "mx-auto",
                      onDark ? "text-white/85" : "text-muted-foreground",
                    )}
                  >
                    {hero.supportingText}
                  </p>
                ) : null}

                {hero.primaryCta || hero.secondaryCta ? (
                  <div
                    className={cn(
                      "mt-2 flex flex-col gap-3 sm:flex-row sm:items-center",
                      align === "center" && "sm:justify-center",
                    )}
                  >
                    {hero.primaryCta ? (
                      <Link
                        href={hero.primaryCta.href}
                        className={cn(
                          ctaBase,
                          "focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                          onDark
                            ? "bg-surface text-foreground hover:bg-surface/90"
                            : "bg-primary text-primary-foreground hover:bg-primary/90",
                        )}
                      >
                        {hero.primaryCta.label}
                      </Link>
                    ) : null}
                    {hero.secondaryCta ? (
                      <Link
                        href={hero.secondaryCta.href}
                        className={cn(
                          ctaBase,
                          onDark
                            ? "border border-white/70 text-white hover:bg-white/10"
                            : "border border-foreground/80 text-foreground hover:bg-foreground hover:text-background",
                        )}
                      >
                        {hero.secondaryCta.label}
                      </Link>
                    ) : null}
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
