const Review = require("../models/Review");
const { updateRatings } = require("./ratingAggregationService");

/**
 * Review Moderation Service
 *
 * Centralizes the moderation state machine for shopper reviews and triggers
 * rating aggregation recomputes whenever a transition affects the set of
 * approved reviews.
 *
 * State machine (admin actions):
 *   pending   --approve-->  approved   (increments aggregates)
 *   pending   --reject-->   rejected   (no aggregate impact)
 *   approved  --reject-->   rejected   (decrements aggregates)
 *   rejected  --approve-->  approved   (increments aggregates)
 *   approved  --approve-->  (blocked: BUSINESS_RULE_VIOLATION)
 *   rejected  --reject-->   (blocked: BUSINESS_RULE_VIOLATION)
 *
 * AAURIKAA: eligible shopper creates publish as approved immediately.
 * Admin reject/approve remain for content-safety hide/restore (not a queue product).
 */

const MAX_REJECTION_REASON_LENGTH = 500;

class ModerationError extends Error {
  constructor(message, code, statusCode = 400) {
    super(message);
    this.name = "ModerationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const ModerationErrorCodes = {
  REVIEW_NOT_FOUND: "REVIEW_NOT_FOUND",
  INVALID_STATE_TRANSITION: "INVALID_STATE_TRANSITION",
  INVALID_INPUT: "INVALID_INPUT",
  // Governance: only shopper reviews are moderatable. Seller/admin authoritative
  // reviews are auto-approved at creation and must never be approve/reject targets.
  NOT_MODERATABLE: "NOT_MODERATABLE",
};

/**
 * Governance guard: shopper-only moderation policy.
 * Authoritative seller/admin reviews are out of scope for the moderation queue.
 */
function assertReviewIsModeratable(review) {
  if (review?.reviewer?.role !== "shopper") {
    throw new ModerationError(
      "Only shopper reviews are moderatable",
      ModerationErrorCodes.NOT_MODERATABLE,
      400
    );
  }
}

/**
 * Load a moderatable review by id or raise a ModerationError.
 */
async function loadReviewOrThrow(reviewId) {
  const review = await Review.findById(reviewId);
  if (!review) {
    throw new ModerationError(
      "Review not found",
      ModerationErrorCodes.REVIEW_NOT_FOUND,
      404
    );
  }
  return review;
}

/**
 * Approve a review.
 * - Idempotent guard: approve on already-approved review is blocked.
 * - Clears rejectionReason so a previously rejected/restored review has no
 *   stale admin note attached after re-approval.
 *
 * @param {String|ObjectId} reviewId
 * @param {String|ObjectId} adminId
 * @returns {Promise<Object>} updated review document
 */
async function approveReview(reviewId, adminId) {
  if (!adminId) {
    throw new ModerationError(
      "adminId is required",
      ModerationErrorCodes.INVALID_INPUT,
      400
    );
  }

  const review = await loadReviewOrThrow(reviewId);
  assertReviewIsModeratable(review);

  if (review.status === "approved") {
    throw new ModerationError(
      "Review is already approved",
      ModerationErrorCodes.INVALID_STATE_TRANSITION,
      400
    );
  }

  review.status = "approved";
  review.moderatedBy = adminId;
  review.moderatedAt = new Date();
  review.rejectionReason = null;
  await review.save();

  // Recompute denormalized aggregates so newly-approved reviews appear in
  // Product.avgRating/reviewCount and Seller.avgRating/reviewCount/ratingBreakdown.
  await updateRatings(review.product, review.seller);

  return review;
}

/**
 * Reject a review.
 * - Idempotent guard: reject on already-rejected review is blocked.
 *
 * @param {String|ObjectId} reviewId
 * @param {String|ObjectId} adminId
 * @param {String|null} rejectionReason - optional, max 500 chars
 * @returns {Promise<Object>} updated review document
 */
async function rejectReview(reviewId, adminId, rejectionReason = null) {
  if (!adminId) {
    throw new ModerationError(
      "adminId is required",
      ModerationErrorCodes.INVALID_INPUT,
      400
    );
  }

  if (rejectionReason !== null && rejectionReason !== undefined) {
    if (typeof rejectionReason !== "string") {
      throw new ModerationError(
        "rejectionReason must be a string",
        ModerationErrorCodes.INVALID_INPUT,
        400
      );
    }
    if (rejectionReason.length > MAX_REJECTION_REASON_LENGTH) {
      throw new ModerationError(
        `rejectionReason exceeds ${MAX_REJECTION_REASON_LENGTH} characters`,
        ModerationErrorCodes.INVALID_INPUT,
        400
      );
    }
  }

  const review = await loadReviewOrThrow(reviewId);
  assertReviewIsModeratable(review);

  if (review.status === "rejected") {
    throw new ModerationError(
      "Review is already rejected",
      ModerationErrorCodes.INVALID_STATE_TRANSITION,
      400
    );
  }

  const wasApproved = review.status === "approved";

  review.status = "rejected";
  review.rejectionReason = rejectionReason ? rejectionReason.trim() : null;
  review.moderatedBy = adminId;
  review.moderatedAt = new Date();
  await review.save();

  // Only the approved -> rejected transition actually changes aggregates,
  // but pending -> rejected is also routed through updateRatings to keep a
  // single recompute path and avoid drift if the source-of-truth filter
  // ever changes.
  await updateRatings(review.product, review.seller);

  return review;
}

module.exports = {
  approveReview,
  rejectReview,
  ModerationError,
  ModerationErrorCodes,
  MAX_REJECTION_REASON_LENGTH,
};
