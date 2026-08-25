import { apiRequest, unwrapData } from "./client";

export type AdminReviewStatus = "pending" | "approved" | "rejected" | "all";

export type AdminReview = {
  id: string;
  rating: number;
  comment: string;
  status: string;
  verifiedPurchase?: boolean;
  createdAt?: string;
  product?: {
    id?: string;
    name?: string;
    sku?: string;
    slug?: string;
  };
  reviewer?: {
    role?: string;
    displayName?: string;
    name?: string;
  };
};

export type AdminReviewsListResult = {
  reviews: AdminReview[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  counts: {
    pending: number;
    approved: number;
    rejected: number;
    total: number;
  };
};

export type AdminReviewsListParams = {
  status?: AdminReviewStatus;
  productId?: string;
  from?: string;
  to?: string;
  sortBy?: "createdAt" | "updatedAt" | "rating" | "moderatedAt";
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
};

function idOf(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string" || typeof raw === "number") return String(raw);
  if (typeof raw === "object" && raw !== null && "_id" in raw) {
    return String((raw as { _id: unknown })._id ?? "");
  }
  return "";
}

function mapAdminReview(raw: unknown): AdminReview | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const id = idOf(rec._id ?? rec.id);
  const rating = Number(rec.rating);
  if (!id || !Number.isFinite(rating)) return null;

  const productRaw =
    rec.product && typeof rec.product === "object"
      ? (rec.product as Record<string, unknown>)
      : null;
  const reviewerRaw =
    rec.reviewer && typeof rec.reviewer === "object"
      ? (rec.reviewer as Record<string, unknown>)
      : null;
  const userId =
    reviewerRaw?.userId && typeof reviewerRaw.userId === "object"
      ? (reviewerRaw.userId as Record<string, unknown>)
      : null;

  const displayName =
    (reviewerRaw?.displayName != null
      ? String(reviewerRaw.displayName)
      : undefined) ||
    (userId?.username != null ? String(userId.username) : undefined) ||
    (reviewerRaw?.name != null ? String(reviewerRaw.name) : undefined);

  return {
    id,
    rating: Math.min(5, Math.max(1, Math.round(rating))),
    comment: String(rec.comment ?? "").trim(),
    status: String(rec.status ?? ""),
    verifiedPurchase: Boolean(rec.verifiedPurchase),
    createdAt: rec.createdAt ? String(rec.createdAt) : undefined,
    product: productRaw
      ? {
          id: idOf(productRaw._id ?? productRaw.id) || undefined,
          name: productRaw.name != null ? String(productRaw.name) : undefined,
          sku: productRaw.sku != null ? String(productRaw.sku) : undefined,
          slug: productRaw.slug != null ? String(productRaw.slug) : undefined,
        }
      : undefined,
    reviewer: {
      role: reviewerRaw?.role != null ? String(reviewerRaw.role) : undefined,
      displayName,
      name: reviewerRaw?.name != null ? String(reviewerRaw.name) : undefined,
    },
  };
}

function buildQuery(params: AdminReviewsListParams): string {
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.productId?.trim()) q.set("productId", params.productId.trim());
  if (params.from?.trim()) q.set("from", params.from.trim());
  if (params.to?.trim()) q.set("to", params.to.trim());
  if (params.sortBy) q.set("sortBy", params.sortBy);
  if (params.sortOrder) q.set("sortOrder", params.sortOrder);
  if (params.page != null) q.set("page", String(params.page));
  if (params.limit != null) q.set("limit", String(params.limit));
  const s = q.toString();
  return s ? `?${s}` : "";
}

/**
 * GET /api/reviews/admin — shopper reviews for content safety (default: published).
 * AAURIKAA: shopper content only; no marketplace seller score UI.
 */
export async function fetchAdminReviews(
  params: AdminReviewsListParams = {},
): Promise<AdminReviewsListResult> {
  const response = await apiRequest<{
    data?: {
      reviews?: unknown[];
      pagination?: AdminReviewsListResult["pagination"];
      counts?: AdminReviewsListResult["counts"];
    };
    reviews?: unknown[];
    pagination?: AdminReviewsListResult["pagination"];
    counts?: AdminReviewsListResult["counts"];
  }>(`/api/reviews/admin${buildQuery(params)}`);

  const data = unwrapData(response);
  const listRaw = Array.isArray(data?.reviews)
    ? data.reviews
    : Array.isArray(response.reviews)
      ? response.reviews
      : [];
  const reviews = listRaw
    .map(mapAdminReview)
    .filter((item): item is AdminReview => Boolean(item));

  return {
    reviews,
    pagination: data?.pagination ??
      response.pagination ?? {
        page: params.page ?? 1,
        limit: params.limit ?? 20,
        total: reviews.length,
        pages: 1,
      },
    counts: data?.counts ??
      response.counts ?? {
        pending: 0,
        approved: 0,
        rejected: 0,
        total: reviews.length,
      },
  };
}

/** PATCH /api/reviews/admin/:id/reject — hide review + re-aggregate. */
export async function rejectAdminReview(
  reviewId: string,
  rejectionReason?: string,
): Promise<void> {
  await apiRequest(`/api/reviews/admin/${encodeURIComponent(reviewId)}/reject`, {
    method: "PATCH",
    body: rejectionReason?.trim()
      ? { rejectionReason: rejectionReason.trim() }
      : {},
  });
}

/** DELETE /api/reviews/admin/:reviewId — delete + re-aggregate. */
export async function deleteAdminReview(reviewId: string): Promise<void> {
  await apiRequest(`/api/reviews/admin/${encodeURIComponent(reviewId)}`, {
    method: "DELETE",
  });
}
