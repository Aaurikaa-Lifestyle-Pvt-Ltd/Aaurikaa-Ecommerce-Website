import assert from "node:assert/strict";
import test from "node:test";
import {
  canWriteReview,
  getReviewEligibilityMessage,
  isAlreadyReviewed,
} from "./review-eligibility.ts";

test("getReviewEligibilityMessage maps known review reasons", () => {
  assert.equal(
    getReviewEligibilityMessage({ reason: "ELIGIBLE", eligible: true }),
    "Verified purchase — you can review this item",
  );
  assert.equal(
    getReviewEligibilityMessage({ reason: "ORDER_NOT_DELIVERED" }),
    "Review available after delivery",
  );
  assert.equal(
    getReviewEligibilityMessage({ reason: "ALREADY_REVIEWED" }),
    "You already reviewed this item",
  );
  assert.equal(
    getReviewEligibilityMessage({ reason: "PRODUCT_NOT_FOUND" }),
    "Review unavailable",
  );
  assert.equal(getReviewEligibilityMessage({}), "Review unavailable");
});

test("canWriteReview requires eligible true and ELIGIBLE reason", () => {
  assert.equal(
    canWriteReview({ eligible: true, reason: "ELIGIBLE" }),
    true,
  );
  assert.equal(
    canWriteReview({ eligible: true, reason: "ORDER_NOT_DELIVERED" }),
    false,
  );
  assert.equal(canWriteReview({ eligible: false, reason: "ELIGIBLE" }), false);
});

test("isAlreadyReviewed detects flag and reason", () => {
  assert.equal(isAlreadyReviewed({ alreadyReviewed: true }), true);
  assert.equal(isAlreadyReviewed({ reason: "ALREADY_REVIEWED" }), true);
  assert.equal(isAlreadyReviewed({ reason: "ELIGIBLE", eligible: true }), false);
});
