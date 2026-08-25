import assert from "node:assert/strict";
import test from "node:test";
import {
  groupSuggestionItems,
  highlightQuery,
  hrefForSuggestion,
  isSuggestionTermReady,
  mapGroupedSuggestions,
} from "./search-suggestions.ts";

test("isSuggestionTermReady requires at least 2 characters", () => {
  assert.equal(isSuggestionTermReady(""), false);
  assert.equal(isSuggestionTermReady("a"), false);
  assert.equal(isSuggestionTermReady(" ab "), true);
});

test("hrefForSuggestion builds product and taxonomy paths", () => {
  assert.equal(hrefForSuggestion("product", { slug: "gold-hoops" }), "/products/gold-hoops");
  assert.equal(hrefForSuggestion("category", { slug: "earrings" }), "/categories/earrings");
  assert.equal(
    hrefForSuggestion("subcategory", {
      slug: "studs",
      category: { slug: "earrings" },
    }),
    "/categories/earrings/studs",
  );
  assert.equal(
    hrefForSuggestion("childCategory", {
      slug: "pearl",
      category: { slug: "earrings" },
      subcategory: { slug: "studs" },
    }),
    "/categories/earrings/studs/pearl",
  );
  assert.equal(
    hrefForSuggestion("subcategory", { slug: "studs", category: null }),
    null,
  );
});

test("mapGroupedSuggestions omits sellers brands and tags", () => {
  const items = mapGroupedSuggestions({
    products: [{ _id: "1", name: "Gold Hoops", slug: "gold-hoops" }],
    categories: [{ _id: "2", name: "Earrings", slug: "earrings" }],
    subcategories: [
      {
        _id: "3",
        name: "Studs",
        slug: "studs",
        category: { _id: "2", name: "Earrings", slug: "earrings" },
      },
    ],
    childCategories: [
      {
        _id: "4",
        name: "Pearl Studs",
        slug: "pearl",
        category: { _id: "2", name: "Earrings", slug: "earrings" },
        subcategory: { _id: "3", name: "Studs", slug: "studs" },
      },
    ],
    brands: [{ _id: "b", name: "ShouldHide" }],
    sellers: [{ _id: "s", shopName: "Marketplace Shop" }],
    tags: [{ name: "festive" }],
  });

  assert.equal(items.length, 4);
  assert.deepEqual(
    items.map((i) => i.kind),
    ["product", "category", "subcategory", "childCategory"],
  );
  assert.equal(
    items.some((i) => /seller|shop|marketplace|brand|festive/i.test(i.label)),
    false,
  );
  assert.equal(items[2]?.meta, "Earrings");
  assert.equal(items[3]?.meta, "Earrings · Studs");
});

test("groupSuggestionItems keeps jewellery section labels", () => {
  const grouped = groupSuggestionItems(
    mapGroupedSuggestions({
      products: [{ _id: "1", name: "Ring", slug: "ring" }],
      categories: [{ _id: "2", name: "Rings", slug: "rings" }],
    }),
  );
  assert.deepEqual(
    grouped.map((g) => g.label),
    ["Pieces", "Categories"],
  );
});

test("highlightQuery marks matching spans case-insensitively", () => {
  const parts = highlightQuery("Gold Hoop Earrings", "hoop");
  assert.deepEqual(parts, [
    { text: "Gold ", match: false },
    { text: "Hoop", match: true },
    { text: " Earrings", match: false },
  ]);
});
