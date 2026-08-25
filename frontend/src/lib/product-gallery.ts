import type { Product, ProductImage } from "@/types/commerce";

export const GALLERY_PLACEHOLDER: ProductImage = {
  src: "/images/placeholder.svg",
  alt: "Product image unavailable",
};

export type GallerySlide =
  | { kind: "image"; src: string; alt: string }
  | { kind: "video"; src: string; poster?: string; alt: string };

export const LIGHTBOX_ZOOM_MIN = 1;
export const LIGHTBOX_ZOOM_MAX = 3;
export const LIGHTBOX_ZOOM_STEP = 0.5;

/** Build ordered PDP gallery slides from product media (images then optional video). */
export function resolveProductGallerySlides(product: Product): GallerySlide[] {
  const slides: GallerySlide[] = [];
  const images =
    product.gallery && product.gallery.length > 0
      ? product.gallery
      : [
          ...(product.image?.src ? [product.image] : []),
          ...(product.hoverImage?.src ? [product.hoverImage] : []),
        ];

  for (const image of images) {
    if (!image?.src) continue;
    slides.push({ kind: "image", src: image.src, alt: image.alt || product.name });
  }

  if (product.video) {
    slides.push({
      kind: "video",
      src: product.video,
      poster: product.image?.src || undefined,
      alt: `${product.name} video`,
    });
  }

  return slides.length > 0
    ? slides
    : [{ kind: "image", src: GALLERY_PLACEHOLDER.src, alt: GALLERY_PLACEHOLDER.alt }];
}

export function clampGalleryIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(length - 1, index));
}

export function clampLightboxZoom(zoom: number): number {
  const stepped = Math.round(zoom / LIGHTBOX_ZOOM_STEP) * LIGHTBOX_ZOOM_STEP;
  return Math.min(LIGHTBOX_ZOOM_MAX, Math.max(LIGHTBOX_ZOOM_MIN, stepped));
}

export function nextLightboxZoom(zoom: number, direction: 1 | -1): number {
  return clampLightboxZoom(zoom + direction * LIGHTBOX_ZOOM_STEP);
}
