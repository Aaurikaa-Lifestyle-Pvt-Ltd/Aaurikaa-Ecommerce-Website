import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDiscoverySearchParams,
  defaultDiscoveryQuery,
  hasActiveFilters,
  paginateProducts,
  parseDiscoveryQuery,
  toBackendListQuery,
} from "./discovery.ts";
import type { Product } from "../types/commerce.ts";

test("parseDiscoveryQuery reads page, filters, sort, price, and taxonomy", () => {
  const query = parseDiscoveryQuery({
    sort: "price-asc",
    availability: "in-stock",
    sale: "1",
    page: "3",
    q: " ring ",
    category: "earrings",
    subcategory: "studs",
    child: "gold-studs",
    minPrice: "500",
    maxPrice: "2500",
  });
  assert.equal(query.sort, "price-asc");
  assert.equal(query.inStockOnly, true);
  assert.equal(query.onSaleOnly, true);
  assert.equal(query.page, 3);
  assert.equal(query.q, "ring");
  assert.equal(query.category, "earrings");
  assert.equal(query.subcategory, "studs");
  assert.equal(query.child, "gold-studs");
  assert.equal(query.minPrice, 500);
  assert.equal(query.maxPrice, 2500);
});

test("parseDiscoveryQuery drops orphan subcategory/child without parents", () => {
  const query = parseDiscoveryQuery({
    subcategory: "studs",
    child: "gold-studs",
  });
  assert.equal(query.subcategory, undefined);
  assert.equal(query.child, undefined);
});

test("toBackendListQuery maps discovery vocabulary to public API params", () => {
  const mapped = toBackendListQuery(
    defaultDiscoveryQuery({
      sort: "price-desc",
      inStockOnly: true,
      onSaleOnly: true,
      page: 2,
      q: "gold",
      minPrice: 100,
      maxPrice: 900,
    }),
    {
      categoryId: "cat1",
      subcategoryId: "sub1",
      childCategoryId: "child1",
    },
  );
  assert.deepEqual(mapped, {
    page: 2,
    limit: 24,
    sortBy: "price-high",
    inStock: "true",
    onSale: "true",
    q: "gold",
    minPrice: 100,
    maxPrice: 900,
    category: "cat1",
    subcategory: "sub1",
    childCategory: "child1",
  });
});

test("toBackendListQuery maps featured sort to newest backend default", () => {
  const mapped = toBackendListQuery(defaultDiscoveryQuery());
  assert.equal(mapped.sortBy, "newest");
  assert.equal(mapped.page, 1);
  assert.equal(mapped.limit, 24);
  assert.equal(mapped.inStock, undefined);
  assert.equal(mapped.onSale, undefined);
});

test("buildDiscoverySearchParams omits defaults and emits facets", () => {
  assert.equal(buildDiscoverySearchParams(defaultDiscoveryQuery()), "");
  assert.equal(
    buildDiscoverySearchParams(defaultDiscoveryQuery({ page: 2, sort: "newest" })),
    "?sort=newest&page=2",
  );
  assert.equal(
    buildDiscoverySearchParams(
      defaultDiscoveryQuery({
        category: "earrings",
        subcategory: "studs",
        minPrice: 200,
      }),
    ),
    "?category=earrings&subcategory=studs&minPrice=200",
  );
});

test("hasActiveFilters includes price and taxonomy facets", () => {
  assert.equal(hasActiveFilters(defaultDiscoveryQuery()), false);
  assert.equal(
    hasActiveFilters(defaultDiscoveryQuery({ minPrice: 10 })),
    true,
  );
  assert.equal(
    hasActiveFilters(defaultDiscoveryQuery({ category: "rings" })),
    true,
  );
});

test("paginateProducts returns metadata for page 2+", () => {
  const products = Array.from({ length: 30 }, (_, i) => ({
    id: String(i + 1),
    slug: `p-${i + 1}`,
    name: `P${i + 1}`,
    image: { src: "/p.jpg", alt: `P${i + 1}` },
    price: { amount: i + 1, currency: "INR" },
    inStock: true,
  })) as Product[];

  const page2 = paginateProducts(products, 2, 24);
  assert.equal(page2.totalCount, 30);
  assert.equal(page2.totalPages, 2);
  assert.equal(page2.currentPage, 2);
  assert.equal(page2.products.length, 6);
  assert.equal(page2.products[0]?.id, "25");
});
