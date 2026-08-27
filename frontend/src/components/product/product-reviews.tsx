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
import { IconArrowRight } from "@/components/ui/icons";

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
      className={cn("border-t border-border/80 pt-12 sm:pt-16", className)}
      aria-labelledby="product-reviews-heading"
      data-reviews-reload="ready"
    >
      <div className="mb-8 sm:mb-12">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
          Ratings & Reviews
        </p>
        <h2
          id="product-reviews-heading"
          className="mt-1 font-serif text-2xl tracking-tight text-foreground sm:text-3xl"
        >
          Customer Reviews
        </h2>
        <p className="mt-1.5 text-xs text-muted-foreground sm:text-sm">
          Authentic feedback from verified customers who purchased this piece.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start xl:grid-cols-[380px_minmax(0,1fr)] xl:gap-12">
        {/* Rating Summary Card */}
        <div className="rounded-2xl border border-border/80 bg-[#faf8f4]/90 p-6 sm:p-7 shadow-xs">
          <div className="flex flex-col items-start gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Overall Rating
            </span>
            <div className="flex items-baseline gap-3">
              <span className="font-serif text-5xl font-semibold tracking-tight text-foreground sm:text-6xl">
                {avg > 0 ? avg.toFixed(1) : "0.0"}
              </span>
              <div className="space-y-1">
                <StarDisplay rating={avg} size="lg" />
                <p className="text-xs text-muted-foreground font-medium">
                  {count > 0
                    ? `Based on ${count} ${count === 1 ? "review" : "reviews"}`
                    : "No reviews yet"}
                </p>
              </div>
            </div>
          </div>

          {/* Rating Distribution Bars */}
          {summary ? (
            <ul className="mt-6 space-y-2.5 border-t border-border/70 pt-6">
              {([5, 4, 3, 2, 1] as const).map((star) => {
                const n = Number(summary.ratingBreakdown[String(star)] ?? 0) || 0;
                const pct = count > 0 ? Math.round((n / count) * 100) : 0;
                return (
                  <li key={star} className="flex items-center gap-2.5 text-xs text-muted-foreground">
                    <span className="w-6 font-medium tabular-nums text-foreground">
                      {star}★
                    </span>
                    <span
                      className="h-2 flex-1 overflow-hidden rounded-full bg-[#ebe5db]"
                      aria-hidden
                    >
                      <span
                        className="block h-full rounded-full bg-accent transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    <span className="w-8 text-right tabular-nums font-medium text-muted-foreground">
                      {n}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {/* Write a Review Section */}
          <div className="mt-6 border-t border-border/70 pt-5">
            <p className="text-xs font-medium text-foreground">
              Purchased this jewellery piece?
            </p>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              You can submit your review and rating directly from your order details after your order is delivered.
            </p>
            <Link
              href="/account/orders"
              className="mt-3.5 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-4 py-2.5 text-xs font-medium text-foreground shadow-xs transition-colors hover:bg-muted"
            >
              View your orders to review
              <IconArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            </Link>
          </div>
        </div>

        {/* Individual Reviews List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-border/70 pb-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">
              Customer Feedback ({reviews.length})
            </h3>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status">
              <Spinner /> Loading customer reviews…
            </div>
          ) : reviews.length === 0 ? (
            <div className="rounded-2xl border border-border/80 bg-surface p-8 text-center shadow-xs sm:p-10">
              <p className="font-serif text-lg text-foreground">
                No customer reviews yet
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground max-w-md mx-auto">
                {loadFailed
                  ? "Reviews could not be loaded right now. Please refresh or try again later."
                  : "Be the first to share your experience once your order arrives."}
              </p>
            </div>
          ) : (
            <ul className="space-y-3.5">
              {reviews.map((review) => {
                const when = formatReviewDate(review.createdAt);
                const initial = (review.reviewer.displayName || "C").charAt(0).toUpperCase();
                return (
                  <li
                    key={review.id}
                    className="rounded-2xl border border-border/80 bg-surface p-5 sm:p-6 shadow-xs space-y-3 transition-shadow hover:shadow-card"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f4efe6] font-serif text-xs font-semibold text-accent">
                          {initial}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {review.reviewer.displayName || "Customer"}
                          </p>
                          {when ? (
                            <p className="text-[11px] text-muted-foreground">{when}</p>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5">
                        {review.verifiedPurchase ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-800">
                            <svg
                              className="h-3 w-3"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2.5}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                            Verified purchase
                          </span>
                        ) : null}
                        <StarDisplay rating={review.rating} size="sm" />
                      </div>
                    </div>

                    {review.comment ? (
                      <p className="text-sm leading-relaxed text-foreground/90 pl-12">
                        {review.comment}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

