import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAdminProductWriteBody,
  writeBodyHasSellerSelection,
} from "./product-write.ts";

test("admin product writes never include Seller selection", () => {
  const body = buildAdminProductWriteBody({
    name: "Pearl Studs",
    regularPrice: 1499,
    category: "64b000000000000000000010",
    weightClass: "64b000000000000000000011",
    status: "draft",
  });
  assert.equal(writeBodyHasSellerSelection(body), false);
  assert.equal(body.has("sellerId"), false);
  assert.equal(body.has("seller"), false);
  assert.equal(body.has("sellerShop"), false);
  assert.equal(body.get("name"), "Pearl Studs");
  assert.equal(body.get("regularPrice"), "1499");
  assert.equal(body.get("status"), "draft");
});

test("admin product write includes taxonomy, media ids, variants, SEO, brand, and qandas", () => {
  const body = buildAdminProductWriteBody({
    name: "Layered Chain",
    regularPrice: 1999,
    salePrice: 1499,
    stock: 12,
    category: "64b000000000000000000010",
    subcategory: "64b000000000000000000020",
    childCategory: "64b000000000000000000030",
    brand: "64b000000000000000000099",
    weightClass: "64b000000000000000000011",
    status: "published",
    featuresContent: "Nickel-free finish",
    usageSafetyContent: "Keep away from water",
    features: [{ key: "Material", value: "Alloy" }],
    qandas: [{ question: "Is it nickel-free?", answer: "Yes" }],
    variants: [{ type: "Colour", values: ["Gold", "Silver"] }],
    variantSku: { "colour:gold": "LC-G", "colour:silver": "LC-S" },
    variantStock: { "colour:gold": 5, "colour:silver": 7 },
    variantPricing: {
      "colour:gold": { price: 1999, salePrice: 1499 },
      "colour:silver": { price: 1999 },
    },
    metaTitle: "Layered Chain | AAURIKAA",
    metaDescription: "Gold and silver layered chain.",
    metaKeywords: "chain, gold",
    primaryKeyword: "Layered Chain",
    mainImage: {
      url: "https://cdn.example.com/main.jpg",
      mediaId: "64b000000000000000000040",
    },
    galleryImages: [
      { url: "https://cdn.example.com/g1.jpg", mediaId: "64b000000000000000000041" },
    ],
    video: {
      url: "https://cdn.example.com/clip.mp4",
      mediaId: "64b000000000000000000042",
    },
  });

  assert.equal(body.get("subcategory"), "64b000000000000000000020");
  assert.equal(body.get("childCategory"), "64b000000000000000000030");
  assert.equal(body.get("brand"), "64b000000000000000000099");
  assert.equal(body.get("featuresContent"), "Nickel-free finish");
  assert.equal(body.get("usageSafetyContent"), "Keep away from water");
  assert.equal(body.get("mainImage"), "https://cdn.example.com/main.jpg");
  assert.equal(body.get("mainImageId"), "64b000000000000000000040");
  assert.equal(body.get("galleryImages"), "https://cdn.example.com/g1.jpg");
  assert.equal(body.get("galleryImageIds"), JSON.stringify(["64b000000000000000000041"]));
  assert.equal(body.get("videoId"), "64b000000000000000000042");
  assert.equal(body.get("metaTitle"), "Layered Chain | AAURIKAA");
  assert.equal(body.get("metaDescription"), "Gold and silver layered chain.");
  assert.equal(body.get("metaKeywords"), "chain, gold");
  assert.equal(body.get("primaryKeyword"), "Layered Chain");
  assert.equal(
    body.get("qandas"),
    JSON.stringify([{ question: "Is it nickel-free?", answer: "Yes" }]),
  );
  assert.equal(body.get("variants"), JSON.stringify([{ type: "Colour", values: ["Gold", "Silver"] }]));
  assert.equal(writeBodyHasSellerSelection(body), false);
});

test("admin product write omits brand when undefined", () => {
  const body = buildAdminProductWriteBody({
    name: "No Brand",
    regularPrice: 100,
  });
  assert.equal(body.has("brand"), false);
});

test("admin product write sends empty brand to clear on update", () => {
  const body = buildAdminProductWriteBody({
    name: "Clear Brand",
    regularPrice: 100,
    brand: "",
  });
  assert.equal(body.has("brand"), true);
  assert.equal(body.get("brand"), "");
});

test("admin product write sends taxRate 0 for category fallback and taxIncluded/hsnCode", () => {
  const categoryFallback = buildAdminProductWriteBody({
    name: "Category tax product",
    regularPrice: 1000,
    taxRate: 0,
    taxIncluded: false,
    hsnCode: "7113",
  });
  assert.equal(categoryFallback.get("taxRate"), "0");
  assert.equal(categoryFallback.get("taxIncluded"), "false");
  assert.equal(categoryFallback.get("hsnCode"), "7113");

  const override = buildAdminProductWriteBody({
    name: "Override tax product",
    regularPrice: 1000,
    taxRate: 18,
    taxIncluded: true,
    hsnCode: "",
  });
  assert.equal(override.get("taxRate"), "18");
  assert.equal(override.get("taxIncluded"), "true");
  assert.equal(override.get("hsnCode"), "");

  const explicitZero = buildAdminProductWriteBody({
    name: "Explicit zero product",
    regularPrice: 1000,
    taxRate: 0,
  });
  assert.equal(explicitZero.get("taxRate"), "0");
});

test("admin product write clears empty TipTap narratives; Care/Features unwrap to plain", () => {
  const emptyDoc = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] });
  const careDoc = JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Store dry" }] }],
  });
  const mfrDoc = JSON.stringify({
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Made for AAURIKAA" }],
      },
    ],
  });
  const body = buildAdminProductWriteBody({
    name: "Empty narratives",
    regularPrice: 100,
    shortDesc: emptyDoc,
    longDesc: emptyDoc,
    featuresContent: emptyDoc,
    usageSafetyContent: careDoc,
    manufacturerConditions: {
      details: mfrDoc,
      countryOfOrigin: "India",
      grievanceRedressal: "support@example.com",
    },
  });
  assert.equal(body.get("shortDesc"), "");
  assert.equal(body.get("longDesc"), "");
  // Features: empty TipTap → "" (plain). Care + manufacturer details keep TipTap JSON.
  assert.equal(body.get("featuresContent"), "");
  const careWritten = JSON.parse(String(body.get("usageSafetyContent")));
  assert.equal(careWritten.content?.[0]?.type, "paragraph");
  assert.equal(careWritten.content?.[0]?.content?.[0]?.text, "Store dry");
  const manufacturer = JSON.parse(String(body.get("manufacturerConditions")));
  const detailsDoc = JSON.parse(manufacturer.details);
  assert.equal(detailsDoc.content?.[0]?.type, "heading");
  assert.equal(detailsDoc.content?.[0]?.attrs?.level, 2);
  assert.equal(manufacturer.countryOfOrigin, "India");
});

test("draft write body includes status=draft and omits weightClass when not set", () => {
  const body = buildAdminProductWriteBody({
    name: "Draft earrings",
    regularPrice: 999,
    status: "draft",
  });
  assert.equal(body.get("status"), "draft");
  assert.equal(body.has("weightClass"), false);
});

test("product write includes optional weight in grams", () => {
  const body = buildAdminProductWriteBody({
    name: "Gold hoop",
    regularPrice: 2500,
    weight: "4.2",
    status: "draft",
  });
  assert.equal(body.get("weight"), "4.2");
});

test("publish write body includes status=published", () => {
  const body = buildAdminProductWriteBody({
    name: "Live necklace",
    regularPrice: 2999,
    category: "64b000000000000000000010",
    weightClass: "64b000000000000000000011",
    status: "published",
  });
  assert.equal(body.get("status"), "published");
  assert.equal(body.get("weightClass"), "64b000000000000000000011");
});

test("inactive and trash status strings pass through write body", () => {
  const inactive = buildAdminProductWriteBody({
    name: "Paused",
    regularPrice: 100,
    status: "inactive",
  });
  assert.equal(inactive.get("status"), "inactive");

  const trash = buildAdminProductWriteBody({
    name: "Trashed",
    regularPrice: 100,
    status: "trash",
  });
  assert.equal(trash.get("status"), "trash");
});
