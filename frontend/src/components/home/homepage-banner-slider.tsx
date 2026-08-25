"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { HomepageSlide } from "@/lib/mappers/slider";
import { cn } from "@/lib/cn";
import { Container } from "@/components/ui/container";

const AUTOPLAY_MS = 6000;

/** Matches original Hero CTA treatment. */
const ctaBase =
  "inline-flex h-12 items-center justify-center rounded-control px-8 text-sm font-medium uppercase tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

type HomepageBannerSliderProps = {
  slides: HomepageSlide[];
  /** Accessible name for the carousel region. */
  label: string;
  /** Taller hero treatment vs compact promo. */
  size?: "hero" | "promo";
};

/**
 * Independent homepage banner carousel for one placement (hero / promo1 / promo2).
 * Visual treatment mirrors the original Hero: serif headline, editorial crop,
 * end/center copy stack. Optional Admin fields render only when supplied.
 */
export function HomepageBannerSlider({
  slides,
  label,
  size = "hero",
}: HomepageBannerSliderProps) {
  const reactId = useId();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const regionRef = useRef<HTMLElement>(null);

  const count = slides.length;
  const multi = count > 1;
  const safeIndex = count === 0 ? 0 : Math.min(index, count - 1);
  const slide = slides[safeIndex];

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!multi || paused || reduceMotion) return;
    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % count);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [multi, paused, reduceMotion, count]);

  if (!slide || count === 0) return null;

  function go(delta: number) {
    if (!multi) return;
    setIndex((i) => (i + delta + count) % count);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!multi) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      go(1);
    }
  }

  const minHeight =
    size === "hero"
      ? "min-h-[420px] sm:min-h-[74svh] lg:min-h-[84svh]"
      : "min-h-[280px] sm:min-h-[420px] lg:min-h-[520px]";

  const hasCopy =
    Boolean(slide.heading?.trim()) ||
    Boolean(slide.caption?.trim()) ||
    Boolean(slide.cta);

  const mobileSrc = slide.mobileImage?.src;
  const hasDistinctMobile = Boolean(mobileSrc) && mobileSrc !== slide.image.src;
  const HeadingTag = size === "hero" ? "h1" : "h2";

  const slideInner = (
    <div className={cn("relative w-full overflow-hidden", minHeight)}>
      {hasDistinctMobile ? (
        <>
          <Image
            src={mobileSrc!}
            alt={slide.mobileImage?.alt ?? slide.image.alt}
            fill
            priority={size === "hero" && safeIndex === 0}
            sizes="(min-width: 1024px) 0px, 100vw"
            className="object-cover object-[70%_30%] lg:hidden"
          />
          <Image
            src={slide.image.src}
            alt={slide.image.alt}
            fill
            priority={size === "hero" && safeIndex === 0}
            sizes="(min-width: 1024px) 100vw, 0px"
            className="hidden object-cover object-right lg:block"
          />
        </>
      ) : (
        <Image
          src={slide.image.src}
          alt={slide.image.alt}
          fill
          priority={size === "hero" && safeIndex === 0}
          sizes="100vw"
          className="object-cover object-right lg:object-center"
        />
      )}

      {hasCopy ? (
        <div
          className="absolute inset-0 bg-linear-to-t from-black/55 via-black/25 to-black/10"
          aria-hidden
        />
      ) : null}

      {hasCopy ? (
        <div className="absolute inset-0 flex items-end pb-12 sm:items-center sm:pb-0">
          <Container>
            <div className="flex max-w-xl flex-col gap-5 text-left text-white">
              {slide.heading?.trim() ? (
                <HeadingTag className="font-serif text-4xl leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                  {slide.heading}
                </HeadingTag>
              ) : null}

              {slide.caption?.trim() ? (
                <p className="max-w-md text-base leading-relaxed text-white/85 sm:text-lg">
                  {slide.caption}
                </p>
              ) : null}

              {slide.cta ? (
                <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
                  {slide.href ? (
                    <span className={cn(ctaBase, "bg-surface text-foreground")}>
                      {slide.cta.label}
                    </span>
                  ) : (
                    <Link
                      href={slide.cta.href}
                      className={cn(
                        ctaBase,
                        "bg-surface text-foreground hover:bg-surface/90",
                      )}
                    >
                      {slide.cta.label}
                    </Link>
                  )}
                </div>
              ) : null}
            </div>
          </Container>
        </div>
      ) : null}
    </div>
  );

  return (
    <section
      ref={regionRef}
      aria-roledescription="carousel"
      aria-label={label}
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!regionRef.current?.contains(e.relatedTarget as Node)) {
          setPaused(false);
        }
      }}
      onKeyDown={onKeyDown}
      tabIndex={multi ? 0 : undefined}
    >
      <div
        id={`${reactId}-slide`}
        role="group"
        aria-roledescription="slide"
        aria-label={`Slide ${safeIndex + 1} of ${count}`}
      >
        {slide.href ? (
          <Link href={slide.href} className="block focus-visible:outline-none">
            {slideInner}
          </Link>
        ) : (
          slideInner
        )}
      </div>

      {multi ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex items-center justify-between px-4 sm:px-6">
          <div className="pointer-events-auto flex gap-2">
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Previous slide"
              onClick={() => go(-1)}
            >
              <span aria-hidden>‹</span>
            </button>
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Next slide"
              onClick={() => go(1)}
            >
              <span aria-hidden>›</span>
            </button>
          </div>
          <div
            className="pointer-events-auto flex gap-2"
            role="tablist"
            aria-label="Slide indicators"
          >
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={i === safeIndex}
                aria-label={`Go to slide ${i + 1}`}
                className={cn(
                  "h-2.5 w-2.5 rounded-full transition",
                  i === safeIndex ? "bg-white" : "bg-white/45 hover:bg-white/70",
                )}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
