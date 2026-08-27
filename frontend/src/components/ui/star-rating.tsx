"use client";

import { cn } from "@/lib/cn";

const SIZE_CLASS = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-xl",
} as const;

export type StarSize = keyof typeof SIZE_CLASS;

type StarDisplayProps = {
  /** Authoritative rating value (0–5). Partial stars use floor for filled count. */
  rating: number;
  max?: number;
  size?: StarSize;
  showValue?: boolean;
  className?: string;
  /** Accessible label; defaults to "Rating x out of 5". */
  label?: string;
};

/**
 * Read-only star row for catalogue cards, PDP summary, and review lists.
 * Does not compute averages — callers pass API/`avgRating` values.
 */
export function StarDisplay({
  rating,
  max = 5,
  size = "md",
  showValue = false,
  className,
  label,
}: StarDisplayProps) {
  const safeMax = Math.max(1, Math.floor(max));
  const clamped = Number.isFinite(rating)
    ? Math.min(safeMax, Math.max(0, rating))
    : 0;
  const filled = Math.floor(clamped);
  const aria =
    label ??
    (clamped > 0
      ? `Rating ${clamped.toFixed(1)} out of ${safeMax}`
      : `No rating`);

  return (
    <span
      className={cn("inline-flex items-center gap-1", className)}
      role="img"
      aria-label={aria}
    >
      <span className={cn("inline-flex leading-none", SIZE_CLASS[size])} aria-hidden>
        {Array.from({ length: safeMax }, (_, index) => {
          const starValue = index + 1;
          const on = starValue <= filled;
          return (
            <span
              key={starValue}
              className={on ? "text-accent" : "text-border/70"}
            >
              ★
            </span>
          );
        })}
      </span>
      {showValue && clamped > 0 ? (
        <span className="text-xs tabular-nums text-muted-foreground">
          {clamped.toFixed(1)}
        </span>
      ) : null}
    </span>
  );
}

type StarRatingInputProps = {
  value: number;
  onChange: (rating: number) => void;
  max?: number;
  size?: StarSize;
  disabled?: boolean;
  className?: string;
  name?: string;
};

/**
 * Interactive 1–5 star picker (no dropdown). Used on eligibility-gated review submit.
 */
export function StarRatingInput({
  value,
  onChange,
  max = 5,
  size = "lg",
  disabled = false,
  className,
  name = "rating",
}: StarRatingInputProps) {
  const safeMax = Math.max(1, Math.floor(max));
  const selected = Number.isFinite(value)
    ? Math.min(safeMax, Math.max(0, Math.round(value)))
    : 0;

  return (
    <div className={cn("inline-flex flex-col gap-1", className)}>
      <div
        className={cn("inline-flex items-center gap-0.5", SIZE_CLASS[size])}
        role="radiogroup"
        aria-label="Rating"
      >
        {Array.from({ length: safeMax }, (_, index) => {
          const starValue = index + 1;
          const on = starValue <= selected;
          return (
            <button
              key={starValue}
              type="button"
              role="radio"
              name={name}
              aria-checked={selected === starValue}
              aria-label={`${starValue} ${starValue === 1 ? "star" : "stars"}`}
              disabled={disabled}
              onClick={() => onChange(starValue)}
              className={cn(
                "rounded-sm px-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                on
                  ? "text-accent"
                  : "text-muted-foreground/35 hover:text-accent/70",
              )}
            >
              ★
            </button>
          );
        })}
      </div>
      {selected > 0 ? (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {selected} {selected === 1 ? "star" : "stars"}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Select a rating</p>
      )}
    </div>
  );
}
