import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildAdminProductWriteBody } from "./product-write.ts";
import {
  normalizeManufacturerConditions,
  seedManufacturerDetailsFromLegacy,
} from "../product-jewellery-content.ts";

const jewelleryHelperSrc = readFileSync(
  new URL("../product-jewellery-content.ts", import.meta.url),
  "utf8",
);
const productContentEditorSrc = readFileSync(
  new URL("../../components/structured-editor.tsx", import.meta.url),
  "utf8",
);

/** Representative jewellery product write fixture (mock — not seeded to DB). */
const JEWELLERY_WRITE_INPUT = {
  name: "Lumen Pearl Studs",
  sku: "AAU-EAR-001",
  regularPrice: 2499,
  salePrice: 1999,
  stock: 8,
  category: "64b000000000000000000010",
  weightClass: "64b000000000000000000011",
  status: "published",
  longDesc: "Hand-finished pearl studs for everyday wear.",
  featuresContent: "Nickel-conscious construction.",
  usageSafetyContent: "Store in a dry place.",
  usageInstructions: [],
  manufacturerConditions: {
    countryOfOrigin: "India",
    marketedBy: "AAURIKAA",
    details: "Crafted for AAURIKAA.",
    grievanceRedressal: "support@example.com",
  },
  features: [
    { key: "Finish", value: "Gold" },
    { key: "Material", value: "Brass", code: "material.material" },
  ],
  qandas: [{ question: "Are they nickel-free?", answer: "Yes, nickel-conscious." }],
};

test("admin jewellery write FormData includes narrative + features without forcing dims", () => {
  const body = buildAdminProductWriteBody(JEWELLERY_WRITE_INPUT);

  assert.equal(body.get("sku"), "AAU-EAR-001");
  assert.equal(body.get("longDesc"), "Hand-finished pearl studs for everyday wear.");
  assert.equal(body.has("length"), false);
  assert.equal(body.has("width"), false);
  assert.equal(body.has("height"), false);
  assert.equal(body.has("weight"), false);
  assert.equal(body.has("shortDesc"), false);
  assert.equal(body.get("usageSafetyContent"), "Store in a dry place.");
  assert.equal(body.get("featuresContent"), "Nickel-conscious construction.");

  const usageInstructions = JSON.parse(String(body.get("usageInstructions")));
  assert.deepEqual(usageInstructions, []);

  const manufacturer = JSON.parse(String(body.get("manufacturerConditions")));
  assert.equal(manufacturer.countryOfOrigin, "India");
  assert.equal(manufacturer.marketedBy, "AAURIKAA");
  assert.equal(manufacturer.details, "Crafted for AAURIKAA.");
  assert.equal(manufacturer.grievanceRedressal, "support@example.com");

  const features = JSON.parse(String(body.get("features")));
  assert.deepEqual(features, [
    { key: "Finish", value: "Gold" },
    { key: "Material", value: "Brass", code: "material.material" },
  ]);
});

test("normalizeManufacturerConditions preserves compliance fields and seeds empty details", () => {
  const normalized = normalizeManufacturerConditions({
    summary: " Made in India ",
    countryOfOrigin: "India",
    marketedBy: "AAURIKAA",
    grievanceRedressal: "support@example.com",
    details: "Details",
  });
  assert.equal(normalized.summary, "Made in India");
  assert.equal(normalized.countryOfOrigin, "India");
  assert.equal(normalized.marketedBy, "AAURIKAA");
  assert.equal(normalized.grievanceRedressal, "support@example.com");
  assert.equal(normalized.details, "Details");

  const seeded = seedManufacturerDetailsFromLegacy({
    countryOfOrigin: "India",
    marketedBy: "AAURIKAA",
    grievanceRedressal: "support@example.com",
    details: "",
  });
  assert.match(seeded, /Country of Origin: India/);
  assert.match(seeded, /Marketed By: AAURIKAA/);
  assert.match(seeded, /Grievance Redressal: support@example.com/);
});

test("jewellery helpers no longer export material/qty upsert or fixed care-row editors", () => {
  assert.doesNotMatch(jewelleryHelperSrc, /FIXED_CARE_INSTRUCTION_TITLES/);
  assert.doesNotMatch(jewelleryHelperSrc, /normalizeCareInstructionRows/);
  assert.doesNotMatch(jewelleryHelperSrc, /filterCareInstructionsForSave/);
  assert.doesNotMatch(jewelleryHelperSrc, /upsertJewelleryCatalogueFeatures/);
  assert.doesNotMatch(jewelleryHelperSrc, /MATERIAL_FEATURE_CODE/);
  assert.doesNotMatch(jewelleryHelperSrc, /export function manufacturerConditionsForSave/);
});

test("ProductContentEditor is Description + Care + Manufacturer Structured Editors only", () => {
  assert.doesNotMatch(productContentEditorSrc, /Structured Care Instructions/);
  assert.doesNotMatch(productContentEditorSrc, /usageInstructions\.map/);
  assert.match(productContentEditorSrc, /ProductStructuredEditor/);
  assert.match(productContentEditorSrc, /title="Product Description"/);
  assert.match(
    productContentEditorSrc,
    /title="Manufacturer Details"[\s\S]{0,400}?ProductStructuredEditor/,
  );
  assert.doesNotMatch(productContentEditorSrc, /product-features-narrative/);
  assert.doesNotMatch(productContentEditorSrc, /Country of Origin/);
  assert.doesNotMatch(productContentEditorSrc, /Marketed By/);
  assert.doesNotMatch(productContentEditorSrc, /Grievance Redressal/);
  assert.doesNotMatch(productContentEditorSrc, /mfr-coo|mfr-marketed|mfr-grievance/);
});
