"use client";

import Image from "next/image";
import Link from "next/link";
import type { CartItem } from "@/types/cart";
import { formatMoney } from "@/lib/format";
import {
  formatCartVariantLabel,
  lineTotal,
} from "@/lib/cart";
import { cn } from "@/lib/cn";
import { useCart } from "./cart-provider";

interface CartLineItemProps {
  item: CartItem;
  /** Compact layout for the mini-cart drawer. */
  compact?: boolean;
  className?: string;
}

/**
 * Shared cart line used by Mini Cart and Cart page.
 * Quantity + remove stay keyboard-accessible (no hover-only controls).
 */
export function CartLineItem({
  item,
  compact = false,
  className,
}: CartLineItemProps) {
  const { setQuantity, removeItem, closeCart } = useCart();
  const variantLabel = formatCartVariantLabel(item.options, item.variantTitle);
  const hasDiscount =
    item.compareAtPrice != null &&
    item.compareAtPrice.amount > item.price.amount;
  const href = `/products/${item.slug}`;

  return (
    <article
      className={cn(
        "grid gap-4",
        compact
          ? "grid-cols-[72px_1fr]"
          : "grid-cols-[88px_1fr] sm:grid-cols-[104px_1fr_auto_auto] sm:items-start",
        className,
      )}
    >
      <Link
        href={href}
        onClick={closeCart}
        className="relative aspect-square overflow-hidden rounded-control bg-muted"
      >
        <Image
          src={item.image.src}
          alt={item.image.alt}
          fill
          sizes={compact ? "72px" : "(min-width: 640px) 104px, 88px"}
          className="object-cover"
        />
      </Link>

      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-medium leading-snug">
              <Link
                href={href}
                onClick={closeCart}
                className="underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {item.name}
              </Link>
            </h3>
            {variantLabel ? (
              <p className="mt-1 text-xs text-muted-foreground">{variantLabel}</p>
            ) : null}
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
              <span>{formatMoney(item.price)}</span>
              {hasDiscount ? (
                <span className="text-xs text-muted-foreground line-through">
                  {formatMoney(item.compareAtPrice!)}
                </span>
              ) : null}
              {typeof item.taxIncluded === "boolean" ? (
                <span className="text-xs font-medium text-muted-foreground">
                  ({item.taxIncluded ? "All Taxes Included" : "Taxes Extra"})
                </span>
              ) : null}
            </div>
          </div>

          {!compact ? (
            <p className="hidden text-sm font-medium sm:block">
              {formatMoney(lineTotal(item))}
            </p>
          ) : null}
        </div>

        <div
          className={cn(
            "mt-3 flex flex-wrap items-center gap-3",
            !compact && "sm:mt-4",
          )}
        >
          <div className="inline-flex items-center rounded-control border border-border">
            <button
              type="button"
              aria-label={`Decrease quantity for ${item.name}`}
              disabled={item.quantity <= 1}
              onClick={() => setQuantity(item.id, item.quantity - 1)}
              className="inline-grid h-9 w-9 place-items-center text-base transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
            >
              −
            </button>
            <span
              className="min-w-8 text-center text-sm tabular-nums"
              aria-live="polite"
            >
              {item.quantity}
            </span>
            <button
              type="button"
              aria-label={`Increase quantity for ${item.name}`}
              onClick={() => setQuantity(item.id, item.quantity + 1)}
              className="inline-grid h-9 w-9 place-items-center text-base transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              +
            </button>
          </div>

          <button
            type="button"
            onClick={() => removeItem(item.id)}
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Remove
          </button>

          {compact ? (
            <p className="ml-auto text-sm font-medium">
              {formatMoney(lineTotal(item))}
            </p>
          ) : (
            <p className="ml-auto text-sm font-medium sm:hidden">
              {formatMoney(lineTotal(item))}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
