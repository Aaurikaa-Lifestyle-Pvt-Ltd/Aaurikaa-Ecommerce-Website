"use client";

import { useState } from "react";
import Image from "next/image";
import type { CartItem } from "@/types/cart";
import type { PricingQuote } from "@/lib/api/pricing";
import { formatMoney } from "@/lib/format";
import { formatCartVariantLabel, lineTotal } from "@/lib/cart";
import { invalidCouponMessage } from "@/lib/commerce-errors";
import { cn } from "@/lib/cn";
import { Spinner } from "@/components/ui/spinner";

interface CheckoutSummaryProps {
  items: CartItem[];
  className?: string;
  quote?: PricingQuote | null;
  quoteError?: string | null;
  quoting?: boolean;
  couponCode?: string;
  onApplyCoupon?: (code: string) => void;
  onRemoveCoupon?: () => void;
}

function inr(amount: number) {
  return formatMoney({ amount, currency: "INR" });
}

function SummaryRow({
  label,
  value,
  discount,
}: {
  label: string;
  value: string;
  discount?: boolean;
}) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-medium", discount && "text-sale")}>{value}</span>
    </div>
  );
}

function shippingRowLabel(quote: PricingQuote): string {
  const name = quote.shippingLabel?.trim();
  if (name && name.toLowerCase() !== "shipping") {
    return `Shipping (${name})`;
  }
  return "Shipping";
}

function shippingRowValue(quote: PricingQuote): string {
  if (quote.shippingPending) return "Enter delivery address";
  if (quote.shipping === 0 || quote.freeShipping) return "Complimentary";
  return inr(quote.shipping);
}

function hasAddedTaxBreakdown(quote: PricingQuote): boolean {
  return (
    quote.addedCgst > 0 ||
    quote.addedSgst > 0 ||
    quote.addedUgst > 0 ||
    quote.addedIgst > 0
  );
}

function formatPercent(rate: number): string {
  return Number.isInteger(rate) ? String(rate) : rate.toFixed(1).replace(/\.0$/, "");
}

/**
 * Checkout order summary — mirrors ANBAZAR display rules:
 * - Exclusive: show added CGST/SGST/IGST/UGST only (amounts that increase payable).
 * - Inclusive: do NOT break out product GST; only show Shipping GST (rate%) when present.
 * Totals always come from the server quote.
 */
export function CheckoutSummary({
  items,
  className,
  quote,
  quoteError,
  quoting = false,
  couponCode = "",
  onApplyCoupon,
  onRemoveCoupon,
}: CheckoutSummaryProps) {
  const [draftCoupon, setDraftCoupon] = useState("");

  const couponInvalid =
    Boolean(couponCode.trim()) && quote?.couponValid === false;
  const couponValid =
    Boolean(couponCode.trim()) && quote?.couponValid === true;

  const shippingGstRate = quote?.shippingTaxRate ?? quote?.gstRate ?? null;
  const shippingGstLabel =
    shippingGstRate != null && shippingGstRate > 0
      ? `Shipping GST (${formatPercent(shippingGstRate)}%)`
      : "Shipping GST";

  function handleApply() {
    const trimmed = draftCoupon.trim().toUpperCase();
    if (!trimmed) return;
    onApplyCoupon?.(trimmed);
  }

  function handleRemove() {
    setDraftCoupon("");
    onRemoveCoupon?.();
  }

  return (
    <aside
      className={cn(
        "h-fit rounded-card border border-border bg-surface p-5 sm:p-6",
        className,
      )}
    >
      <h2 className="font-serif text-xl tracking-tight">Order summary</h2>

      <ul className="mt-5 flex flex-col gap-4">
        {items.map((item) => {
          const variant = formatCartVariantLabel(item.options, item.variantTitle);
          return (
            <li key={item.id} className="grid grid-cols-[64px_1fr] gap-3">
              <div className="relative aspect-square overflow-hidden rounded-control bg-muted">
                <Image
                  src={item.image.src}
                  alt={item.image.alt}
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.name}</p>
                {variant ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">{variant}</p>
                ) : null}
                <div className="mt-1 flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">Qty {item.quantity}</span>
                  {item.price.amount > 0 ? (
                    <span className="font-medium">{formatMoney(lineTotal(item))}</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">In your total</span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Promo Code inside Order Summary */}
      <div className="mt-6 border-t border-border pt-5">
        <label
          htmlFor="summary-promo-code"
          className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground"
        >
          Promo code
        </label>
        {couponValid ? (
          <div className="flex items-center justify-between rounded-control border border-border bg-muted/40 px-3.5 py-2.5 text-sm">
            <div className="min-w-0 pr-2">
              <span className="font-semibold tracking-wider text-foreground">
                {couponCode.trim().toUpperCase()}
              </span>
              <p className="text-xs text-muted-foreground">
                Promo code {couponCode.trim().toUpperCase()} applied.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRemove}
              className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-sale"
              aria-label="Remove promo code"
            >
              <span>Remove</span>
              <span aria-hidden="true" className="text-sm font-bold leading-none">×</span>
            </button>
          </div>
        ) : (
          <div>
            <div className="flex gap-2">
              <input
                id="summary-promo-code"
                type="text"
                value={draftCoupon}
                placeholder="Enter promo code"
                onChange={(e) => setDraftCoupon(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleApply();
                  }
                }}
                className="w-full min-w-0 rounded-control border border-input bg-background px-3 py-2 text-xs uppercase placeholder:normal-case placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                type="button"
                disabled={!draftCoupon.trim() || quoting}
                onClick={handleApply}
                className="shrink-0 rounded-control border border-border bg-surface px-3.5 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                Apply
              </button>
            </div>
            {couponInvalid ? (
              <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                <p className="text-sale" role="alert">
                  {invalidCouponMessage(couponCode)}
                </p>
                <button
                  type="button"
                  onClick={handleRemove}
                  className="font-medium text-muted-foreground underline-offset-4 hover:underline"
                >
                  Clear
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="mt-5 space-y-3 border-t border-border pt-5">
        {quoting ? (
          <p
            className="flex items-center gap-2 text-sm text-muted-foreground"
            role="status"
          >
            <Spinner className="size-4" />
            Updating shipping and tax…
          </p>
        ) : null}
        {quoteError ? (
          <p className="text-sm text-sale" role="alert">
            {quoteError}
          </p>
        ) : null}
        {quote ? (
          <>
            <SummaryRow label={quote.subtotalLabel} value={inr(quote.subtotal)} />

            {quote.discount > 0 ? (
              <SummaryRow
                label={
                  couponValid && couponCode.trim()
                    ? `Discount (${couponCode.trim().toUpperCase()})`
                    : "Discount"
                }
                value={`−${inr(quote.discount)}`}
                discount
              />
            ) : null}

            {/* Exclusive: payable GST components (ANBAZAR addedCgst/sgst/…) */}
            {!quote.shippingPending &&
            !quote.taxIncluded &&
            hasAddedTaxBreakdown(quote) ? (
              <>
                {quote.addedIgst > 0 ? (
                  <SummaryRow
                    label={
                      quote.gstRate != null && quote.gstRate > 0
                        ? `IGST (${formatPercent(quote.gstRate)}%)`
                        : "IGST"
                    }
                    value={inr(quote.addedIgst)}
                  />
                ) : null}
                {quote.addedCgst > 0 ? (
                  <SummaryRow
                    label={
                      quote.gstRate != null && quote.gstRate > 0
                        ? `CGST (${formatPercent(quote.gstRate / 2)}%)`
                        : "CGST"
                    }
                    value={inr(quote.addedCgst)}
                  />
                ) : null}
                {quote.addedSgst > 0 ? (
                  <SummaryRow
                    label={
                      quote.gstRate != null && quote.gstRate > 0
                        ? `SGST (${formatPercent(quote.gstRate / 2)}%)`
                        : "SGST"
                    }
                    value={inr(quote.addedSgst)}
                  />
                ) : null}
                {quote.addedUgst > 0 ? (
                  <SummaryRow
                    label={
                      quote.gstRate != null && quote.gstRate > 0
                        ? `UGST (${formatPercent(quote.gstRate)}%)`
                        : "UGST"
                    }
                    value={inr(quote.addedUgst)}
                  />
                ) : null}
              </>
            ) : null}

            {!quote.shippingPending &&
            !quote.taxIncluded &&
            !hasAddedTaxBreakdown(quote) &&
            quote.taxAdded > 0 ? (
              <SummaryRow
                label={
                  quote.gstRate != null && quote.gstRate > 0
                    ? `Tax (GST ${formatPercent(quote.gstRate)}%)`
                    : "GST"
                }
                value={inr(quote.taxAdded)}
              />
            ) : null}

            {/* Inclusive: only Shipping GST — no product CGST/SGST breakout (ANBAZAR) */}
            {!quote.shippingPending &&
            quote.taxIncluded &&
            quote.shippingTax > 0 ? (
              <div className="space-y-1">
                <SummaryRow
                  label={shippingGstLabel}
                  value={inr(quote.shippingTax)}
                />
                <p className="text-[11px] italic leading-snug text-muted-foreground">
                  Product prices are inclusive of taxes. Shipping GST is
                  applicable on the delivery fee.
                </p>
              </div>
            ) : null}

            <SummaryRow
              label={shippingRowLabel(quote)}
              value={shippingRowValue(quote)}
            />

            {quote.shippingPending ? (
              <p className="text-xs text-muted-foreground">
                Shipping and destination GST update after you enter a delivery address.
              </p>
            ) : null}

            <div className="flex justify-between border-t border-border pt-3 text-base">
              <span className="font-medium">
                {quote.shippingPending ? "Items total" : "Total"}
              </span>
              <span className="font-medium">{inr(quote.total)}</span>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Sign in to calculate coupons, shipping, and tax.
          </p>
        )}
      </div>
    </aside>
  );
}
