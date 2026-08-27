import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

/** Mirrors reviews.ts seller filter for contract coverage without loading apiRequest. */
function isSellerRoleReview(review: {
  reviewer?: { role?: string | null } | null;
}): boolean {
  return String(review.reviewer?.role ?? "").toLowerCase() === "seller";
}

function filterCustomerFacingReviews<
  T extends { reviewer?: { role?: string | null } | null },
>(reviews: T[]): T[] {
  return reviews.filter((review) => !isSellerRoleReview(review));
}

function mapVerifiedPurchase(raw: { verifiedPurchase?: unknown }): boolean {
  return Boolean(raw.verifiedPurchase);
}

test("seller-role reviews are excluded from customer-facing lists", () => {
  assert.equal(isSellerRoleReview({ reviewer: { role: "seller" } }), true);
  assert.equal(isSellerRoleReview({ reviewer: { role: "Seller" } }), true);
  assert.equal(isSellerRoleReview({ reviewer: { role: "shopper" } }), false);
  const filtered = filterCustomerFacingReviews([
    { id: "1", reviewer: { role: "shopper" } },
    { id: "2", reviewer: { role: "seller" } },
    { id: "3", reviewer: { role: "admin" } },
  ]);
  assert.deepEqual(
    filtered.map((r) => r.id),
    ["1", "3"],
  );
});

test("verifiedPurchase maps truthy from API payload", () => {
  assert.equal(mapVerifiedPurchase({ verifiedPurchase: true }), true);
  assert.equal(mapVerifiedPurchase({ verifiedPurchase: false }), false);
  assert.equal(mapVerifiedPurchase({}), false);
});

test("reviews client uses public product reviews contract", () => {
  const text = fs.readFileSync(path.join(import.meta.dirname, "reviews.ts"), "utf8");
  assert.match(text, /\/api\/reviews\/product\//);
  assert.match(text, /customerReviews/);
  assert.match(text, /avgRating/);
  assert.match(text, /reviewCount/);
  assert.match(text, /ratingBreakdown/);
  assert.match(text, /verifiedPurchase/);
  assert.match(text, /filterCustomerFacingReviews|isSellerRoleReview/);
  assert.match(text, /auth:\s*false/);
  assert.equal(/\/api\/reviews\/seller/i.test(text), false);
  assert.match(text, /createCustomerReview/);
  assert.match(text, /createProductReview/);
  assert.match(text, /buildCustomerReviewPayload/);
  assert.match(text, /\/api\/reviews[^/]/);
  assert.match(text, /orderId/);
  assert.equal(text.includes('"/api/reviews/"'), false);
});

test("star rating UI provides display and interactive input without select", () => {
  const root = path.resolve(import.meta.dirname, "../..");
  const stars = fs.readFileSync(
    path.join(root, "components/ui/star-rating.tsx"),
    "utf8",
  );
  const orderPage = fs.readFileSync(
    path.join(root, "app/account/orders/[id]/page.tsx"),
    "utf8",
  );
  const card = fs.readFileSync(
    path.join(root, "components/product/product-card.tsx"),
    "utf8",
  );
  const reviewsUi = fs.readFileSync(
    path.join(root, "components/product/product-reviews.tsx"),
    "utf8",
  );
  const purchase = fs.readFileSync(
    path.join(root, "components/product/product-purchase.tsx"),
    "utf8",
  );

  assert.match(stars, /export function StarDisplay/);
  assert.match(stars, /export function StarRatingInput/);
  assert.match(stars, /role="radiogroup"/);
  assert.equal(/<select[\s\S]*rating/i.test(stars), false);

  assert.match(orderPage, /StarRatingInput/);
  assert.match(orderPage, /fetchProductReviews/);
  assert.match(orderPage, /reviewEligibility/);
  assert.match(orderPage, /orderId/);
  assert.match(orderPage, /OrderLineItemReview/);
  assert.match(orderPage, /getReviewEligibilityMessage/);
  assert.equal(
    /<select[\s\S]*\{\[5,\s*4,\s*3,\s*2,\s*1\]/.test(orderPage),
    false,
  );

  assert.equal(/StarDisplay/.test(card), false);
  assert.match(card, /product\.avgRating/);
  assert.match(card, /product\.reviewCount/);
  assert.match(card, /avgRating\.toFixed\(1\)/);
  assert.match(card, /justify-between/);

  assert.match(reviewsUi, /StarDisplay/);
  assert.match(reviewsUi, /Verified purchase/i);
  assert.match(reviewsUi, /verifiedPurchase/);
  assert.match(reviewsUi, /fetchProductReviews/);
  assert.equal(/seller review|SellerReview|\/api\/reviews\/seller/i.test(reviewsUi), false);

  assert.match(purchase, /fetchProductReviews/);
  assert.match(purchase, /reviewAvgRating/);
  assert.match(purchase, /reviewCount/);
});
