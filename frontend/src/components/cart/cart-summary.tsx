"use client";

import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useCart } from "./cart-provider";

interface CartSummaryProps {
  className?: string;
  /** Compact spacing for the mini-cart footer. */
  compact?: boolean;
}

/**
 * Subtotal only. Shipping / tax / coupons are calculated at checkout
 * via the backend pricing engine — no invented carrier rates here.
 * Tax footer copy mirrors ANBAZAR cart (inclusive vs exclusive).
 */
export function CartSummary({ className, compact = false }: CartSummaryProps) {
  const { subtotal, itemCount, items } = useCart();
  const knownTaxFlags = items.filter((item) => typeof item.taxIncluded === "boolean");
  const allTaxIncluded =
    knownTaxFlags.length > 0 && knownTaxFlags.every((item) => item.taxIncluded === true);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Subtotal
          {itemCount > 0 ? (
            <span className="ml-1">
              ({itemCount} {itemCount === 1 ? "item" : "items"})
            </span>
          ) : null}
        </span>
        <span className="font-medium">{formatMoney(subtotal)}</span>
      </div>

      <div className="flex items-start justify-between gap-4 text-sm">
        <span className="text-muted-foreground">Shipping</span>
        <span className="text-right text-muted-foreground">Calculated at checkout</span>
      </div>

      <div
        className={cn(
          "flex items-center justify-between border-t border-border pt-3",
          compact ? "text-sm" : "text-base",
        )}
      >
        <span className="font-medium">Total</span>
        <span className="font-medium">{formatMoney(subtotal)}</span>
      </div>
      <p className="text-xs italic text-muted-foreground">
        {allTaxIncluded
          ? "Product prices include all applicable taxes. Shipping and Shipping GST will be calculated at checkout."
          : "Taxes and shipping will be calculated at checkout."}
      </p>
    </div>
  );
}
