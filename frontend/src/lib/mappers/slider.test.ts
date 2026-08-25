import assert from "node:assert/strict";
import test from "node:test";
import {
  filterActiveSliders,
  groupActiveSlidesByPlacement,
  mapSliderToHomepageSlide,
  mapSliderToHero,
} from "./slider.ts";

test("mapSliderToHomepageSlide maps placement, images, optional copy and CTA", () => {
  const slide = mapSliderToHomepageSlide({
    _id: "s1",
    placement: "hero",
    heading: "Spring Edit",
    offerText: "New pieces",
    buttonText: "Shop Now",
    buttonLink: "/collections/new-arrivals",
    image: "https://cdn.example.com/hero.jpg",
    mobileImage: "https://cdn.example.com/hero-m.jpg",
    isActive: true,
    displayOrder: 1,
  });

  assert.ok(slide);
  assert.equal(slide!.placement, "hero");
  assert.equal(slide!.heading, "Spring Edit");
  assert.equal(slide!.caption, "New pieces");
  assert.equal(slide!.cta?.label, "Shop Now");
  assert.equal(slide!.href, "/collections/new-arrivals");
  assert.equal(slide!.image.src, "https://cdn.example.com/hero.jpg");
  assert.equal(slide!.mobileImage?.src, "https://cdn.example.com/hero-m.jpg");
});

test("mapSliderToHomepageSlide ignores slides without placement", () => {
  assert.equal(
    mapSliderToHomepageSlide({
      heading: "Orphan",
      image: "https://cdn.example.com/x.jpg",
      isActive: true,
      displayOrder: 0,
    }),
    null,
  );
});

test("mapSliderToHomepageSlide does not invent CTA or href", () => {
  const noLink = mapSliderToHomepageSlide({
    placement: "hero",
    heading: "Edit",
    buttonText: "Shop",
    image: "https://cdn.example.com/h.jpg",
  });
  assert.ok(noLink);
  assert.equal(noLink!.cta, undefined);
  assert.equal(noLink!.href, undefined);
});

test("groupActiveSlidesByPlacement groups independently and sorts within section", () => {
  const grouped = groupActiveSlidesByPlacement([
    {
      _id: "orphan",
      heading: "Test Heading",
      offerText: "Test Offer",
      buttonText: "SHOP NOW",
      buttonLink: "/shop",
      image: "https://cdn.example.com/orphan.jpg",
      isActive: true,
      displayOrder: 0,
    },
    {
      _id: "h2",
      placement: "hero",
      heading: "Hero 2",
      image: "https://cdn.example.com/h2.jpg",
      isActive: true,
      displayOrder: 2,
    },
    {
      _id: "h1",
      placement: "hero",
      heading: "Hero 1",
      image: "https://cdn.example.com/h1.jpg",
      isActive: true,
      displayOrder: 1,
    },
    {
      _id: "p1",
      placement: "promo1",
      heading: "Promo",
      image: "https://cdn.example.com/p1.jpg",
      isActive: true,
      displayOrder: 1,
    },
    {
      _id: "hidden",
      placement: "hero",
      heading: "Hidden",
      image: "https://cdn.example.com/x.jpg",
      isActive: false,
      displayOrder: 3,
    },
  ]);

  assert.equal(grouped.hero.length, 2);
  assert.equal(grouped.hero[0]?.heading, "Hero 1");
  assert.equal(grouped.hero[1]?.heading, "Hero 2");
  assert.equal(grouped.promo1.length, 1);
  assert.equal(grouped.promo2.length, 0);
});

test("mapSliderToHero still maps when placement is hero (compat)", () => {
  const hero = mapSliderToHero({
    placement: "hero",
    heading: "Spring Edit",
    offerText: "New pieces, limited drop",
    buttonText: "Shop Now",
    buttonLink: "/collections/new-arrivals",
    image: "https://cdn.example.com/hero.jpg",
    isActive: true,
    displayOrder: 0,
  });
  assert.ok(hero);
  assert.equal(hero!.heading, "Spring Edit");
});

test("filterActiveSliders drops inactive and sorts by displayOrder", () => {
  const filtered = filterActiveSliders([
    { heading: "B", isActive: true, displayOrder: 5, image: "https://x/b.jpg" },
    { heading: "A", isActive: true, displayOrder: 1, image: "https://x/a.jpg" },
    { heading: "X", isActive: false, displayOrder: 0, image: "https://x/x.jpg" },
  ]);
  assert.equal(filtered.length, 2);
  assert.equal(filtered[0]?.heading, "A");
  assert.equal(filtered[1]?.heading, "B");
});
