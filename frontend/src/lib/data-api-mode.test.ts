import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { mapActiveSlidersToHomepage } from "./mappers/slider.ts";

/**
 * Guarantees API-empty slider payloads do not surface demo jewellery hero /
 * campaign content from `@/data/*`. Mapping is pure; data.ts wires the same
 * helpers when isApiCatalogue() is true.
 */
test("empty API slider payload does not produce demo jewellery hero or campaigns", () => {
  const { hero, campaigns } = mapActiveSlidersToHomepage([]);
  assert.equal(hero, null);
  assert.deepEqual(campaigns, []);

  const demoHero = fs.readFileSync(
    path.join(import.meta.dirname, "../data/hero.ts"),
    "utf8",
  );
  assert.match(demoHero, /Modern heirlooms/);
  assert.notEqual(hero?.heading, "Modern heirlooms, made to be worn");
});

test("data layer API mode uses placement sliders and hides empty brand/trust/newsletter", () => {
  const source = fs.readFileSync(
    path.join(import.meta.dirname, "data.ts"),
    "utf8",
  );

  assert.match(source, /fetchSlidesForPlacement/);
  assert.match(source, /getHomepageSlides/);
  assert.match(source, /virtualLabelCollection/);
  assert.match(source, /fetchProductsForLabelSlug/);
  assert.match(
    source,
    /getProductsByCollection[\s\S]*?fetchPublicCollectionBySlug[\s\S]*?result\?\.products\?\.length[\s\S]*?fetchProductsForLabelSlug/,
  );
  assert.match(source, /toBackendListQuery/);
  assert.match(source, /searchPublicProducts\(toBackendListQuery/);
  assert.match(source, /fetchTaxonomyProducts\(/);
  assert.match(source, /getProductsByTaxonomyPath/);
  assert.match(source, /getTaxonomyPath/);

  assert.match(
    source,
    /export async function getBrandStory[\s\S]*?if \(isApiCatalogue\(\)\) return null/,
  );
  assert.match(
    source,
    /export async function getTrustItems[\s\S]*?if \(isApiCatalogue\(\)\) return \[\]/,
  );
  assert.match(
    source,
    /export async function getNewsletter[\s\S]*?if \(isApiCatalogue\(\)\) return null/,
  );

  const getSlidesBlock = source.slice(
    source.indexOf("export async function getHomepageSlides"),
    source.indexOf("export async function getHero"),
  );
  assert.match(getSlidesBlock, /isApiCatalogue/);
  assert.match(getSlidesBlock, /fetchSlidesForPlacement/);
  assert.match(getSlidesBlock, /return \[\]/);
});

test("announcement uses active offers in API mode, not siteConfig shipping claim", () => {
  const source = fs.readFileSync(
    path.join(import.meta.dirname, "../components/layout/announcement.tsx"),
    "utf8",
  );
  assert.match(source, /fetchAnnouncementLines/);
  assert.match(source, /AnnouncementBar/);
  assert.match(source, /isApiCatalogue/);
  assert.equal(/Complimentary shipping/.test(source), false);
});

test("announcement bar rotates when multiple lines are present", () => {
  const source = fs.readFileSync(
    path.join(import.meta.dirname, "../components/layout/announcement-bar.tsx"),
    "utf8",
  );
  assert.match(source, /AUTOPLAY_MS/);
  assert.match(source, /count > 1/);
  assert.match(source, /setInterval/);
});

test("env example documents catalogue API wiring", () => {
  const text = fs.readFileSync(
    path.join(import.meta.dirname, "../../.env.example"),
    "utf8",
  );
  assert.match(text, /NEXT_PUBLIC_API_BASE_URL/);
  assert.match(text, /NEXT_PUBLIC_CATALOGUE_SOURCE=api/);
});
