import { apiRequest, unwrapData } from "./client";
import {
  buildPricingQuotePayload,
  mapPricingQuote,
  type PricingApiResult,
  type PricingQuote,
  type PricingQuoteRequest,
} from "../mappers/pricing-quote";
import type { CheckoutOrderAddress, CheckoutOrderLine } from "../mappers/order-payload";

export type { PricingQuote } from "../mappers/pricing-quote";
export { mapPricingQuote } from "../mappers/pricing-quote";

type ValidateCouponApiResult = {
  valid?: boolean;
  coupon?: unknown;
};

function numberOrZero(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** POST /api/pricing/validate-coupon — authoritative coupon validity. */
export async function validateCheckoutCoupon(input: {
  couponCode: string;
  cartTotal: number;
}): Promise<{ valid: boolean }> {
  const response = await apiRequest<
    { data?: ValidateCouponApiResult } | ValidateCouponApiResult
  >("/api/pricing/validate-coupon", {
    method: "POST",
    auth: false,
    body: {
      couponCode: input.couponCode.trim().toUpperCase(),
      cartTotal: Math.max(0, numberOrZero(input.cartTotal)),
    },
  });
  const data = unwrapData(response) as ValidateCouponApiResult;
  return { valid: Boolean(data?.valid) };
}

export async function fetchCheckoutQuote(input: {
  items: CheckoutOrderLine[];
  coupon?: string;
  shipping?: CheckoutOrderAddress;
}): Promise<PricingQuote> {
  const body: PricingQuoteRequest = buildPricingQuotePayload(input);
  const response = await apiRequest<{ data?: PricingApiResult } | PricingApiResult>(
    "/api/pricing/calculate",
    { method: "POST", auth: false, body },
  );
  const quote = mapPricingQuote(unwrapData(response) as PricingApiResult, {
    couponCode: body.couponCode,
  });

  const couponCode = body.couponCode?.trim();
  if (!couponCode) return quote;

  try {
    const validation = await validateCheckoutCoupon({
      couponCode,
      cartTotal: quote.subtotal,
    });
    return { ...quote, couponValid: validation.valid };
  } catch {
    // Keep mapper-derived validity if validate-coupon is unavailable.
    return quote;
  }
}
