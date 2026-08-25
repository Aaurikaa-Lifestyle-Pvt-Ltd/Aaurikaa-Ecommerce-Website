import assert from "node:assert/strict";
import test from "node:test";
import { buildTaxonomyHref, parseTaxonomyPath } from "./taxonomy.ts";
import {
  mapMegaMenuTree,
  resolveTaxonomyFilterIds,
} from "./mappers/mega-menu.ts";

test("parseTaxonomyPath accepts 1–3 segments and rejects deeper paths", () => {
  assert.deepEqual(parseTaxonomyPath(["earrings"]), {
    categorySlug: "earrings",
    depth: 1,
  });
  assert.deepEqual(parseTaxonomyPath(["earrings", "studs"]), {
    categorySlug: "earrings",
    subSlug: "studs",
    depth: 2,
  });
  assert.deepEqual(parseTaxonomyPath(["earrings", "studs", "gold"]), {
    categorySlug: "earrings",
    subSlug: "studs",
    childSlug: "gold",
    depth: 3,
  });
  assert.equal(parseTaxonomyPath([]), null);
  assert.equal(parseTaxonomyPath(["a", "b", "c", "d"]), null);
});

test("buildTaxonomyHref builds nested /categories paths", () => {
  assert.equal(buildTaxonomyHref("earrings"), "/categories/earrings");
  assert.equal(
    buildTaxonomyHref("earrings", "studs"),
    "/categories/earrings/studs",
  );
  assert.equal(
    buildTaxonomyHref("earrings", "studs", "gold"),
    "/categories/earrings/studs/gold",
  );
  assert.equal(buildTaxonomyHref(""), "/categories");
});

test("resolveTaxonomyFilterIds maps facet slugs to ObjectIds", () => {
  const tree = mapMegaMenuTree([
    {
      _id: "c1",
      name: "Earrings",
      slug: "earrings",
      isActive: true,
      subcategories: [
        {
          _id: "s1",
          name: "Studs",
          slug: "studs",
          childCategories: [{ _id: "ch1", name: "Gold", slug: "gold" }],
        },
      ],
    },
  ]);

  assert.deepEqual(
    resolveTaxonomyFilterIds(tree, {
      category: "earrings",
      subcategory: "studs",
      child: "gold",
    }),
    {
      categoryId: "c1",
      subcategoryId: "s1",
      childCategoryId: "ch1",
    },
  );

  assert.deepEqual(resolveTaxonomyFilterIds(tree, { category: "missing" }), {});
});
