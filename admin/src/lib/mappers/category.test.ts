import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const categoryMapperSrc = readFileSync(new URL("./category.ts", import.meta.url), "utf8");
const categoriesApiSrc = readFileSync(new URL("../api/categories.ts", import.meta.url), "utf8");

test("category hierarchy mapper exposes tax fields and inherit label helper", () => {
  assert.match(categoryMapperSrc, /categoryTaxRate/);
  assert.match(categoryMapperSrc, /subcategoryTaxRate/);
  assert.match(categoryMapperSrc, /childTaxRate/);
  assert.match(categoryMapperSrc, /categoryTaxType/);
  assert.match(categoryMapperSrc, /mapOptionalTaxRate/);
  assert.match(categoryMapperSrc, /mapTaxonomyTaxType/);
  assert.match(categoryMapperSrc, /previewTaxonomySlug/);
  assert.match(categoryMapperSrc, /formatTaxonomyTaxLabel/);
  assert.match(categoryMapperSrc, /Inherit/);
});

test("category API write distinguishes inherit empty string from explicit 0", () => {
  assert.match(categoriesApiSrc, /appendInheritedTaxRate/);
  assert.match(categoriesApiSrc, /body\.append\("taxRate", ""\)/);
  assert.match(categoriesApiSrc, /Never send "0" for inherit/);
  assert.match(categoriesApiSrc, /body\.append\("taxRate", String\(taxRate\)\)/);
  assert.match(categoriesApiSrc, /body\.append\("taxType"/);
});

test("categories page uses resolveTaxonomyTaxWrite for override blank validation", () => {
  const pageSrc = readFileSync(
    new URL("../../app/admin/categories/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(pageSrc, /resolveTaxonomyTaxWrite/);
  assert.match(pageSrc, /previewTaxonomySlug/);
  assert.match(pageSrc, /Tax type/);
  assert.doesNotMatch(pageSrc, /Number\(overrideTaxRate\).* \|\| 0/);
});

test("formatTaxonomyTaxLabel semantics: inherit ≠ 0%", () => {
  function formatTaxonomyTaxLabel(rate: number | null | undefined, hasLevel: boolean): string {
    if (!hasLevel) return "—";
    if (rate === null || rate === undefined) return "Inherit";
    return `${rate}%`;
  }
  assert.equal(formatTaxonomyTaxLabel(null, true), "Inherit");
  assert.equal(formatTaxonomyTaxLabel(undefined, true), "Inherit");
  assert.equal(formatTaxonomyTaxLabel(0, true), "0%");
  assert.equal(formatTaxonomyTaxLabel(18, true), "18%");
  assert.equal(formatTaxonomyTaxLabel(0, false), "—");
});
