import assert from "node:assert/strict";
import test from "node:test";
import {
  parseRequiredTaxOverride,
  resolveProductTaxWrite,
  resolveTaxonomyTaxWrite,
} from "./tax-rate-input.ts";

test("inherit + blank remains inherit (null), never 0", () => {
  const result = resolveTaxonomyTaxWrite("inherit", "");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value, null);
});

test("override + valid rate saves correctly", () => {
  const tax = resolveTaxonomyTaxWrite("override", "18");
  assert.equal(tax.ok, true);
  if (tax.ok) assert.equal(tax.value, 18);

  const product = resolveProductTaxWrite("override", "12.5");
  assert.equal(product.ok, true);
  if (product.ok) assert.equal(product.value, 12.5);
});

test("override + blank is a validation error and must not become 0", () => {
  const tax = resolveTaxonomyTaxWrite("override", "   ");
  assert.equal(tax.ok, false);
  if (!tax.ok) assert.match(tax.error, /required/i);

  const blankProduct = resolveProductTaxWrite("override", "");
  assert.equal(blankProduct.ok, false);
  if (!blankProduct.ok) assert.match(blankProduct.error, /required/i);

  const coerced = parseRequiredTaxOverride("");
  assert.equal(coerced.ok, false);
  assert.notEqual(
    coerced.ok === false ? null : coerced.value,
    0,
    "blank must not parse as explicit 0",
  );
});

test("explicit 0% remains 0 where supported", () => {
  const taxZero = resolveTaxonomyTaxWrite("override", "0");
  assert.equal(taxZero.ok, true);
  if (taxZero.ok) assert.equal(taxZero.value, 0);

  const productZero = resolveProductTaxWrite("override", "0");
  assert.equal(productZero.ok, true);
  if (productZero.ok) assert.equal(productZero.value, 0);

  const categoryMode = resolveProductTaxWrite("category", "");
  assert.equal(categoryMode.ok, true);
  if (categoryMode.ok) assert.equal(categoryMode.value, 0);
});
