import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchProductsForLabelSlug,
  isLabelCollectionSlug,
  labelSlugPriceBoundsQuery,
  mergeLabelCollections,
  virtualLabelCollection,
} from "./label-collections.ts";
import type { ProductListPage } from "./discovery.ts";

function pageOf(ids: string[]): ProductListPage {
  return {
    products: ids.map((id) => ({
      id,
      slug: id,
      name: id,
      image: { src: "/p.jpg", alt: id },
      price: { amount: 100, currency: "INR" },
      inStock: true,
    })),
    totalCount: ids.length,
    totalPages: 1,
    currentPage: 1,
  };
}

test("virtualLabelCollection returns neutral names only for known slugs", () => {
  const arrivals = virtualLabelCollection("new-arrivals");
  assert.ok(arrivals);
  assert.equal(arrivals!.name, "New Arrivals");
  assert.equal(arrivals!.slug, "new-arrivals");
  assert.equal(arrivals!.description, undefined);
  assert.equal(arrivals!.seoTitle, undefined);
  assert.equal(arrivals!.seoDescription, undefined);
  assert.match(arrivals!.href, /\/collections\/new-arrivals/);

  const bestsellers = virtualLabelCollection("best-sellers");
  assert.ok(bestsellers);
  assert.equal(bestsellers!.name, "Bestsellers");
  assert.equal(bestsellers!.description, undefined);

  assert.equal(virtualLabelCollection("the-pearl-edit"), undefined);
  assert.equal(virtualLabelCollection("the-festive-edit"), undefined);
});

test("isLabelCollectionSlug recognizes operational destinations only", () => {
  assert.equal(isLabelCollectionSlug("new-arrivals"), true);
  assert.equal(isLabelCollectionSlug("best-sellers"), true);
  assert.equal(isLabelCollectionSlug("everyday-gold"), false);
});

test("mergeLabelCollections appends missing virtual destinations", () => {
  const existing = [
    {
      id: "api-1",
      slug: "new-arrivals",
      name: "From API",
      image: { src: "/x.jpg", alt: "x" },
      href: "/collections/new-arrivals",
    },
  ];
  const merged = mergeLabelCollections(existing);
  assert.equal(merged.length, 2);
  assert.equal(merged[0]?.name, "From API");
  assert.equal(merged[1]?.slug, "best-sellers");
  assert.equal(merged[1]?.name, "Bestsellers");
});

test("fetchProductsForLabelSlug prefers label=new then newest for new-arrivals", async () => {
  const calls: Record<string, string | number | undefined>[] = [];
  const products = await fetchProductsForLabelSlug(
    "new-arrivals",
    async (query) => {
      calls.push(query);
      if (query.label === "new") return pageOf([]);
      return pageOf(["1"]);
    },
    { page: 2, limit: 24, inStock: "true" },
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.label, "new");
  assert.equal(calls[0]?.page, 2);
  assert.equal(calls[0]?.inStock, "true");
  assert.equal(calls[1]?.sortBy, "newest");
  assert.equal(products.products[0]?.id, "1");
});

test("fetchProductsForLabelSlug prefers sortBy=sales then label=featured", async () => {
  const calls: Record<string, string | number | undefined>[] = [];
  const products = await fetchProductsForLabelSlug(
    "best-sellers",
    async (query) => {
      calls.push(query);
      if (query.sortBy === "sales") return pageOf([]);
      return pageOf(["2"]);
    },
    { page: 1, limit: 24 },
  );
  assert.equal(calls[0]?.sortBy, "sales");
  assert.equal(calls[1]?.label, "featured");
  assert.equal(products.products[0]?.id, "2");
});

test("fetchProductsForLabelSlug honours explicit shopper sortBy", async () => {
  const calls: Record<string, string | number | undefined>[] = [];
  await fetchProductsForLabelSlug(
    "best-sellers",
    async (query) => {
      calls.push(query);
      return pageOf(["3"]);
    },
    { page: 1, limit: 24, sortBy: "price-low" },
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.sortBy, "price-low");
});

test("labelSlugPriceBoundsQuery mirrors label listing scope", () => {
  assert.deepEqual(
    labelSlugPriceBoundsQuery("new-arrivals", {
      page: 1,
      inStock: "true",
      maxPrice: 2000,
    }),
    { page: 1, inStock: "true", maxPrice: 2000, label: "new" },
  );
  assert.deepEqual(
    labelSlugPriceBoundsQuery("best-sellers", { page: 1, onSale: "true" }),
    { page: 1, onSale: "true" },
  );
});
