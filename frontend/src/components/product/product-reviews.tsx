"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  fetchProductReviews,
  type ProductReview,
  type ReviewSummary,
} from "@/lib/api/reviews";
import { cn } from "@/lib/cn";
import { StarDisplay } from "@/components/ui/star-rating";
import { Spinner } from "@/components/ui/spinner";

type ProductReviewsProps = {
  productId: string;
  className?: string;
  /**
   * Optional seed from catalogue `avgRating`/`reviewCount` for first paint.
   * Replaced by GET /api/reviews/product/:id summary after load — never averaged from the list.
   */
  catalogueAvgRating?: number;
  catalogueReviewCount?: number;
};

function formatReviewDate(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * PDP reviews display only — submission lives on order detail.
 * Summary comes from the reviews API (or catalogue seed until loaded).
 */
export function ProductReviews({
  productId,
  className,
  catalogueAvgRating,
  catalogueReviewCount,
}: ProductReviewsProps) {
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [summary, setSummary] = useState<ReviewSummary | null>(
    catalogueAvgRating != null || catalogueReviewCount != null
      ? {
          avgRating: catalogueAvgRating ?? 0,
          reviewCount: catalogueReviewCount ?? 0,
          ratingBreakdown: { "5": 0, "4": 0, "3": 0, "2": 0, "1": 0 },
        }
      : null,
  );
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const reload = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    setLoadFailed(false);
    try {
      const payload = await fetchProductReviews(productId);
      setReviews(payload.customerReviews);
      // Authoritative summary from API — never derive from visible list.
      setSummary(payload.summary);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const count = summary?.reviewCount ?? 0;
  const avg = summary?.avgRating ?? 0;

  return (
    <section
      className={cn("border-t border-border pt-10", className)}
      aria-labelledby="product-reviews-heading"
      data-reviews-reload="ready"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            id="product-reviews-heading"
            className="font-serif text-xl tracking-tight sm:text-2xl"
          >
            Customer reviews
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Reviews from customers who purchased this piece. You can leave a review
            from your order details after delivery.
          </p>
        </div>
        {count > 0 ? (
          <div className="flex flex-col items-end gap-1">
            <StarDisplay rating={avg} size="md" showValue />
            <p className="text-sm text-muted-foreground">
              {count} {count === 1 ? "review" : "reviews"}
            </p>
          </div>
        ) : null}
      </div>

      {summary && count > 0 ? (
        <ul className="mt-6 grid gap-1.5 text-xs text-muted-foreground sm:max-w-xs">
          {([5, 4, 3, 2, 1] as const).map((star) => {
            const n = Number(summary.ratingBreakdown[String(star)] ?? 0) || 0;
            return (
              <li key={star} className="flex items-center gap-2">
                <span className="w-6 tabular-nums">{star}★</span>
                <span
                  className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                  aria-hidden
                >
                  <span
                    className="block h-full bg-foreground/70"
                    style={{
                      width: count > 0 ? `${Math.round((n / count) * 100)}%` : "0%",
                    }}
                  />
                </span>
                <span className="w-6 text-right tabular-nums">{n}</span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {loading ? (
        <p className="mt-8 flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Spinner /> Loading reviews…
        </p>
      ) : reviews.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground" role="status">
          No customer reviews yet.
          {loadFailed
            ? " Reviews could not be loaded right now."
            : " Check back later, or share feedback from your order once it is delivered."}
        </p>
      ) : (
        <ul className="mt-8 space-y-6">
          {reviews.map((review) => {
            const when = formatReviewDate(review.createdAt);
            return (
              <li key={review.id} className="border-b border-border pb-6 last:border-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <StarDisplay rating={review.rating} size="sm" />
                  <p className="text-sm text-foreground">
                    {review.reviewer.displayName || "Customer"}
                  </p>
                  {review.verifiedPurchase ? (
                    <span className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Verified purchase
                    </span>
                  ) : null}
                  {when ? (
                    <p className="text-xs text-muted-foreground">{when}</p>
                  ) : null}
                </div>
                {review.comment ? (
                  <p className="mt-2 text-sm leading-relaxed text-foreground/90">
                    {review.comment}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-8 text-xs text-muted-foreground">
        Looking for an order?{" "}
        <Link
          href="/account/orders"
          className="underline-offset-4 hover:text-foreground hover:underline"
        >
          View your orders
        </Link>{" "}
        to leave a review when eligible.
      </p>
    </section>
  );
}
