import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  cartesianVariantOptions,
  formatProductFeaturesList,
  formatWeightGrams,
  mapProductBrandName,
  mapProductDetailSections,
  mapProductFaqs,
  mapProductPrices,
  mapProductSeo,
  mergeProductGallerySources,
  normalizeVariantKey,
  stripSellerFields,
} from "./helpers.ts";

test("maps backend regular/sale prices onto storefront Money", () => {
  const discounted = mapProductPrices(1999, 1499);
  assert.equal(discounted.price.amount, 1499);
  assert.equal(discounted.compareAtPrice?.amount, 1999);
  const full = mapProductPrices(1999, 0);
  assert.equal(full.price.amount, 1999);
  assert.equal(full.compareAtPrice, undefined);
});

test("normalizes variant combinations the same way as the backend", () => {
  assert.equal(
    normalizeVariantKey({ Color: "Red", Size: "Large" }),
    "color:red|size:large",
  );
});

test("expands variant axes into purchasable combinations", () => {
  const combos = cartesianVariantOptions([
    { type: "Finish", values: ["Gold", "Silver"] },
  ]);
  assert.equal(combos.length, 2);
  assert.deepEqual(combos[0], { Finish: "Gold" });
});

test("strips label|hex color values so keys match backend variantStock", () => {
  const combos = cartesianVariantOptions([
    { type: "Color", values: ["Red|#ff0000", "Blue|#0000ff"] },
  ]);
  assert.deepEqual(combos, [{ Color: "Red" }, { Color: "Blue" }]);
  assert.equal(normalizeVariantKey(combos[0]!), "color:red");

  // Same lookup path mapVariants uses for PDP availability / ATC options
  const variantStock: Record<string, number> = { "color:red": 0, "color:blue": 3 };
  assert.equal(Number(variantStock[normalizeVariantKey(combos[0]!)!] ?? 0) > 0, false);
  assert.equal(Number(variantStock[normalizeVariantKey(combos[1]!)!] ?? 0) > 0, true);
});

test("stripSellerFields removes marketplace owner keys", () => {
  const stripped = stripSellerFields({
    name: "Ring",
    seller: "abc",
    sellerShop: "def",
  });
  assert.deepEqual(stripped, { name: "Ring" });
});

test("maps brand name from populated brand or string", () => {
  assert.equal(mapProductBrandName({ name: "Aaurikaa" }), "Aaurikaa");
  assert.equal(mapProductBrandName("House Label"), "House Label");
  assert.equal(mapProductBrandName({ name: "  " }), undefined);
  assert.equal(mapProductBrandName(null), undefined);
});

test("maps featuresContent and usageSafetyContent into PDP details sections", () => {
  assert.deepEqual(
    mapProductDetailSections({
      featuresContent: "Lightweight everyday wear",
      usageSafetyContent: "Keep dry. Wipe with a soft cloth.",
      features: [{ key: "Finish", value: "Gold" }],
    }),
    [
      {
        id: "care",
        title: "Care",
        richContents: ["Keep dry. Wipe with a soft cloth."],
      },
      {
        id: "features",
        title: "Key Features",
        content: "Finish: Gold",
        richContents: ["Lightweight everyday wear"],
      },
    ],
  );
});

test("falls back to features[] when featuresContent is empty", () => {
  assert.equal(
    formatProductFeaturesList([
      { key: "Material", value: "Plated metal" },
      { key: "Finish", values: ["Gold", "Rose"] },
    ]),
    "Material: Plated metal\nFinish: Gold, Rose",
  );
  assert.deepEqual(
    mapProductDetailSections({
      featuresContent: "   ",
      features: [
        { key: "Material", value: "Plated metal", code: "material.material" },
        { key: "Finish", values: ["Gold", "Rose"] },
      ],
    }),
    [
      {
        id: "product-details",
        title: "Product Details",
        content: "Material: Plated metal",
      },
      {
        id: "features",
        title: "Key Features",
        content: "Finish: Gold, Rose",
      },
    ],
  );
});

test("jewellery PDP maps Product Details, Care, and Manufacturer with SKU", () => {
  const sections = mapProductDetailSections({
    sku: "AAU-EAR-001",
    description: "Hand-finished pearl studs for everyday wear.",
    length: 12,
    width: 10,
    height: 8,
    weight: 4.5,
    usageSafetyContent: "Store in a dry place.",
    usageInstructions: [
      { title: "Keep Away From Water", instruction: "Do not wear while bathing." },
      { title: "Avoid Perfumes And Spray", instruction: "Apply fragrance first." },
      { title: "Clean With A Dry And Soft Cloth", instruction: "" },
    ],
    manufacturerConditions: {
      countryOfOrigin: "India",
      marketedBy: "AAURIKAA",
      details: "Crafted for AAURIKAA.",
      grievanceRedressal: "support@example.com",
    },
    occasions: [{ name: "Everyday", slug: "everyday" }],
    features: [
      { key: "Material", value: "Brass", code: "material.material" },
      { key: "Net Quantity", value: "1 Pair", code: "physical-properties.quantity" },
      { key: "Finish", value: "Gold" },
    ],
    featuresContent: "Nickel-conscious construction.",
  });

  assert.ok(sections);
  assert.equal(sections![0]?.title, "Product Details");
  assert.match(sections![0]!.content ?? "", /SKU: AAU-EAR-001/);
  assert.match(sections![0]!.content ?? "", /Occasion: Everyday/);
  assert.match(sections![0]!.content ?? "", /Material: Brass/);
  assert.match(sections![0]!.content ?? "", /Net Weight: 4\.5 g/);
  assert.match(sections![0]!.content ?? "", /Net Quantity: 1 Pair/);
  assert.match(sections![0]!.content ?? "", /Length: 12/);
  assert.deepEqual(sections![0]!.richContents, [
    "Hand-finished pearl studs for everyday wear.",
  ]);
  assert.equal(sections![1]?.title, "Care");
  assert.deepEqual(sections![1]!.richContents, ["Store in a dry place."]);
  assert.match(sections![1]!.content ?? "", /Keep Away From Water: Do not wear while bathing/);
  assert.doesNotMatch(sections![1]!.content ?? "", /Clean With A Dry And Soft Cloth/);
  assert.equal(sections![2]?.title, "Manufacturer Details");
  assert.match(sections![2]!.content ?? "", /Country of Origin: India/);
  assert.match(sections![2]!.content ?? "", /Marketed By: AAURIKAA/);
  assert.deepEqual(sections![2]!.richContents, ["Crafted for AAURIKAA."]);
  assert.equal(sections![3]?.title, "Key Features");
  assert.match(sections![3]!.content ?? "", /Finish: Gold/);
  assert.deepEqual(sections![3]!.richContents, ["Nickel-conscious construction."]);
  assert.doesNotMatch(sections![3]!.content ?? "", /Material: Brass/);
  assert.doesNotMatch(sections![3]!.content ?? "", /Net Quantity/);
});

test("maps qandas into FAQ entries and drops incomplete rows", () => {
  assert.deepEqual(
    mapProductFaqs([
      { question: "Are they nickel-free?", answer: "Yes, nickel-conscious construction." },
      { question: "Empty", answer: "" },
    ]),
    [
      {
        question: "Are they nickel-free?",
        answer: "Yes, nickel-conscious construction.",
      },
    ],
  );
  assert.equal(mapProductFaqs([]), undefined);
});

test("maps metaTitle/metaDescription onto storefront SEO fields", () => {
  assert.deepEqual(
    mapProductSeo({
      metaTitle: "Lumen Hoop Earrings | Aaurikaa",
      metaDescription: "Shop Lumen Hoop earrings online.",
    }),
    {
      seoTitle: "Lumen Hoop Earrings | Aaurikaa",
      seoDescription: "Shop Lumen Hoop earrings online.",
    },
  );
  assert.deepEqual(mapProductSeo({ metaTitle: "  ", metaDescription: "" }), {
    seoTitle: undefined,
    seoDescription: undefined,
  });
});

test("product mapper wires enrichment helpers and strips seller fields", () => {
  const source = fs.readFileSync(path.join(import.meta.dirname, "product.ts"), "utf8");
  assert.match(source, /stripSellerFields/);
  assert.match(source, /mapProductBrandName/);
  assert.match(source, /mapProductDetailSections/);
  assert.match(source, /mapProductFaqs/);
  assert.match(source, /mapProductSeo/);
  assert.match(source, /seoTitle/);
  assert.match(source, /seoDescription/);
  assert.match(source, /mergeProductGallerySources/);
  assert.match(source, /cleaned\.video/);
  assert.match(source, /stock: parentStock/);
  assert.equal(/sellerShopName|Become a seller|commission/i.test(source), false);
});

test("formatWeightGrams appends gram unit", () => {
  assert.equal(formatWeightGrams(4.5), "4.5 g");
  assert.equal(formatWeightGrams(12), "12 g");
  assert.equal(formatWeightGrams(0), "");
});

test("mergeProductGallerySources prepends main and dedupes identical URLs", () => {
  assert.deepEqual(
    mergeProductGallerySources("/images/main.jpg", [
      "/images/main.jpg",
      "/images/a.jpg",
      "/images/b.jpg",
    ]),
    ["/images/main.jpg", "/images/a.jpg", "/images/b.jpg"],
  );
});

test("mergeProductGallerySources keeps Admin gallery order after main", () => {
  assert.deepEqual(
    mergeProductGallerySources("/images/main.jpg", [
      "/images/g1.jpg",
      "/images/g2.jpg",
    ]),
    ["/images/main.jpg", "/images/g1.jpg", "/images/g2.jpg"],
  );
});

test("mergeProductGallerySources returns gallery alone when main is empty", () => {
  assert.deepEqual(mergeProductGallerySources("", ["/images/g1.jpg"]), [
    "/images/g1.jpg",
  ]);
  assert.deepEqual(mergeProductGallerySources(undefined, undefined), []);
});

test("product mapper maps catalogue avgRating and reviewCount when present", () => {
  const source = fs.readFileSync(path.join(import.meta.dirname, "product.ts"), "utf8");
  assert.match(source, /cleaned\.avgRating/);
  assert.match(source, /cleaned\.reviewCount/);
  assert.match(source, /\.\.\.\(avgRating != null \? \{ avgRating \} : \{\}\)/);
  assert.match(source, /\.\.\.\(reviewCount != null \? \{ reviewCount \} : \{\}\)/);
});

test("PDP purchase wires notify-me and does not render brand line", () => {
  const source = fs.readFileSync(
    path.join(import.meta.dirname, "../../components/product/product-purchase.tsx"),
    "utf8",
  );
  assert.equal(/product\.brand/.test(source), false);
  assert.match(source, /createStockNotification/);
  assert.match(source, /Notify me/);
  assert.match(source, /avgRating/);
});

test("product mapper maps variant stock counts for UI quantity caps", () => {
  const source = fs.readFileSync(path.join(import.meta.dirname, "product.ts"), "utf8");
  assert.match(source, /stockCount/);
  assert.match(source, /\.\.\.\(stockCount != null \? \{ stock: stockCount \} : \{\}\)/);
});
