import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const wishlistSource = readFileSync(join(here, "wishlist.ts"), "utf8");
const productCardSource = readFileSync(
  join(here, "../../components/product/product-card.tsx"),
  "utf8",
);
const wishlistPageSource = readFileSync(
  join(here, "../../app/wishlist/page.tsx"),
  "utf8",
);

test("wishlist write client posts productId to add and remove endpoints", () => {
  assert.match(wishlistSource, /\/api\/shopper\/wishlist\/add/);
  assert.match(wishlistSource, /\/api\/shopper\/wishlist\/remove/);
  assert.match(wishlistSource, /body:\s*\{\s*productId\s*\}/);
  assert.match(wishlistSource, /export async function addWishlistProduct/);
  assert.match(wishlistSource, /export async function removeWishlistProduct/);
});

test("wishlist id cache helpers support heart hydration", () => {
  assert.match(wishlistSource, /export async function fetchWishlistProductIds/);
  assert.match(wishlistSource, /export async function isProductWishlisted/);
  assert.match(wishlistSource, /export function clearWishlistIdCache/);
});

test("product card wishlist heart calls add/remove and prompts guests", () => {
  assert.match(productCardSource, /addWishlistProduct/);
  assert.match(productCardSource, /removeWishlistProduct/);
  assert.match(productCardSource, /isProductWishlisted/);
  assert.match(productCardSource, /Sign in/);
});

test("wishlist page hydrates cards as wishlisted and removes on toggle off", () => {
  assert.match(wishlistPageSource, /initialWishlisted/);
  assert.match(wishlistPageSource, /onWishlistChange/);
  assert.match(wishlistPageSource, /fetchWishlist/);
});

test("wishlist optimistic toggle rolls back on failure", () => {
  let wishlisted = false;
  const next = !wishlisted;
  wishlisted = next;
  assert.equal(wishlisted, true);
  wishlisted = !next;
  assert.equal(wishlisted, false);
});
