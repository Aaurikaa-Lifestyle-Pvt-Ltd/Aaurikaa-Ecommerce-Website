import type { ReviewEligibility } from "./api/orders";

const REASON_MESSAGES: Record<string, string> = {
  ELIGIBLE: "Verified purchase — you can review this item",
  ORDER_NOT_DELIVERED: "Review available after delivery",
  ALREADY_REVIEWED: "You already reviewed this item",
  PRODUCT_NOT_FOUND: "Review unavailable",
};

export function getReviewEligibilityMessage(
  reviewEligibility?: ReviewEligibility | null,
): string {
  if (!reviewEligibility?.reason) return "Review unavailable";
  return REASON_MESSAGES[reviewEligibility.reason] ?? "Review unavailable";
}

export function canWriteReview(reviewEligibility?: ReviewEligibility | null): boolean {
  return (
    reviewEligibility?.eligible === true && reviewEligibility?.reason === "ELIGIBLE"
  );
}

export function isAlreadyReviewed(reviewEligibility?: ReviewEligibility | null): boolean {
  return (
    reviewEligibility?.alreadyReviewed === true ||
    reviewEligibility?.reason === "ALREADY_REVIEWED"
  );
}
