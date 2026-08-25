import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const productMapperSrc = readFileSync(new URL("./product.ts", import.meta.url), "utf8");

test("mapProductStatus uses Published for live catalogue (not EntityStatus Active)", () => {
  assert.match(productMapperSrc, /return "Published"/);
  assert.doesNotMatch(productMapperSrc, /return "Active"/);
  assert.match(productMapperSrc, /if \(status === "draft"\) return "Draft"/);
  assert.match(productMapperSrc, /if \(status === "inactive"\) return "Inactive"/);
  assert.match(productMapperSrc, /if \(status === "trash"\) return "Trash"/);
  assert.match(productMapperSrc, /if \(status === "archived"\) return "Archived"/);
});

test("mapProductStatus maps trash distinctly from archived", () => {
  assert.match(productMapperSrc, /if \(status === "trash"\) return "Trash"/);
  assert.match(productMapperSrc, /if \(status === "archived"\) return "Archived"/);
  assert.doesNotMatch(
    productMapperSrc,
    /status === "archived" \|\| status === "trash"/,
  );
});

test("toBackendProductStatus maps Published to published and supports Trash", () => {
  assert.match(productMapperSrc, /return "published"/);
  assert.match(productMapperSrc, /if \(status === "Draft"\) return "draft"/);
  assert.match(productMapperSrc, /if \(status === "Inactive"\) return "inactive"/);
  assert.match(productMapperSrc, /if \(status === "Trash"\) return "trash"/);
  assert.match(productMapperSrc, /if \(status === "Archived"\) return "archived"/);
});

test("mapAdminProduct source maps brand, SEO, qandas, and jewellery content fields", () => {
  assert.match(productMapperSrc, /brandId: refId\(raw\.brand\)/);
  assert.match(productMapperSrc, /metaKeywords: String\(raw\.metaKeywords/);
  assert.match(productMapperSrc, /primaryKeyword: resolvePrimaryKeyword/);
  assert.match(productMapperSrc, /qandas: mapQandas\(raw\.qandas\)/);
  assert.match(productMapperSrc, /seo\?\.primaryKeyword/);
  assert.match(productMapperSrc, /usageInstructions: mapUsageInstructions/);
  assert.match(productMapperSrc, /manufacturerConditions: mapManufacturerConditions/);
  assert.match(productMapperSrc, /length: mapOptionalNumber\(raw\.length\)/);
  assert.match(productMapperSrc, /weight: mapOptionalNumber\(raw\.weight\)/);
});

test("mapAdminProduct exposes regularPrice and salePrice for List/Sale form round-trip", () => {
  assert.match(productMapperSrc, /regularPrice: regular/);
  assert.match(productMapperSrc, /salePrice: sale/);
  assert.match(
    productMapperSrc,
    /Form fields must 1:1 match backend regularPrice \/ salePrice/,
  );
});

test("product edit form binds List\/Sale to regularPrice\/salePrice not compare-at display", () => {
  const formSrc = readFileSync(
    new URL("../../components/product-edit-form.tsx", import.meta.url),
    "utf8",
  );
  assert.match(formSrc, /product\?\.regularPrice && product\.regularPrice > 0/);
  assert.match(formSrc, /product\?\.salePrice && product\.salePrice > 0/);
  assert.doesNotMatch(
    formSrc,
    /useState\(\s*product \? String\(product\.price\) : ""\s*\)/,
  );
});
