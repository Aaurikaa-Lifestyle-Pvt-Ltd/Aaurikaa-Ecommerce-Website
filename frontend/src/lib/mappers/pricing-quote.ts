import type { CheckoutOrderAddress, CheckoutOrderLine } from "./order-payload";

function combinationFromVariantKey(
  variantKey?: string | null,
): Record<string, string> | undefined {
  if (!variantKey) return undefined;
  const options: Record<string, string> = {};
  for (const part of variantKey.split("|")) {
    const trimmed = part.trim();
    const idx = trimmed.indexOf(":");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (key && value) options[key] = value;
  }
  return Object.keys(options).length > 0 ? options : undefined;
}

function normalizeVariantKey(options: Record<string, string>): string | null {
  const keys = Object.keys(options);
  if (keys.length === 0) return null;
  const parts = keys
    .sort()
    .map((key) => {
      const value = options[key];
      if (value == null) return null;
      return `${String(key).toLowerCase().trim()}:${String(value).toLowerCase().trim()}`;
    })
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join("|") : null;
}

export type PricingQuoteRequest = {
  cartItems: Array<{
    product: string;
    quantity: number;
    variantKey?: string;
    variantCombination?: Record<string, string>;
  }>;
  couponCode?: string;
  shippingAddress?: {
    state?: string;
    stateId?: string;
    country?: string;
    countryId?: string;
    pincode?: string;
    zip?: string;
  };
};

/**
 * Quote payload for POST /api/pricing/calculate.
 * Product identity and quantity only — no client prices or seller fields.
 */
export function buildPricingQuotePayload(input: {
  items: CheckoutOrderLine[];
  coupon?: string;
  shipping?: Pick<
    CheckoutOrderAddress,
    "state" | "stateId" | "country" | "countryId" | "zip"
  >;
  clientLinePrice?: number;
  variantPriceSnapshot?: number;
}): PricingQuoteRequest {
  void input.clientLinePrice;
  void input.variantPriceSnapshot;

  const cartItems = input.items
    .filter((line) => line.productId)
    .map((line) => {
      const options =
        line.options && Object.keys(line.options).length > 0
          ? line.options
          : combinationFromVariantKey(line.variantKey);
      const variantKey =
        (options ? normalizeVariantKey(options) : null) || line.variantKey || undefined;
      const item: PricingQuoteRequest["cartItems"][number] = {
        product: line.productId,
        quantity: Math.max(1, Math.floor(Number(line.quantity) || 1)),
      };
      if (variantKey) item.variantKey = variantKey;
      if (options) item.variantCombination = options;
      return item;
    });

  const couponCode = input.coupon?.trim().toUpperCase();
  const shipping = input.shipping;
  const shippingAddress = shipping
    ? {
        ...(shipping.state ? { state: shipping.state } : {}),
        ...(shipping.stateId ? { stateId: shipping.stateId } : {}),
        ...(shipping.country ? { country: shipping.country } : {}),
        ...(shipping.countryId ? { countryId: shipping.countryId } : {}),
        ...(shipping.zip ? { zip: shipping.zip, pincode: shipping.zip } : {}),
      }
    : undefined;

  return {
    cartItems,
    ...(couponCode ? { couponCode } : {}),
    ...(shippingAddress && Object.keys(shippingAddress).length > 0
      ? { shippingAddress }
      : {}),
  };
}

export function assertSafePricingQuotePayload(payload: PricingQuoteRequest): string[] {
  const forbidden = ["price", "variantPriceSnapshot", "sellerId", "totalAmount"];
  const hits = forbidden.filter((key) => key in payload);
  for (const item of payload.cartItems) {
    hits.push(...forbidden.filter((key) => key in item));
  }
  return hits;
}

export type PricingQuote = {
  subtotal: number;
  /** Display label for the items line — inclusive carts use "Subtotal (incl. GST)". */
  subtotalLabel: string;
  shipping: number;
  shippingMethod: string | null;
  /** Human label from shipping engine (e.g. rule name). */
  shippingLabel: string | null;
  /** True when quote ran without a delivery destination (shipping not final). */
  shippingPending: boolean;
  discount: number;
  /** Amount actually added to payable (exclusive GST + shipping GST). Prefer over `tax`. */
  taxAdded: number;
  /** Legacy flat tax field — mirrors taxAdded for callers that still read `tax`. */
  tax: number;
  taxIncluded: boolean;
  /** Total GST components (may include tax already in product prices). */
  cgst: number;
  sgst: number;
  ugst: number;
  igst: number;
  /** GST amounts added on top of subtotal (exclusive product tax + shipping GST). */
  addedCgst: number;
  addedSgst: number;
  addedUgst: number;
  addedIgst: number;
  /** Full GST % from pricing engine (`tax.rate`), e.g. 12. */
  gstRate: number | null;
  shippingTax: number;
  shippingTaxRate: number | null;
  shippingCgst: number;
  shippingSgst: number;
  shippingUgst: number;
  shippingIgst: number;
  total: number;
  /** null when no coupon was sent; true/false after mapping or validate-coupon. */
  couponValid: boolean | null;
  freeShipping: boolean;
};

type ShippingTaxRaw = {
  taxAmount?: number;
  taxRate?: number;
  cgst?: number;
  sgst?: number;
  ugst?: number;
  igst?: number;
};

export type PricingApiResult = {
  subtotal?: number;
  total?: number;
  shipping?: { amount?: number; method?: string; label?: string };
  discount?: {
    total?: number;
    coupon?: { valid?: boolean } | number;
    freeShipping?: boolean;
  };
  tax?: {
    amount?: number;
    rate?: number;
    taxAdded?: number;
    cgst?: number;
    sgst?: number;
    ugst?: number;
    igst?: number;
    addedCgst?: number;
    addedSgst?: number;
    addedUgst?: number;
    addedIgst?: number;
    included?: boolean;
    taxType?: string | null;
    shippingTax?: ShippingTaxRaw | number;
  };
  metadata?: { couponApplied?: boolean };
};

function numberOrZero(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function resolveShippingTax(raw: PricingApiResult["tax"]): {
  amount: number;
  rate: number | null;
  cgst: number;
  sgst: number;
  ugst: number;
  igst: number;
} {
  const shippingTax = raw?.shippingTax;
  if (typeof shippingTax === "number") {
    return {
      amount: numberOrZero(shippingTax),
      rate: null,
      cgst: 0,
      sgst: 0,
      ugst: 0,
      igst: 0,
    };
  }
  if (shippingTax && typeof shippingTax === "object") {
    const rate = Number(shippingTax.taxRate);
    return {
      amount: numberOrZero(shippingTax.taxAmount),
      rate: Number.isFinite(rate) ? rate : null,
      cgst: numberOrZero(shippingTax.cgst),
      sgst: numberOrZero(shippingTax.sgst),
      ugst: numberOrZero(shippingTax.ugst),
      igst: numberOrZero(shippingTax.igst),
    };
  }
  return { amount: 0, rate: null, cgst: 0, sgst: 0, ugst: 0, igst: 0 };
}

function resolveGstRatePercent(raw: PricingApiResult["tax"]): number | null {
  const rate = Number(raw?.rate);
  if (Number.isFinite(rate) && rate > 0) return rate;
  const shippingRate = resolveShippingTax(raw).rate;
  if (shippingRate != null && shippingRate > 0) return shippingRate;
  return null;
}

function resolveTaxIncluded(raw: PricingApiResult["tax"]): boolean {
  if (raw?.included === true) return true;
  const taxType = String(raw?.taxType || "").toLowerCase();
  return taxType.includes("inclusive") || taxType.includes("mixed");
}

/**
 * Map POST /api/pricing/calculate payload.
 * `discount.coupon` is often a number (coupon discount ₹), not `{ valid }`.
 */
export function mapPricingQuote(
  raw: PricingApiResult | null | undefined,
  options?: { couponCode?: string },
): PricingQuote {
  const couponCode = options?.couponCode?.trim();
  const coupon = raw?.discount?.coupon;
  const freeShipping = Boolean(raw?.discount?.freeShipping);
  const taxIncluded = resolveTaxIncluded(raw?.tax);
  const shippingTax = resolveShippingTax(raw?.tax);
  const gstRate = resolveGstRatePercent(raw?.tax);
  const taxAdded =
    raw?.tax?.taxAdded !== undefined && raw?.tax?.taxAdded !== null
      ? numberOrZero(raw.tax.taxAdded)
      : numberOrZero(raw?.tax?.amount);

  let couponValid: boolean | null = null;
  if (couponCode) {
    if (typeof coupon === "object" && coupon !== null && "valid" in coupon) {
      couponValid = Boolean(coupon.valid);
    } else if (typeof coupon === "number") {
      couponValid = numberOrZero(coupon) > 0 || freeShipping;
    } else {
      couponValid =
        numberOrZero(raw?.discount?.total) > 0 || freeShipping ? true : false;
    }
  }

  return {
    subtotal: numberOrZero(raw?.subtotal),
    subtotalLabel: taxIncluded ? "Subtotal (incl. GST)" : "Subtotal",
    shipping: numberOrZero(raw?.shipping?.amount),
    shippingMethod: raw?.shipping?.method ? String(raw.shipping.method) : null,
    shippingLabel: raw?.shipping?.label ? String(raw.shipping.label) : null,
    shippingPending:
      String(raw?.shipping?.method || "").toLowerCase() === "pending" ||
      Boolean((raw?.shipping as { breakdown?: { pendingAddress?: boolean } } | undefined)?.breakdown
        ?.pendingAddress),
    discount: numberOrZero(raw?.discount?.total),
    taxAdded,
    tax: taxAdded,
    taxIncluded,
    cgst: numberOrZero(raw?.tax?.cgst),
    sgst: numberOrZero(raw?.tax?.sgst),
    ugst: numberOrZero(raw?.tax?.ugst),
    igst: numberOrZero(raw?.tax?.igst),
    addedCgst: numberOrZero(raw?.tax?.addedCgst),
    addedSgst: numberOrZero(raw?.tax?.addedSgst),
    addedUgst: numberOrZero(raw?.tax?.addedUgst),
    addedIgst: numberOrZero(raw?.tax?.addedIgst),
    gstRate,
    shippingTax: shippingTax.amount,
    shippingTaxRate: shippingTax.rate,
    shippingCgst: shippingTax.cgst,
    shippingSgst: shippingTax.sgst,
    shippingUgst: shippingTax.ugst,
    shippingIgst: shippingTax.igst,
    total: numberOrZero(raw?.total),
    couponValid,
    freeShipping,
  };
}

