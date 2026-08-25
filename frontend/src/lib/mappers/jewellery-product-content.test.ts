import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { mapProductDetailSections } from "./helpers.ts";

/**
 * Representative jewellery catalogue fixture (mock — not seeded to DB).
 * Admin write FormData is covered in admin jewellery-product-content.test.ts.
 */
const JEWELLERY_PUBLIC_FIELDS = {
  sku: "AAU-EAR-001",
  description: "Hand-finished pearl studs for everyday wear.",
  length: 12,
  width: 10,
  height: 8,
  weight: 4.5,
  featuresContent: "Nickel-conscious construction.",
  usageSafetyContent: "Store in a dry place.",
  usageInstructions: [
    { title: "Keep Away From Water", instruction: "Do not wear while bathing." },
    { title: "Avoid Perfumes And Spray", instruction: "Apply fragrance first." },
    { title: "Clean With A Dry And Soft Cloth", instruction: "Wipe gently after wear." },
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
};

test("storefront jewellery fixture maps Product Details / Care / Manufacturer with SKU", () => {
  const sections = mapProductDetailSections(JEWELLERY_PUBLIC_FIELDS);
  assert.ok(sections);
  const titles = sections!.map((s) => s.title);
  assert.deepEqual(titles, [
    "Product Details",
    "Care",
    "Manufacturer Details",
    "Key Features",
  ]);

  const productDetails = sections!.find((s) => s.id === "product-details")!;
  assert.match(productDetails.content ?? "", /SKU: AAU-EAR-001/);
  assert.match(productDetails.content ?? "", /Occasion: Everyday/);
  assert.match(productDetails.content ?? "", /Material: Brass/);
  assert.match(productDetails.content ?? "", /Net Weight: 4\.5 g/);
  assert.match(productDetails.content ?? "", /Net Quantity: 1 Pair/);
  assert.deepEqual(productDetails.richContents, [
    "Hand-finished pearl studs for everyday wear.",
  ]);

  const care = sections!.find((s) => s.id === "care")!;
  assert.deepEqual(care.richContents, ["Store in a dry place."]);
  assert.match(care.content ?? "", /Keep Away From Water/);
  assert.match(care.content ?? "", /Clean With A Dry And Soft Cloth/);

  const manufacturer = sections!.find((s) => s.id === "manufacturer")!;
  assert.match(manufacturer.content ?? "", /Country of Origin: India/);
  assert.match(manufacturer.content ?? "", /Marketed By: AAURIKAA/);
  assert.match(manufacturer.content ?? "", /Grievance Redressal: support@example.com/);
  assert.doesNotMatch(manufacturer.content ?? "", /Manufacturer Details:/);
  assert.deepEqual(manufacturer.richContents, ["Crafted for AAURIKAA."]);

  const features = sections!.find((s) => s.id === "features")!;
  assert.match(features.content ?? "", /Finish: Gold/);
  assert.doesNotMatch(features.content ?? "", /Material: Brass/);
  assert.doesNotMatch(features.content ?? "", /Net Quantity: 1 Pair/);
  assert.deepEqual(features.richContents, ["Nickel-conscious construction."]);
});

test("product mapper wires sku and jewellery detail fields into mapProductDetailSections", () => {
  const source = fs.readFileSync(path.join(import.meta.dirname, "product.ts"), "utf8");
  assert.match(source, /sku,/);
  assert.match(source, /usageInstructions: cleaned\.usageInstructions/);
  assert.match(source, /manufacturerConditions: cleaned\.manufacturerConditions/);
  assert.match(source, /occasions: cleaned\.occasions/);
  assert.match(source, /length: cleaned\.length/);
  assert.match(source, /weight: cleaned\.weight/);
});

test("mapProductDetailSections skips empty jewellery subsections", () => {
  const sections = mapProductDetailSections({
    sku: "X",
    features: [{ key: "Material", value: "Silver", code: "material.material" }],
  });
  assert.equal(sections?.length, 1);
  assert.equal(sections?.[0]?.title, "Product Details");
  assert.equal(mapProductDetailSections({ usageSafetyContent: "  " }), undefined);
});

test("mapProductDetailSections ignores zero length/width/height/weight from cleared Admin fields", () => {
  const sections = mapProductDetailSections({
    sku: "AAU-1",
    length: 0,
    width: 0,
    height: 0,
    weight: 0,
  });
  assert.ok(sections);
  assert.equal(sections!.length, 1);
  assert.match(sections![0]!.content ?? "", /SKU: AAU-1/);
  assert.doesNotMatch(sections![0]!.content ?? "", /Length:/);
  assert.doesNotMatch(sections![0]!.content ?? "", /Net Weight:/);
});

test("mapProductDetailSections puts TipTap narratives in richContents not plain content", () => {
  const tipTap = JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Structured care" }] }],
  });
  const emptyDoc = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] });
  const sections = mapProductDetailSections({
    description: tipTap,
    usageSafetyContent: tipTap,
    featuresContent: emptyDoc,
    manufacturerConditions: {
      countryOfOrigin: "India",
      details: tipTap,
    },
  });
  assert.ok(sections);
  const productDetails = sections!.find((s) => s.id === "product-details")!;
  assert.equal(productDetails.content, undefined);
  assert.deepEqual(productDetails.richContents, [tipTap]);

  const care = sections!.find((s) => s.id === "care")!;
  assert.equal(care.content, undefined);
  assert.deepEqual(care.richContents, [tipTap]);

  const manufacturer = sections!.find((s) => s.id === "manufacturer")!;
  assert.match(manufacturer.content ?? "", /Country of Origin: India/);
  assert.deepEqual(manufacturer.richContents, [tipTap]);

  assert.equal(
    sections!.find((s) => s.id === "features"),
    undefined,
    "empty TipTap features narrative must not create a section",
  );
});
