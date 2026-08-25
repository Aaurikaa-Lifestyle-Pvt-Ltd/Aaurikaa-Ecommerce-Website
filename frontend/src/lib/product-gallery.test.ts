import assert from "node:assert/strict";
import test from "node:test";
import type { Product } from "../types/commerce.ts";
import {
  GALLERY_PLACEHOLDER,
  LIGHTBOX_ZOOM_MAX,
  LIGHTBOX_ZOOM_MIN,
  clampGalleryIndex,
  clampLightboxZoom,
  nextLightboxZoom,
  resolveProductGallerySlides,
} from "./product-gallery.ts";

function baseProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "p1",
    slug: "demo",
    name: "Demo Ring",
    image: { src: "/images/main.jpg", alt: "Main" },
    price: { amount: 1000, currency: "INR" },
    inStock: true,
    ...overrides,
  };
}

test("resolveProductGallerySlides uses gallery order when present", () => {
  const slides = resolveProductGallerySlides(
    baseProduct({
      gallery: [
        { src: "/images/a.jpg", alt: "A" },
        { src: "/images/b.jpg", alt: "B" },
      ],
    }),
  );
  assert.deepEqual(
    slides.map((s) => (s.kind === "image" ? s.src : s.src)),
    ["/images/a.jpg", "/images/b.jpg"],
  );
});

test("resolveProductGallerySlides appends video after images with image poster fallback", () => {
  const slides = resolveProductGallerySlides(
    baseProduct({
      gallery: [{ src: "/images/a.jpg", alt: "A" }],
      video: "https://cdn.example/video.mp4",
    }),
  );
  assert.equal(slides.length, 2);
  assert.equal(slides[0]?.kind, "image");
  assert.equal(slides[1]?.kind, "video");
  if (slides[1]?.kind === "video") {
    assert.equal(slides[1].src, "https://cdn.example/video.mp4");
    assert.equal(slides[1].poster, "/images/main.jpg");
    assert.match(slides[1].alt, /video/i);
  }
});

test("resolveProductGallerySlides falls back to image + hoverImage when gallery empty", () => {
  const slides = resolveProductGallerySlides(
    baseProduct({
      gallery: [],
      hoverImage: { src: "/images/hover.jpg", alt: "Hover" },
    }),
  );
  assert.deepEqual(
    slides.filter((s) => s.kind === "image").map((s) => s.src),
    ["/images/main.jpg", "/images/hover.jpg"],
  );
});

test("resolveProductGallerySlides returns placeholder when no media", () => {
  const slides = resolveProductGallerySlides(
    baseProduct({
      image: { src: "", alt: "" },
      gallery: [],
      video: undefined,
    }),
  );
  assert.equal(slides.length, 1);
  assert.equal(slides[0]?.kind, "image");
  if (slides[0]?.kind === "image") {
    assert.equal(slides[0].src, GALLERY_PLACEHOLDER.src);
  }
});

test("clampGalleryIndex stays within bounds", () => {
  assert.equal(clampGalleryIndex(-1, 3), 0);
  assert.equal(clampGalleryIndex(1, 3), 1);
  assert.equal(clampGalleryIndex(9, 3), 2);
  assert.equal(clampGalleryIndex(0, 0), 0);
});

test("lightbox zoom clamps and steps", () => {
  assert.equal(clampLightboxZoom(0), LIGHTBOX_ZOOM_MIN);
  assert.equal(clampLightboxZoom(99), LIGHTBOX_ZOOM_MAX);
  assert.equal(nextLightboxZoom(1, 1), 1.5);
  assert.equal(nextLightboxZoom(LIGHTBOX_ZOOM_MAX, 1), LIGHTBOX_ZOOM_MAX);
  assert.equal(nextLightboxZoom(LIGHTBOX_ZOOM_MIN, -1), LIGHTBOX_ZOOM_MIN);
});
