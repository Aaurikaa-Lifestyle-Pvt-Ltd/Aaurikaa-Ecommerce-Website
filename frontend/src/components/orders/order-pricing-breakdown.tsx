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
  const discountAmount =
    Number(summary?.discountAmount) || Number(pricingSummary.discountAmount) || 0;
  const total =
    summary?.total ?? pricingSummary.total ?? fallbackTotal ?? 0;
  const showShipping = pricingSummary.requiresShipping !== false;

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
        <Row label="Discount" value={`−${inr(discountAmount)}`} discount />
      ) : null}
      <div className="flex justify-between border-t border-border pt-3 text-base font-medium">
        <span>Total</span>
        <span>{inr(total)}</span>
      </div>
    </div>
  );
}
