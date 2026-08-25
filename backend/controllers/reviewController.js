const mongoose = require("mongoose");
const Review = require("../models/Review");
const Product = require("../models/Product");
const Seller = require("../models/Seller");
const Shopper = require("../models/Shopper");
const Admin = require("../models/Admin");
const Order = require("../models/Order");
const { sendErrorResponse, sendSuccessResponse, ERROR_MESSAGES, ERROR_CODES, HTTP_STATUS, asyncHandler } = require("../utils/errorHandler");
const { updateRatings } = require("../services/ratingAggregationService");
const {
  approveReview: approveReviewService,
  rejectReview: rejectReviewService,
  ModerationError,
} = require("../services/reviewModerationService");
const { verifyDeliveredPurchase } = require("../services/reviewEligibilityService");

/** Select only non-personal fields when populating reviewer: shopName (Seller), username (Shopper/Admin) */
const REVIEWER_POPULATE_SELECT = "username shopName";

/**
 * Shape a review for frontend: expose only reviewer.role and reviewer.displayName.
 * displayName = shopName for Seller, username for Shopper/Admin. No email, name, or other personal fields.
 */
function shapeReviewForFrontend(review) {
  const r = review && typeof review.toObject === "function" ? review.toObject() : (review ? { ...review } : null);
  if (!r || !r.reviewer) return r;
  const role = r.reviewer.role;
  const userId = r.reviewer.userId;
  const displayName =
    role === "seller"
      ? (userId && (userId.shopName || userId.username)) || "Shop"
      : (userId && userId.username) || "User";
  r.reviewer = { role, displayName };
  return r;
}

/**
 * Review Controller
 * 
 * Handles all review-related operations:
 * - Shopper reviews (login required)
 * - Seller reviews (one-time, editable)
 * - Admin reviews (one-time, editable)
 */

/**
 * Helper: Get reviewer info based on role
 */
const getReviewerInfo = async (userId, role) => {
  let reviewer = null;
  let roleModel = null;

  switch (role) {
    case "shopper":
      reviewer = await Shopper.findById(userId);
      roleModel = "Shopper";
      break;
    case "seller":
      reviewer = await Seller.findById(userId);
      roleModel = "Seller";
      break;
    case "admin":
      reviewer = await Admin.findById(userId);
      roleModel = "Admin";
      break;
    default:
      throw new Error("Invalid reviewer role");
  }

  if (!reviewer) {
    throw new Error(`${roleModel} not found`);
  }

  // Extract name based on model structure
  let name = reviewer.username; // fallback
  if (role === "admin" && reviewer.name) {
    name = reviewer.name;
  } else if ((role === "shopper" || role === "seller") && (reviewer.firstName || reviewer.lastName)) {
    name = `${reviewer.firstName || ""} ${reviewer.lastName || ""}`.trim();
  } else if (reviewer.name) {
    name = reviewer.name;
  }

  return {
    userId: reviewer._id,
    role: role,
    roleModel: roleModel,
    name: name,
    email: reviewer.email
  };
};

/**
 * POST /api/reviews
 * Create customer review (login required per SRS)
 */
exports.createCustomerReview = asyncHandler(async (req, res) => {
  const { productId, rating, comment } = req.body;
  const shopperId = req.user.id || req.user._id;

  // Validation
  if (!productId || !rating) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Product ID and rating are required",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  if (rating < 1 || rating > 5) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Rating must be between 1 and 5",
      ERROR_CODES.VALIDATION_FAILED
    );
  }

  // Check if product exists
  const product = await Product.findById(productId);
  if (!product) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      "Product not found",
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  // Get reviewer info
  const reviewerInfo = await getReviewerInfo(shopperId, "shopper");

  // Check if review already exists (update if exists)
  let review = await Review.findOne({
    product: productId,
    "reviewer.userId": shopperId,
    "reviewer.role": "shopper"
  });

  // Eligible genuine purchasers only (delivered order containing this product).
  const purchaseVerification = await verifyDeliveredPurchase({
    shopperId,
    productId,
    orderId: req.body.orderId || null,
  });
  if (!purchaseVerification.verifiedPurchase) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.FORBIDDEN,
      "Only customers with a delivered purchase of this product can submit a review",
      ERROR_CODES.BUSINESS_RULE_VIOLATION
    );
  }
  const verifiedPurchase = true;
  const orderId = purchaseVerification.orderId;

  let isNewReview = false;
  if (review) {
    // Update existing review. AAURIKAA: stay published when already approved.
    // Admin-rejected (hidden) reviews remain rejected — shopper edit does not re-publish.
    review.rating = rating;
    review.comment = comment || "";
    review.verifiedPurchase = verifiedPurchase;
    review.orderId = orderId;
    if (review.status !== "rejected") {
      review.status = "approved";
    }
    review.updatedAt = new Date();
    await review.save();
  } else {
    // Eligible shopper reviews publish immediately (no moderation queue).
    isNewReview = true;
    review = new Review({
      product: productId,
      productSku: product.sku,
      seller: product.seller,
      reviewer: reviewerInfo,
      rating: rating,
      comment: comment || "",
      isAuthoritative: false,
      status: "approved",
      verifiedPurchase: verifiedPurchase,
      orderId: orderId
    });
    await review.save();
  }

  // Update ratings
  const ratings = await updateRatings(productId, product.seller);

  const populated = await Review.findById(review._id)
    .populate("reviewer.userId", REVIEWER_POPULATE_SELECT)
    .lean();
  const shapedReview = shapeReviewForFrontend(populated);

  sendSuccessResponse(
    res,
    isNewReview ? HTTP_STATUS.CREATED : HTTP_STATUS.OK,
    isNewReview ? "Review submitted successfully" : "Review updated successfully",
    {
      review: shapedReview,
      product: {
        avgRating: ratings.product.avgRating,
        reviewCount: ratings.product.reviewCount
      }
    }
  );
});

/**
 * POST /api/reviews/seller/:productId
 * Create/update authoritative seller review (one-time, editable per SRS)
 */
exports.createSellerReview = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { rating, comment } = req.body;
  const sellerId = req.user._id || req.user.id;

  // Validation
  if (!rating) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Rating is required",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  if (rating < 1 || rating > 5) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Rating must be between 1 and 5",
      ERROR_CODES.VALIDATION_FAILED
    );
  }

  // Check if product exists and seller owns it
  const product = await Product.findById(productId);
  if (!product) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      "Product not found",
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  // Verify product ownership
  if (product.seller.toString() !== sellerId.toString()) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.FORBIDDEN,
      "You can only review your own products",
      ERROR_CODES.INSUFFICIENT_PERMISSIONS
    );
  }

  // Get reviewer info
  const reviewerInfo = await getReviewerInfo(sellerId, "seller");

  // Check if review already exists (update if exists, don't create duplicate)
  let review = await Review.findOne({
    product: productId,
    "reviewer.userId": sellerId,
    "reviewer.role": "seller"
  });

  let isNewReview = false;
  if (review) {
    // Update existing review
    review.rating = rating;
    review.comment = comment || "";
    review.updatedAt = new Date();
    await review.save();
  } else {
    // Create new authoritative review
    isNewReview = true;
    review = new Review({
      product: productId,
      productSku: product.sku,
      seller: product.seller,
      reviewer: reviewerInfo,
      rating: rating,
      comment: comment || "",
      isAuthoritative: true,
      status: "approved"
    });
    await review.save();
  }

  // Update ratings
  const ratings = await updateRatings(productId, sellerId);

  const populated = await Review.findById(review._id)
    .populate("reviewer.userId", REVIEWER_POPULATE_SELECT)
    .lean();
  const shapedReview = shapeReviewForFrontend(populated);

  sendSuccessResponse(
    res,
    isNewReview ? HTTP_STATUS.CREATED : HTTP_STATUS.OK,
    isNewReview ? "Seller review created successfully" : "Seller review updated successfully",
    {
      review: shapedReview,
      product: {
        avgRating: ratings.product.avgRating,
        reviewCount: ratings.product.reviewCount
      }
    }
  );
});

/**
 * PUT /api/reviews/seller/:productId
 * Update seller review
 */
exports.updateSellerReview = exports.createSellerReview; // Same logic

/**
 * POST /api/reviews/admin/:productId
 * Create/update authoritative admin review (one-time, editable per SRS)
 */
exports.createAdminReview = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { rating, comment } = req.body;
  const adminId = req.user.id || req.user._id;

  // Validation
  if (!rating) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Rating is required",
      ERROR_CODES.VALIDATION_REQUIRED_FIELDS
    );
  }

  if (rating < 1 || rating > 5) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Rating must be between 1 and 5",
      ERROR_CODES.VALIDATION_FAILED
    );
  }

  // Check if product exists
  const product = await Product.findById(productId);
  if (!product) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      "Product not found",
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  // Get reviewer info
  const reviewerInfo = await getReviewerInfo(adminId, "admin");

  // Check if review already exists (update if exists, don't create duplicate)
  let review = await Review.findOne({
    product: productId,
    "reviewer.userId": adminId,
    "reviewer.role": "admin"
  });

  let isNewReview = false;
  if (review) {
    // Update existing review
    review.rating = rating;
    review.comment = comment || "";
    review.updatedAt = new Date();
    await review.save();
  } else {
    // Create new authoritative review
    isNewReview = true;
    review = new Review({
      product: productId,
      productSku: product.sku,
      seller: product.seller,
      reviewer: reviewerInfo,
      rating: rating,
      comment: comment || "",
      isAuthoritative: true,
      status: "approved"
    });
    await review.save();
  }

  // Update ratings
  const ratings = await updateRatings(productId, product.seller);

  const populated = await Review.findById(review._id)
    .populate("reviewer.userId", REVIEWER_POPULATE_SELECT)
    .lean();
  const shapedReview = shapeReviewForFrontend(populated);

  sendSuccessResponse(
    res,
    isNewReview ? HTTP_STATUS.CREATED : HTTP_STATUS.OK,
    isNewReview ? "Admin review created successfully" : "Admin review updated successfully",
    {
      review: shapedReview,
      product: {
        avgRating: ratings.product.avgRating,
        reviewCount: ratings.product.reviewCount
      }
    }
  );
});

/**
 * PUT /api/reviews/admin/:productId
 * Update admin review
 */
exports.updateAdminReview = exports.createAdminReview; // Same logic

/**
 * GET /api/reviews/product/:productId
 * Get all reviews for product (public endpoint)
 */
exports.getProductReviews = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  // Check if product exists
  const product = await Product.findById(productId);
  let productDeleted = false;

  if (!product) {
    // Product might be deleted, try to get reviews by SKU if provided
    productDeleted = true;
  }

  // Get all approved reviews for the product
  const query = product
    ? { product: productId, status: "approved" }
    : { productSku: req.query.sku, status: "approved" };

  const [reviews, total] = await Promise.all([
    Review.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("reviewer.userId", REVIEWER_POPULATE_SELECT)
      .lean(),
    Review.countDocuments(query)
  ]);

  // Shape reviews for frontend (displayName only; no email/name/personal fields)
  const shaped = reviews.map(shapeReviewForFrontend);

  // Separate authoritative and customer reviews
  const authoritative = {
    seller: shaped.find(r => r.reviewer.role === "seller" && r.isAuthoritative) || null,
    admin: shaped.find(r => r.reviewer.role === "admin" && r.isAuthoritative) || null
  };

  const customerReviews = shaped.filter(
    r => r.reviewer.role === "shopper" || (!r.isAuthoritative && r.reviewer.role !== "seller" && r.reviewer.role !== "admin")
  );

  // Calculate rating summary
  const allReviews = await Review.find(query).lean();
  const ratingBreakdown = {
    5: allReviews.filter(r => r.rating === 5).length,
    4: allReviews.filter(r => r.rating === 4).length,
    3: allReviews.filter(r => r.rating === 3).length,
    2: allReviews.filter(r => r.rating === 2).length,
    1: allReviews.filter(r => r.rating === 1).length
  };

  const avgRating = allReviews.length > 0
    ? allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length
    : 0;

  sendSuccessResponse(res, HTTP_STATUS.OK, "Reviews retrieved successfully", {
    authoritative: authoritative,
    customerReviews: customerReviews,
    summary: {
      avgRating: Math.round(avgRating * 10) / 10,
      reviewCount: allReviews.length,
      ratingBreakdown: ratingBreakdown
    },
    pagination: {
      page: page,
      limit: limit,
      total: total,
      pages: Math.ceil(total / limit)
    },
    productDeleted: productDeleted
  });
});

/**
 * GET /api/reviews/seller/:sellerId
 * Get all reviews for seller's products (for seller profile display)
 */
exports.getSellerReviews = asyncHandler(async (req, res) => {
  const { sellerId } = req.params;

  // Check if seller exists
  const seller = await Seller.findById(sellerId);
  if (!seller) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      "Seller not found",
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  // Get all approved reviews for seller's products
  const reviews = await Review.find({
    seller: sellerId,
    status: "approved"
  })
    .populate("product", "name sku mainImage")
    .populate("reviewer.userId", REVIEWER_POPULATE_SELECT)
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  // Calculate seller rating summary
  const allReviews = await Review.find({
    seller: sellerId,
    status: "approved"
  }).lean();

  const ratingBreakdown = {
    fiveStar: allReviews.filter(r => r.rating === 5).length,
    fourStar: allReviews.filter(r => r.rating === 4).length,
    threeStar: allReviews.filter(r => r.rating === 3).length,
    twoStar: allReviews.filter(r => r.rating === 2).length,
    oneStar: allReviews.filter(r => r.rating === 1).length
  };

  const avgRating = allReviews.length > 0
    ? allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length
    : 0;

  sendSuccessResponse(res, HTTP_STATUS.OK, "Seller reviews retrieved successfully", {
    seller: {
      avgRating: Math.round(avgRating * 10) / 10,
      reviewCount: allReviews.length,
      ratingBreakdown: ratingBreakdown
    },
    recentReviews: reviews.map(shapeReviewForFrontend)
  });
});

/**
 * PUT /api/reviews/:reviewId
 * Update own review (editable per SRS)
 */
exports.updateReview = asyncHandler(async (req, res) => {
  const { reviewId } = req.params;
  const { rating, comment } = req.body;
  const userId = req.user.id || req.user._id;
  const userRole = req.user.role;

  // Find review
  const review = await Review.findById(reviewId);
  if (!review) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      "Review not found",
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  // Verify ownership
  if (review.reviewer.userId.toString() !== userId.toString() || review.reviewer.role !== userRole) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.FORBIDDEN,
      "You can only update your own reviews",
      ERROR_CODES.INSUFFICIENT_PERMISSIONS
    );
  }

  // Validation
  if (rating !== undefined) {
    if (rating < 1 || rating > 5) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        "Rating must be between 1 and 5",
        ERROR_CODES.VALIDATION_FAILED
      );
    }
    review.rating = rating;
  }

  if (comment !== undefined) {
    review.comment = comment;
  }

  // AAURIKAA: shopper edits stay published when approved.
  // Admin-rejected reviews remain rejected (content safety hide).
  if (review.reviewer.role === "shopper" && review.status !== "rejected") {
    const purchaseVerification = await verifyDeliveredPurchase({
      shopperId: userId,
      productId: review.product,
    });
    if (!purchaseVerification.verifiedPurchase) {
      return sendErrorResponse(
        res,
        HTTP_STATUS.FORBIDDEN,
        "Only customers with a delivered purchase of this product can update a review",
        ERROR_CODES.BUSINESS_RULE_VIOLATION
      );
    }
    review.verifiedPurchase = true;
    review.orderId = purchaseVerification.orderId;
    review.status = "approved";
  }

  review.updatedAt = new Date();
  await review.save();

  // Recalculate ratings
  const ratings = await updateRatings(review.product, review.seller);

  const populated = await Review.findById(review._id)
    .populate("reviewer.userId", REVIEWER_POPULATE_SELECT)
    .lean();
  const shapedReview = shapeReviewForFrontend(populated);

  sendSuccessResponse(
    res,
    HTTP_STATUS.OK,
    "Review updated successfully",
    {
      review: shapedReview,
      product: {
        avgRating: ratings.product.avgRating,
        reviewCount: ratings.product.reviewCount
      }
    }
  );
});

/**
 * DELETE /api/reviews/:reviewId
 * Delete review (Shopper can delete own, Admin can delete any)
 */
exports.deleteReview = asyncHandler(async (req, res) => {
  const { reviewId } = req.params;
  const userId = req.user.id || req.user._id;
  const userRole = req.user.role;

  // Find review
  const review = await Review.findById(reviewId);
  if (!review) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.NOT_FOUND,
      "Review not found",
      ERROR_CODES.RESOURCE_NOT_FOUND
    );
  }

  // Check permissions
  const isOwner = review.reviewer.userId.toString() === userId.toString() && review.reviewer.role === userRole;
  const isAdmin = userRole === "admin";

  if (!isOwner && !isAdmin) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.FORBIDDEN,
      "You don't have permission to delete this review",
      ERROR_CODES.INSUFFICIENT_PERMISSIONS
    );
  }

  // Seller/Admin authoritative reviews cannot be deleted (only updated)
  if (review.isAuthoritative && (review.reviewer.role === "seller" || review.reviewer.role === "admin")) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Authoritative reviews cannot be deleted. You can only update them.",
      ERROR_CODES.OPERATION_NOT_ALLOWED
    );
  }

  const productId = review.product;
  const sellerId = review.seller;

  // Delete review
  await Review.findByIdAndDelete(reviewId);

  // Recalculate ratings
  await updateRatings(productId, sellerId);

  sendSuccessResponse(res, HTTP_STATUS.OK, "Review deleted successfully");
});

/**
 * DELETE /api/reviews/:reviewId (Admin only)
 * Admin can delete any review
 */
exports.deleteAnyReview = exports.deleteReview; // Same logic, middleware handles admin check

/**
 * GET /api/reviews/me
 * Get current user's reviews
 */
exports.getMyReviews = asyncHandler(async (req, res) => {
  const userId = req.user.id || req.user._id;
  const userRole = req.user.role;

  const reviews = await Review.find({
    "reviewer.userId": userId,
    "reviewer.role": userRole
  })
    .populate("product", "name sku mainImage")
    .populate("reviewer.userId", REVIEWER_POPULATE_SELECT)
    .sort({ createdAt: -1 })
    .lean();

  sendSuccessResponse(res, HTTP_STATUS.OK, "Your reviews retrieved successfully", {
    reviews: reviews.map(shapeReviewForFrontend)
  });
});

/* ============================================================================
 *                   Admin Moderation Handlers (Phase 5 + 7)
 * ==========================================================================*/

const ADMIN_LIST_VALID_STATUSES = ["pending", "approved", "rejected", "all"];
const ADMIN_LIST_VALID_SORT_FIELDS = new Set([
  "createdAt",
  "updatedAt",
  "rating",
  "moderatedAt"
]);
const ADMIN_LIST_DEFAULT_LIMIT = 20;
const ADMIN_LIST_MAX_LIMIT = 100;

const MODERATOR_POPULATE_SELECT = "username email";

/**
 * Convert ModerationError into a structured HTTP response.
 */
function handleModerationError(res, err) {
  let code = ERROR_CODES.BUSINESS_RULE_VIOLATION;
  if (err.code === "REVIEW_NOT_FOUND") {
    code = ERROR_CODES.RESOURCE_NOT_FOUND;
  } else if (err.code === "INVALID_INPUT") {
    code = ERROR_CODES.VALIDATION_FAILED;
  }
  return sendErrorResponse(res, err.statusCode || 400, err.message, code);
}

/**
 * GET /api/reviews/admin
 * Admin moderation queue with filters, pagination, and per-status counts.
 *
 * Query params:
 *   status     - pending|approved|rejected|all (default: pending)
 *   productId  - filter by product (ObjectId)
 *   sellerId   - filter by seller (ObjectId)
 *   from       - ISO date (createdAt >= from)
 *   to         - ISO date (createdAt <= to)
 *   sortBy     - createdAt|updatedAt|rating|moderatedAt (default: createdAt)
 *   sortOrder  - asc|desc (default: desc)
 *   page       - integer >= 1 (default: 1)
 *   limit      - integer 1..100 (default: 20)
 *
 * Counts are computed against the same filters EXCEPT status, so the
 * pending/approved/rejected counters stay consistent across status tabs.
 */
exports.listReviewsForAdmin = asyncHandler(async (req, res) => {
  const {
    status = "pending",
    productId,
    sellerId,
    from,
    to,
    sortBy = "createdAt",
    sortOrder = "desc"
  } = req.query;

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const rawLimit = parseInt(req.query.limit, 10) || ADMIN_LIST_DEFAULT_LIMIT;
  const limit = Math.min(ADMIN_LIST_MAX_LIMIT, Math.max(1, rawLimit));
  const skip = (page - 1) * limit;

  if (!ADMIN_LIST_VALID_STATUSES.includes(status)) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      `Invalid status filter. Allowed: ${ADMIN_LIST_VALID_STATUSES.join(", ")}`,
      ERROR_CODES.VALIDATION_FAILED
    );
  }

  if (productId && !mongoose.isValidObjectId(productId)) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Invalid productId",
      ERROR_CODES.VALIDATION_FAILED
    );
  }

  if (sellerId && !mongoose.isValidObjectId(sellerId)) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Invalid sellerId",
      ERROR_CODES.VALIDATION_FAILED
    );
  }

  const sortField = ADMIN_LIST_VALID_SORT_FIELDS.has(sortBy) ? sortBy : "createdAt";
  const sortDirection = sortOrder === "asc" ? 1 : -1;

  // Base query shared with counts (excludes status so counts stay stable across status tabs).
  // Governance: the moderation queue is shopper-only. Authoritative seller/admin
  // reviews are auto-approved at creation and never enter moderation.
  const baseQuery = { "reviewer.role": "shopper" };
  if (productId) baseQuery.product = productId;
  if (sellerId) baseQuery.seller = sellerId;

  const dateFilter = {};
  if (from) {
    const fromDate = new Date(from);
    if (!Number.isNaN(fromDate.getTime())) dateFilter.$gte = fromDate;
  }
  if (to) {
    const toDate = new Date(to);
    if (!Number.isNaN(toDate.getTime())) dateFilter.$lte = toDate;
  }
  if (Object.keys(dateFilter).length > 0) {
    baseQuery.createdAt = dateFilter;
  }

  // List query layers status on top of baseQuery.
  const listQuery = { ...baseQuery };
  if (status !== "all") listQuery.status = status;

  const [reviews, total, countsAgg] = await Promise.all([
    Review.find(listQuery)
      .sort({ [sortField]: sortDirection })
      .skip(skip)
      .limit(limit)
      .populate("product", "name sku slug mainImage")
      .populate("seller", "shopName")
      .populate("reviewer.userId", REVIEWER_POPULATE_SELECT)
      .populate("moderatedBy", MODERATOR_POPULATE_SELECT)
      .lean(),
    Review.countDocuments(listQuery),
    Review.aggregate([
      { $match: baseQuery },
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ])
  ]);

  const counts = { pending: 0, approved: 0, rejected: 0, total: 0 };
  countsAgg.forEach((row) => {
    if (row._id && counts[row._id] !== undefined) {
      counts[row._id] = row.count;
    }
    counts.total += row.count;
  });

  sendSuccessResponse(res, HTTP_STATUS.OK, "Reviews retrieved successfully", {
    reviews,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit))
    },
    counts,
    filters: {
      status,
      productId: productId || null,
      sellerId: sellerId || null,
      from: from || null,
      to: to || null,
      sortBy: sortField,
      sortOrder: sortDirection === 1 ? "asc" : "desc"
    }
  });
});

/**
 * PATCH /api/reviews/admin/:id/approve
 * Transitions a review to status=approved and recomputes aggregates.
 */
exports.adminApproveReview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const adminId = req.user.id || req.user._id;

  if (!mongoose.isValidObjectId(id)) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Invalid review id",
      ERROR_CODES.VALIDATION_FAILED
    );
  }

  try {
    const review = await approveReviewService(id, adminId);
    const populated = await Review.findById(review._id)
      .populate("product", "name sku slug mainImage")
      .populate("seller", "shopName")
      .populate("reviewer.userId", REVIEWER_POPULATE_SELECT)
      .populate("moderatedBy", MODERATOR_POPULATE_SELECT)
      .lean();

    return sendSuccessResponse(res, HTTP_STATUS.OK, "Review approved successfully", {
      review: populated
    });
  } catch (err) {
    if (err instanceof ModerationError) {
      return handleModerationError(res, err);
    }
    throw err;
  }
});

/**
 * PATCH /api/reviews/admin/:id/reject
 * Transitions a review to status=rejected and recomputes aggregates.
 * Body: { rejectionReason?: string (max 500) }
 */
exports.adminRejectReview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const adminId = req.user.id || req.user._id;
  const { rejectionReason } = req.body || {};

  if (!mongoose.isValidObjectId(id)) {
    return sendErrorResponse(
      res,
      HTTP_STATUS.BAD_REQUEST,
      "Invalid review id",
      ERROR_CODES.VALIDATION_FAILED
    );
  }

  try {
    const review = await rejectReviewService(id, adminId, rejectionReason);
    const populated = await Review.findById(review._id)
      .populate("product", "name sku slug mainImage")
      .populate("seller", "shopName")
      .populate("reviewer.userId", REVIEWER_POPULATE_SELECT)
      .populate("moderatedBy", MODERATOR_POPULATE_SELECT)
      .lean();

    return sendSuccessResponse(res, HTTP_STATUS.OK, "Review rejected successfully", {
      review: populated
    });
  } catch (err) {
    if (err instanceof ModerationError) {
      return handleModerationError(res, err);
    }
    throw err;
  }
});

