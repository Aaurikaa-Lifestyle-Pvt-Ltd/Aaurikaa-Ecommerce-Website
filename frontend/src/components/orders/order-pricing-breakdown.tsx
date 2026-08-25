"use client";

import { formatMoney } from "@/lib/format";
import type { ShopperOrderDetail } from "@/lib/api/orders";

function inr(amount: number) {
  return formatMoney({ amount, currency: "INR" });
}

function Row({
  label,
  value,
  discount,
}: {
  label: string;
  value: string;
  discount?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={discount ? "font-medium text-sale" : "font-medium"}>{value}</span>
    </div>
  );
}

type OrderPricingBreakdownProps = {
  pricingSummary: NonNullable<ShopperOrderDetail["pricingSummary"]>;
  /** Fallback total when orderSummary.total is missing. */
  fallbackTotal?: number;
};

function resolveDiscountAmount(
  pricingSummary: NonNullable<ShopperOrderDetail["pricingSummary"]>,
): number {
  const summary = pricingSummary.orderSummary;
  // Prefer orderSummary.discountAmount when present (0 hides embedded discounts).
  if (summary && summary.discountAmount !== undefined && summary.discountAmount !== null) {
    return Number(summary.discountAmount) || 0;
  }
  return Number(pricingSummary.discountAmount) || 0;
}

function resolveCouponCode(
  pricingSummary: NonNullable<ShopperOrderDetail["pricingSummary"]>,
): string | null {
  const fromSummary = pricingSummary.orderSummary?.couponCode?.trim();
  if (fromSummary) return fromSummary;
  const fromRoot = pricingSummary.couponCode?.trim();
  return fromRoot || null;
}

/**
 * Display-only financial breakdown from pricingSummary.orderSummary.
 * Matches ANBAZAR OrderDetailPricingSection — no CGST/SGST component breakout.
 * Never recalculates payable totals on the client.
 */
export function OrderPricingBreakdown({
  pricingSummary,
  fallbackTotal,
}: OrderPricingBreakdownProps) {
  const summary = pricingSummary.orderSummary;
  const subtotal = summary?.subtotal ?? pricingSummary.subtotal ?? 0;
  const subtotalLabel = summary?.subtotalLabel || "Subtotal";
  const shippingCharge = summary?.shippingCharge ?? pricingSummary.shippingCharge ?? 0;
  const itemsGstAdded = Number(summary?.itemsGstAdded) || 0;
  const shippingGst = Number(summary?.shippingGst) || 0;
  const discountAmount = resolveDiscountAmount(pricingSummary);
  const couponCode = resolveCouponCode(pricingSummary);
  const total =
    summary?.total ?? pricingSummary.total ?? fallbackTotal ?? 0;
  const showShipping = pricingSummary.requiresShipping !== false;
  const discountLabel = couponCode ? `Discount (${couponCode})` : "Discount";

  return (
    <div className="space-y-2 text-sm">
      <Row label={subtotalLabel} value={inr(subtotal)} />
      {itemsGstAdded > 0 ? (
        <Row label="GST on products" value={inr(itemsGstAdded)} />
      ) : null}
      {showShipping ? (
        <Row
          label="Shipping"
          value={shippingCharge === 0 ? "Complimentary" : inr(shippingCharge)}
        />
      ) : null}
      {showShipping && shippingGst > 0 ? (
        <Row label="GST on shipping" value={inr(shippingGst)} />
      ) : null}
      {discountAmount > 0 ? (
        <Row label={discountLabel} value={`−${inr(discountAmount)}`} discount />
      ) : null}
      <div className="flex justify-between border-t border-border pt-3 text-base font-medium">
        <span>Total</span>
        <span>{inr(total)}</span>
      </div>
    </div>
  );
}
