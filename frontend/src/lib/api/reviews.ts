import { apiRequest, unwrapData } from "./client";
import { idString } from "../mappers/media";

export type ProductReview = {
  id: string;
  rating: number;
  comment: string;
  createdAt?: string;
  verifiedPurchase?: boolean;
  reviewer: {
    role?: string;
    displayName?: string;
  };
};

export type ReviewSummary = {
  avgRating: number;
  reviewCount: number;
  ratingBreakdown: Record<string, number>;
};

export type ProductReviewsPayload = {
  customerReviews: ProductReview[];
  summary: ReviewSummary;
};

type ReviewsEnvelope = {
  data?: {
    customerReviews?: unknown[];
    summary?: {
      avgRating?: number;
      reviewCount?: number;
      ratingBreakdown?: Record<string, number>;
    };
  };
  customerReviews?: unknown[];
  summary?: {
    avgRating?: number;
    reviewCount?: number;
    ratingBreakdown?: Record<string, number>;
  };
};

/** Seller-role reviews must never surface on the customer PDP list. */
export function isSellerRoleReview(review: {
  reviewer?: { role?: string | null } | null;
}): boolean {
  return String(review.reviewer?.role ?? "").toLowerCase() === "seller";
}

export function filterCustomerFacingReviews<
  T extends { reviewer?: { role?: string | null } | null },
>(reviews: T[]): T[] {
  return reviews.filter((review) => !isSellerRoleReview(review));
}

function mapReview(raw: unknown): ProductReview | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const id = idString(rec._id ?? rec.id);
  const rating = Number(rec.rating);
  if (!id || !Number.isFinite(rating)) return null;
  const reviewerRaw =
    rec.reviewer && typeof rec.reviewer === "object"
      ? (rec.reviewer as Record<string, unknown>)
      : {};
  return {
    id,
    rating: Math.min(5, Math.max(1, Math.round(rating))),
    comment: String(rec.comment ?? "").trim(),
    createdAt: rec.createdAt ? String(rec.createdAt) : undefined,
    verifiedPurchase: Boolean(rec.verifiedPurchase),
    reviewer: {
      role: reviewerRaw.role ? String(reviewerRaw.role) : undefined,
      displayName: reviewerRaw.displayName
        ? String(reviewerRaw.displayName)
        : undefined,
    },
  };
}

function mapSummary(raw: ReviewsEnvelope["summary"] | undefined): ReviewSummary {
  const breakdown = raw?.ratingBreakdown ?? {};
  return {
    avgRating: Number(raw?.avgRating) || 0,
    reviewCount: Number(raw?.reviewCount) || 0,
    ratingBreakdown: {
      "5": Number(breakdown["5"] ?? breakdown[5 as unknown as string] ?? 0) || 0,
      "4": Number(breakdown["4"] ?? breakdown[4 as unknown as string] ?? 0) || 0,
      "3": Number(breakdown["3"] ?? breakdown[3 as unknown as string] ?? 0) || 0,
      "2": Number(breakdown["2"] ?? breakdown[2 as unknown as string] ?? 0) || 0,
      "1": Number(breakdown["1"] ?? breakdown[1 as unknown as string] ?? 0) || 0,
    },
  };
}

/**
 * GET /api/reviews/product/:productId — public approved reviews + summary.
 * Summary fields are authoritative — never average the visible list client-side as SoT.
 */
export async function fetchProductReviews(
  productId: string,
): Promise<ProductReviewsPayload> {
  const response = await apiRequest<ReviewsEnvelope>(
    `/api/reviews/product/${encodeURIComponent(productId)}`,
    { auth: false },
  );
  const data = unwrapData(response);
  const listRaw = Array.isArray(data?.customerReviews)
    ? data.customerReviews
    : Array.isArray(response.customerReviews)
      ? response.customerReviews
      : [];
  const mapped = listRaw
    .map(mapReview)
    .filter((item): item is ProductReview => Boolean(item));
  const customerReviews = filterCustomerFacingReviews(mapped);
  const summary = mapSummary(data?.summary ?? response.summary);
  return { customerReviews, summary };
}

/** POST /api/reviews — eligible delivered purchaser → approved + verifiedPurchase. */
export type CreateCustomerReviewInput = {
  productId: string;
  rating: number;
  comment?: string;
  /** Optional order context — backend uses it to verify delivered purchase. */
  orderId?: string;
};

export type CreateCustomerReviewResult = {
  review?: {
    _id?: string;
    id?: string;
    status?: string;
    rating?: number;
    verifiedPurchase?: boolean;
  };
  product?: { avgRating?: number; reviewCount?: number };
};

export function buildCustomerReviewPayload(input: CreateCustomerReviewInput): {
  productId: string;
  rating: number;
  comment: string;
  orderId?: string;
} {
  const payload: {
    productId: string;
    rating: number;
    comment: string;
    orderId?: string;
  } = {
    productId: input.productId,
    rating: input.rating,
    comment: input.comment?.trim() ? input.comment.trim() : "",
  };
  if (input.orderId?.trim()) {
    payload.orderId = input.orderId.trim();
  }
  return payload;
}

function mapCreateResult(raw: unknown): CreateCustomerReviewResult {
  if (!raw || typeof raw !== "object") return {};
  const rec = raw as Record<string, unknown>;
  const reviewRaw =
    rec.review && typeof rec.review === "object"
      ? (rec.review as Record<string, unknown>)
      : undefined;
  const productRaw =
    rec.product && typeof rec.product === "object"
      ? (rec.product as Record<string, unknown>)
      : undefined;
  return {
    ...(reviewRaw
      ? {
          review: {
            _id: reviewRaw._id != null ? String(reviewRaw._id) : undefined,
            id: reviewRaw.id != null ? String(reviewRaw.id) : undefined,
            status: reviewRaw.status != null ? String(reviewRaw.status) : undefined,
            rating:
              reviewRaw.rating != null && Number.isFinite(Number(reviewRaw.rating))
                ? Number(reviewRaw.rating)
                : undefined,
            verifiedPurchase: Boolean(reviewRaw.verifiedPurchase),
          },
        }
      : {}),
    ...(productRaw
      ? {
          product: {
            avgRating:
              productRaw.avgRating != null &&
              Number.isFinite(Number(productRaw.avgRating))
                ? Number(productRaw.avgRating)
                : undefined,
            reviewCount:
              productRaw.reviewCount != null &&
              Number.isFinite(Number(productRaw.reviewCount))
                ? Number(productRaw.reviewCount)
                : undefined,
          },
        }
      : {}),
  };
}

export async function createCustomerReview(
  input: CreateCustomerReviewInput,
): Promise<CreateCustomerReviewResult> {
  const response = await apiRequest<{ data?: CreateCustomerReviewResult } & CreateCustomerReviewResult>(
    "/api/reviews",
    {
      method: "POST",
      auth: true,
      body: buildCustomerReviewPayload(input),
    },
  );
  return mapCreateResult(unwrapData(response));
}

/** Alias used by order-detail review submit (same POST /api/reviews). */
export const createProductReview = createCustomerReview;
