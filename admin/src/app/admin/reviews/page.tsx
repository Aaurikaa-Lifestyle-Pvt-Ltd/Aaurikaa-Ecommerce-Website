"use client";

import { useMemo, useState } from "react";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  PageHeader,
  Select,
} from "@/components/ui";
import {
  deleteAdminReview,
  fetchAdminReviews,
  rejectAdminReview,
  type AdminReview,
} from "@/lib/api/reviews";
import { toast, toastMessageFromUnknown } from "@/lib/toast";
import { useAdminResource } from "@/lib/use-admin-resource";

function formatDate(value?: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function StarRow({ value }: { value: number }) {
  const r = Math.max(0, Math.min(5, Math.round(value) || 0));
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${r} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={i <= r ? "text-foreground" : "text-muted-foreground/35"}
          aria-hidden
        >
          ★
        </span>
      ))}
    </span>
  );
}

export default function ReviewsSafetyPage() {
  const [productId, setProductId] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [ratingFilter, setRatingFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);

  const query = useAdminResource(
    () =>
      fetchAdminReviews({
        status: "approved",
        productId: productId.trim() || undefined,
        from: from || undefined,
        to: to || undefined,
        sortBy: "createdAt",
        sortOrder: "desc",
        page,
        limit: 20,
      }),
    [productId, from, to, page],
  );

  const reviews = useMemo(() => {
    const list = query.data?.reviews ?? [];
    const q = productQuery.trim().toLowerCase();
    return list.filter((review) => {
      if (ratingFilter !== "all" && review.rating !== Number(ratingFilter)) {
        return false;
      }
      if (!q) return true;
      const hay = [
        review.product?.name,
        review.product?.sku,
        review.product?.slug,
        review.product?.id,
        review.comment,
        review.reviewer?.displayName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [query.data?.reviews, productQuery, ratingFilter]);

  const pagination = query.data?.pagination;

  async function hideReview(review: AdminReview) {
    if (
      !window.confirm(
        "Hide this review from the storefront? Product ratings will be recalculated.",
      )
    ) {
      return;
    }
    setBusyId(review.id);
    try {
      await rejectAdminReview(review.id, "Removed as inappropriate content");
      toast.success("Review hidden");
      await query.reload();
    } catch (err: unknown) {
      toast.error(toastMessageFromUnknown(err, "Unable to hide this review."));
    } finally {
      setBusyId(null);
    }
  }

  async function removeReview(review: AdminReview) {
    if (
      !window.confirm(
        "Permanently delete this review? This cannot be undone. Ratings will be recalculated.",
      )
    ) {
      return;
    }
    setBusyId(review.id);
    try {
      await deleteAdminReview(review.id);
      toast.success("Review deleted");
      await query.reload();
    } catch (err: unknown) {
      toast.error(toastMessageFromUnknown(err, "Unable to delete this review."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Reviews"
        description="Remove inappropriate customer reviews from the storefront. Published reviews only — this is a content-safety console, not a pending-review workflow."
      />

      <Card className="mb-4 space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Product ID" htmlFor="productId">
            <Input
              id="productId"
              value={productId}
              onChange={(e) => {
                setPage(1);
                setProductId(e.target.value);
              }}
              placeholder="Filter by product ObjectId"
            />
          </Field>
          <Field label="Search" htmlFor="productQuery">
            <Input
              id="productQuery"
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
              placeholder="Name, SKU, comment…"
            />
          </Field>
          <Field label="From" htmlFor="from">
            <Input
              id="from"
              type="date"
              value={from}
              onChange={(e) => {
                setPage(1);
                setFrom(e.target.value);
              }}
            />
          </Field>
          <Field label="To" htmlFor="to">
            <Input
              id="to"
              type="date"
              value={to}
              onChange={(e) => {
                setPage(1);
                setTo(e.target.value);
              }}
            />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:max-w-sm">
          <Field label="Rating" htmlFor="rating">
            <Select
              id="rating"
              value={ratingFilter}
              onChange={(e) => setRatingFilter(e.target.value)}
            >
              <option value="all">All ratings</option>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={String(n)}>
                  {n} stars
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">
          Showing published customer reviews. Use Hide to remove inappropriate
          content from the storefront, or Delete to remove permanently.
        </p>
      </Card>

      {query.loading ? (
        <Card>
          <LoadingState message="Loading published reviews…" />
        </Card>
      ) : query.error ? (
        <Card>
          <ErrorState message={query.error} onRetry={() => void query.reload()} />
        </Card>
      ) : reviews.length === 0 ? (
        <Card>
          <EmptyState message="No published reviews match these filters." />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {reviews.map((review) => (
              <li key={review.id} className="space-y-3 px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">
                      {review.product?.name || "Product"}
                      {review.product?.sku ? (
                        <span className="ml-2 text-sm font-normal text-muted-foreground">
                          {review.product.sku}
                        </span>
                      ) : null}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <StarRow value={review.rating} />
                      <span>
                        {review.reviewer?.displayName ||
                          review.reviewer?.name ||
                          "Customer"}
                      </span>
                      {review.verifiedPurchase ? (
                        <span className="rounded-[var(--radius-sm)] border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                          Verified purchase
                        </span>
                      ) : null}
                      <span>{formatDate(review.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={busyId === review.id}
                      onClick={() => void hideReview(review)}
                    >
                      {busyId === review.id ? "Working…" : "Hide"}
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={busyId === review.id}
                      onClick={() => void removeReview(review)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
                {review.comment ? (
                  <p className="text-sm leading-relaxed text-foreground/90">
                    {review.comment}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">No comment</p>
                )}
              </li>
            ))}
          </ul>
          {pagination && pagination.pages > 1 ? (
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                Page {pagination.page} of {pagination.pages}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={page >= pagination.pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}
