"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import type { Product } from "@/types/commerce";
import { cn } from "@/lib/cn";
import { isRemoteSrc } from "@/lib/mappers/media";
import { IconClose } from "@/components/ui/icons";
import {
  GALLERY_PLACEHOLDER,
  clampGalleryIndex,
  nextLightboxZoom,
  resolveProductGallerySlides,
  type GallerySlide,
  LIGHTBOX_ZOOM_MIN,
  LIGHTBOX_ZOOM_MAX,
} from "@/lib/product-gallery";

interface ProductGalleryProps {
  product: Product;
  className?: string;
}

function GalleryImage({
  src,
  alt,
  fill,
  sizes,
  priority,
  className,
  style,
  "aria-hidden": ariaHidden,
}: {
  src: string;
  alt: string;
  fill?: boolean;
  sizes?: string;
  priority?: boolean;
  className?: string;
  style?: CSSProperties;
  "aria-hidden"?: boolean | "true" | "false";
}) {
  const [currentSrc, setCurrentSrc] = useState(src);

  useEffect(() => {
    setCurrentSrc(src);
  }, [src]);

  return (
    <Image
      src={currentSrc}
      alt={alt}
      fill={fill}
      sizes={sizes}
      priority={priority}
      unoptimized={isRemoteSrc(currentSrc) || currentSrc.startsWith("data:")}
      className={className}
      style={style}
      aria-hidden={ariaHidden}
      onError={() => {
        if (currentSrc !== GALLERY_PLACEHOLDER.src) {
          setCurrentSrc(GALLERY_PLACEHOLDER.src);
        }
      }}
    />
  );
}

function PlayBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-11 w-11 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm ring-1 ring-border",
        className,
      )}
      aria-hidden
    >
      <span className="ml-0.5 inline-block h-0 w-0 border-y-[7px] border-y-transparent border-l-[12px] border-l-current" />
    </span>
  );
}

/**
 * Client-side first-frame capture when CORS allows; otherwise keep fallback poster.
 * Never blocks gallery render — starts with fallback and upgrades asynchronously.
 */
function useVideoFramePoster(
  videoSrc: string | undefined,
  fallbackPoster: string | undefined,
): string {
  const [poster, setPoster] = useState(
    () => fallbackPoster || GALLERY_PLACEHOLDER.src,
  );

  useEffect(() => {
    setPoster(fallbackPoster || GALLERY_PLACEHOLDER.src);
  }, [fallbackPoster, videoSrc]);

  useEffect(() => {
    if (!videoSrc || typeof document === "undefined") return;

    let cancelled = false;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    // Best-effort; many CDNs omit CORS — capture then fails gracefully.
    video.crossOrigin = "anonymous";

    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
    };

    const capture = () => {
      if (cancelled || video.videoWidth < 2 || video.videoHeight < 2) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        if (!cancelled && dataUrl.startsWith("data:image")) {
          setPoster(dataUrl);
        }
      } catch {
        // Tainted canvas / unsupported — keep fallback.
      }
    };

    const onLoadedData = () => {
      try {
        if (video.currentTime < 0.05) {
          video.currentTime = Math.min(0.1, (video.duration || 1) * 0.01);
        } else {
          capture();
        }
      } catch {
        capture();
      }
    };

    video.addEventListener("loadeddata", onLoadedData);
    video.addEventListener("seeked", capture);
    video.addEventListener("error", () => {
      // Keep fallback poster.
    });
    video.src = videoSrc;

    return () => {
      cancelled = true;
      video.removeEventListener("loadeddata", onLoadedData);
      video.removeEventListener("seeked", capture);
      cleanup();
    };
  }, [videoSrc]);

  return poster;
}

function VideoThumbPreview({
  slide,
}: {
  slide: Extract<GallerySlide, { kind: "video" }>;
}) {
  const poster = useVideoFramePoster(slide.src, slide.poster);

  return (
    <>
      <GalleryImage
        src={poster}
        alt=""
        aria-hidden
        fill
        sizes="72px"
        className="object-cover"
      />
      <span
        className="absolute inset-0 grid place-items-center bg-foreground/20"
        aria-hidden
      >
        <PlayBadge className="h-8 w-8 scale-90" />
      </span>
    </>
  );
}

function DesktopHoverZoomImage({
  slide,
  priority,
  sizes,
  onOpenLightbox,
}: {
  slide: Extract<GallerySlide, { kind: "image" }>;
  priority?: boolean;
  sizes: string;
  onOpenLightbox: () => void;
}) {
  const [origin, setOrigin] = useState("50% 50%");
  const [hovering, setHovering] = useState(false);

  const updateOrigin = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setOrigin(`${x}% ${y}%`);
  };

  return (
    <button
      type="button"
      className="absolute inset-0 cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      aria-label={`View larger: ${slide.alt}`}
      onClick={onOpenLightbox}
      onMouseEnter={(event) => {
        setHovering(true);
        updateOrigin(event);
      }}
      onMouseMove={updateOrigin}
      onMouseLeave={() => {
        setHovering(false);
        setOrigin("50% 50%");
      }}
      onKeyDown={(event: ReactKeyboardEvent<HTMLButtonElement>) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenLightbox();
        }
      }}
    >
      <span className="absolute inset-0 overflow-hidden">
        <GalleryImage
          src={slide.src}
          alt={slide.alt}
          fill
          sizes={sizes}
          priority={priority}
          className={cn(
            "object-cover transition-transform duration-300 ease-out will-change-transform",
            hovering ? "scale-[1.7]" : "scale-100",
          )}
          style={{ transformOrigin: origin }}
        />
      </span>
    </button>
  );
}

function GalleryLightbox({
  slides,
  index,
  open,
  onClose,
  onChangeIndex,
}: {
  slides: GallerySlide[];
  index: number;
  open: boolean;
  onClose: () => void;
  onChangeIndex: (index: number) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [zoom, setZoom] = useState(LIGHTBOX_ZOOM_MIN);
  const [zoomOrigin, setZoomOrigin] = useState("50% 50%");
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const slide = slides[index] ?? slides[0];

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setZoom(LIGHTBOX_ZOOM_MIN);
    setZoomOrigin("50% 50%");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onChangeIndex(clampGalleryIndex(index - 1, slides.length));
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        onChangeIndex(clampGalleryIndex(index + 1, slides.length));
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setZoom((z) => nextLightboxZoom(z, 1));
        return;
      }
      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        setZoom((z) => nextLightboxZoom(z, -1));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, index, slides.length, onClose, onChangeIndex]);

  useEffect(() => {
    if (open) {
      setZoom(LIGHTBOX_ZOOM_MIN);
      setZoomOrigin("50% 50%");
    }
  }, [index, open]);

  if (!mounted || !open || !slide) return null;

  const canZoom = slide.kind === "image";

  const updateZoomOrigin = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (zoom <= LIGHTBOX_ZOOM_MIN) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setZoomOrigin(`${x}% ${y}%`);
  };

  return createPortal(
    <div className="fixed inset-0 z-[60]" role="presentation">
      <button
        type="button"
        aria-label="Close media viewer"
        className="absolute inset-0 bg-foreground/80"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="pointer-events-none absolute inset-0 flex flex-col"
      >
        <p id={titleId} className="sr-only">
          Product media viewer
        </p>

        <div className="pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 text-background sm:px-6">
          <p className="text-sm tabular-nums text-background/80">
            {index + 1} / {slides.length}
          </p>
          <div className="flex items-center gap-2">
            {canZoom ? (
              <>
                <button
                  type="button"
                  className="rounded-control border border-background/30 bg-background/10 px-3 py-1.5 text-sm transition-colors hover:bg-background/20 disabled:opacity-40"
                  aria-label="Zoom out"
                  disabled={zoom <= LIGHTBOX_ZOOM_MIN}
                  onClick={() => setZoom((z) => nextLightboxZoom(z, -1))}
                >
                  −
                </button>
                <button
                  type="button"
                  className="rounded-control border border-background/30 bg-background/10 px-3 py-1.5 text-sm transition-colors hover:bg-background/20 disabled:opacity-40"
                  aria-label="Zoom in"
                  disabled={zoom >= LIGHTBOX_ZOOM_MAX}
                  onClick={() => setZoom((z) => nextLightboxZoom(z, 1))}
                >
                  +
                </button>
              </>
            ) : null}
            <button
              ref={closeRef}
              type="button"
              className="rounded-control border border-background/30 bg-background/10 p-2 transition-colors hover:bg-background/20"
              aria-label="Close"
              onClick={onClose}
            >
              <IconClose className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-6 sm:px-10">
          {slides.length > 1 ? (
            <>
              <button
                type="button"
                className="pointer-events-auto absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-background/30 bg-background/10 p-2 text-background transition-colors hover:bg-background/20 sm:left-4"
                aria-label="Previous media"
                onClick={() =>
                  onChangeIndex(clampGalleryIndex(index - 1, slides.length))
                }
              >
                <span aria-hidden className="block px-1 text-lg leading-none">
                  ‹
                </span>
              </button>
              <button
                type="button"
                className="pointer-events-auto absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-background/30 bg-background/10 p-2 text-background transition-colors hover:bg-background/20 sm:right-4"
                aria-label="Next media"
                onClick={() =>
                  onChangeIndex(clampGalleryIndex(index + 1, slides.length))
                }
              >
                <span aria-hidden className="block px-1 text-lg leading-none">
                  ›
                </span>
              </button>
            </>
          ) : null}

          <div className="pointer-events-auto relative max-h-full max-w-full">
            {slide.kind === "video" ? (
              <video
                key={slide.src}
                className="max-h-[min(80vh,900px)] max-w-[min(92vw,1100px)] rounded-card bg-foreground object-contain"
                src={slide.src}
                poster={slide.poster}
                controls
                autoPlay
                playsInline
                preload="metadata"
                aria-label={slide.alt}
              />
            ) : (
              <div
                className={cn(
                  "relative mx-auto overflow-hidden rounded-card",
                  zoom > LIGHTBOX_ZOOM_MIN ? "cursor-zoom-out" : "cursor-zoom-in",
                )}
                style={{
                  width: "min(92vw, 1100px)",
                  height: "min(80vh, 900px)",
                }}
                onMouseMove={updateZoomOrigin}
                onClick={() =>
                  setZoom((z) =>
                    z >= LIGHTBOX_ZOOM_MAX
                      ? LIGHTBOX_ZOOM_MIN
                      : nextLightboxZoom(z, 1),
                  )
                }
              >
                <GalleryImage
                  src={slide.src}
                  alt={slide.alt}
                  fill
                  sizes="100vw"
                  className="object-contain transition-transform duration-200 ease-out will-change-transform"
                  style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: zoomOrigin,
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Image-led PDP gallery (with optional product video).
 * Desktop: left vertical thumbnails + large primary with hover zoom / lightbox.
 * Mobile: swipeable full-width slides with indicators (unchanged behaviour).
 */
export function ProductGallery({ product, className }: ProductGalleryProps) {
  const slides = resolveProductGallerySlides(product);
  const [active, setActive] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const labelId = useId();

  const goTo = useCallback(
    (index: number) => {
      const next = clampGalleryIndex(index, slides.length);
      setActive(next);
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const slide = scroller.children[next] as HTMLElement | undefined;
      slide?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
    },
    [slides.length],
  );

  useEffect(() => {
    setActive((current) => clampGalleryIndex(current, slides.length));
  }, [slides.length]);

  // Sync active index from mobile swipe scroll.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const onScroll = () => {
      const width = scroller.clientWidth || 1;
      const index = Math.round(scroller.scrollLeft / width);
      setActive(clampGalleryIndex(index, slides.length));
    };

    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [slides.length]);

  const activeSlide = slides[active] ?? slides[0]!;
  const videoPoster = useVideoFramePoster(
    activeSlide.kind === "video" ? activeSlide.src : undefined,
    activeSlide.kind === "video" ? activeSlide.poster : undefined,
  );

  const openLightbox = useCallback(() => setLightboxOpen(true), []);
  const closeLightbox = useCallback(() => setLightboxOpen(false), []);

  return (
    <div className={cn("flex flex-col gap-3 lg:gap-4", className)}>
      {/* Mobile swipe gallery */}
      <div
        className="relative lg:hidden"
        role="region"
        aria-roledescription="carousel"
        aria-labelledby={labelId}
      >
        <p id={labelId} className="sr-only">
          Product media
        </p>
        <div
          ref={scrollerRef}
          className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto"
        >
          {slides.map((slide, index) => (
            <div
              key={`${slide.kind}-${slide.src}-${index}`}
              className="relative aspect-[4/5] w-full shrink-0 snap-start overflow-hidden rounded-card bg-muted"
            >
              {slide.kind === "video" ? (
                <video
                  className="h-full w-full object-cover"
                  src={slide.src}
                  poster={slide.poster}
                  controls
                  playsInline
                  preload="metadata"
                  aria-label={slide.alt}
                />
              ) : (
                <GalleryImage
                  src={slide.src}
                  alt={slide.alt}
                  fill
                  sizes="(min-width: 1024px) 0px, 100vw"
                  priority={index === 0}
                  className="object-cover"
                />
              )}
            </div>
          ))}
        </div>

        {slides.length > 1 ? (
          <div
            className="mt-3 flex items-center justify-center gap-1.5"
            aria-hidden
          >
            {slides.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => goTo(index)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  index === active
                    ? "w-5 bg-foreground"
                    : "w-1.5 bg-foreground/25",
                )}
                aria-label={`Go to media ${index + 1}`}
              />
            ))}
          </div>
        ) : null}
      </div>

      {/* Desktop: slim vertical thumbs + dominant primary */}
      <div className="hidden lg:flex lg:items-stretch lg:gap-2.5 xl:gap-3">
        {slides.length > 1 ? (
          <ul className="no-scrollbar flex w-14 shrink-0 flex-col gap-2 overflow-y-auto overscroll-contain xl:w-[3.75rem]">
            {slides.map((slide, index) => (
              <li key={`${slide.kind}-${slide.src}-thumb-${index}`}>
                <button
                  type="button"
                  onClick={() => setActive(index)}
                  aria-label={
                    slide.kind === "video"
                      ? `View video ${index + 1}`
                      : `View image ${index + 1}`
                  }
                  aria-current={index === active ? "true" : undefined}
                  className={cn(
                    "relative aspect-square w-full overflow-hidden rounded-control bg-muted transition-[opacity,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    index === active
                      ? "ring-1 ring-foreground"
                      : "opacity-65 ring-1 ring-border/70 hover:opacity-100",
                  )}
                >
                  {slide.kind === "video" ? (
                    <VideoThumbPreview slide={slide} />
                  ) : (
                    <GalleryImage
                      src={slide.src}
                      alt=""
                      aria-hidden
                      fill
                      sizes="60px"
                      className="object-cover"
                    />
                  )}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="relative min-w-0 flex-1 aspect-[4/5] overflow-hidden rounded-card bg-muted shadow-[0_1px_0_rgba(0,0,0,0.04)]">
          {activeSlide.kind === "image" ? (
            <DesktopHoverZoomImage
              slide={activeSlide}
              priority
              sizes="(min-width: 1280px) 55vw, (min-width: 1024px) 58vw, 0px"
              onOpenLightbox={openLightbox}
            />
          ) : (
            <button
              type="button"
              className="absolute inset-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label={`Play video: ${activeSlide.alt}`}
              onClick={openLightbox}
            >
              <GalleryImage
                src={videoPoster}
                alt={activeSlide.alt}
                fill
                sizes="(min-width: 1280px) 55vw, (min-width: 1024px) 58vw, 0px"
                priority
                className="object-cover"
              />
              <span className="absolute inset-0 grid place-items-center bg-foreground/15">
                <PlayBadge />
              </span>
            </button>
          )}
        </div>
      </div>

      <GalleryLightbox
        slides={slides}
        index={active}
        open={lightboxOpen}
        onClose={closeLightbox}
        onChangeIndex={setActive}
      />
    </div>
  );
}
