import assert from "node:assert/strict";
import test from "node:test";
import { generateVariantCombinations, normalizeVariantKey, variantTitle } from "./variants.ts";

test("normalizeVariantKey matches backend key shape", () => {
  assert.equal(
    normalizeVariantKey({ Colour: "Gold", Size: "Medium" }),
    "colour:gold|size:medium",
  );
});

test("generateVariantCombinations builds cartesian product", () => {
  const combos = generateVariantCombinations([
    { type: "Colour", values: ["Gold", "Silver"] },
    { type: "Size", values: ["S", "M"] },
  ]);
  assert.equal(combos.length, 4);
  assert.equal(variantTitle(combos[0]), "Colour: Gold / Size: S");
});
