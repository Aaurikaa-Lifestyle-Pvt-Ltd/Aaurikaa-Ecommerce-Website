import type { Money } from "@/types/commerce";

/** Format a Money value for display. Currency/locale are configurable later. */
export function formatMoney(money: Money, locale = "en-IN"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: money.currency,
    maximumFractionDigits: 0,
  }).format(money.amount);
}
