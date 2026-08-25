/** Customer-facing copy when pricing/quote/validation exposes technical price detail. */
export const FRIENDLY_ORDER_TOTAL_ERROR =
  "We couldn't calculate your order total. Please refresh your cart and try again.";

/**
 * Surfaces backend commerce failure messages for checkout / cart / payment.
 * Does not invent refund or carrier policy — only clarifies common API failures.
 * Technical price/index validation strings are never shown to shoppers.
 */
export function formatCommerceApiError(err: unknown, fallback: string): string {
  const fromApi = messageFromUnknownError(err);
  const message = fromApi || fallback;
  const lower = message.toLowerCase();

  if (
    lower.includes("coupon") ||
    lower.includes("promo") ||
    lower.includes("voucher")
  ) {
    return message;
  }
  if (
    lower.includes("stock") ||
    lower.includes("inventory") ||
    lower.includes("out of stock") ||
    lower.includes("insufficient")
  ) {
    return message;
  }
  if (
    lower.includes("phonepe") ||
    lower.includes("payment") ||
    lower.includes("not configured") ||
    lower.includes("unavailable")
  ) {
    return message;
  }

  if (isTechnicalPricingMessage(lower)) {
    if (fromApi) {
      console.error("[commerce]", fromApi);
    }
    return FRIENDLY_ORDER_TOTAL_ERROR;
  }

  if (isTechnicalShippingMessage(lower)) {
    if (fromApi) {
      console.error("[commerce]", fromApi);
    }
    return "We couldn't calculate shipping for this address. Please check your PIN and try again.";
  }

  return message;
}

/** True for validator / quote noise shoppers should never see. */
function isTechnicalPricingMessage(lower: string): boolean {
  return (
    lower.includes("item at index") ||
    lower.includes("price must") ||
    lower.includes("must be at least") ||
    lower.includes("invalid price") ||
    lower.includes("unit price") ||
    lower.includes("line price") ||
    lower.includes("amount must") ||
    lower.includes("₹0.01") ||
    lower.includes("rs. 0.01") ||
    lower.includes("rs 0.01") ||
    (lower.includes("pricing") &&
      (lower.includes("fail") ||
        lower.includes("error") ||
        lower.includes("invalid") ||
        lower.includes("unable") ||
        lower.includes("could not"))) ||
    (lower.includes("quote") &&
      (lower.includes("fail") ||
        lower.includes("error") ||
        lower.includes("invalid") ||
        lower.includes("unable") ||
        lower.includes("could not")))
  );
}

function isTechnicalShippingMessage(lower: string): boolean {
  return (
    lower.includes("shipping slab") ||
    lower.includes("weight class") ||
    lower.includes("weightclass") ||
    lower.includes("missing a shipping") ||
    lower.includes("zone_unresolved") ||
    lower.includes("flat_rule_missing") ||
    (lower.includes("shipping") &&
      (lower.includes("engine") || lower.includes("slab") || lower.includes("unresolved")))
  );
}

function messageFromUnknownError(err: unknown): string | null {
  if (!err || typeof err !== "object") {
    return err instanceof Error && err.message.trim() ? err.message.trim() : null;
  }
  const record = err as {
    message?: unknown;
    details?: unknown;
  };
  if (record.details && typeof record.details === "object") {
    const detailsMessage = (record.details as { message?: unknown }).message;
    if (typeof detailsMessage === "string" && detailsMessage.trim()) {
      return detailsMessage.trim();
    }
  }
  if (typeof record.message === "string" && record.message.trim()) {
    return record.message.trim();
  }
  return null;
}

export function invalidCouponMessage(code: string): string {
  const trimmed = code.trim().toUpperCase();
  return trimmed
    ? `Coupon “${trimmed}” is not valid for this order.`
    : "This coupon is not valid for this order.";
}
