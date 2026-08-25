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

export type CheckoutOrderLine = {
  productId: string;
  quantity: number;
  variantKey?: string;
  options?: Record<string, string>;
  image?: string;
};

export type CheckoutOrderAddress = {
  name: string;
  email: string;
  phone: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
  stateId?: string;
  countryId?: string;
};

export type CheckoutPaymentMethod = "cod" | "phonepe";

export type CreateOrderRequest = {
  items: Array<{
    product: string;
    quantity: number;
    variantKey?: string;
    variantCombination?: Record<string, string>;
    image?: string;
  }>;
  paymentMethod: CheckoutPaymentMethod;
  billingAddress: CheckoutOrderAddress;
  shippingAddress: CheckoutOrderAddress;
  coupon?: string;
};

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function resolveVariant(
  line: CheckoutOrderLine,
): { variantKey?: string; variantCombination?: Record<string, string> } {
  const options =
    line.options && Object.keys(line.options).length > 0
      ? line.options
      : combinationFromVariantKey(line.variantKey);
  const fromOptions = options ? normalizeVariantKey(options) : null;
  const variantKey = fromOptions || line.variantKey || undefined;
  if (!options && !variantKey) return {};
  return {
    ...(variantKey ? { variantKey } : {}),
    ...(options ? { variantCombination: options } : {}),
  };
}

/**
 * Builds POST /api/orders body from checkout identity only.
 * Client prices, totals, payment status, buyer, and seller fields are omitted.
 */
export function buildCreateOrderPayload(input: {
  items: CheckoutOrderLine[];
  shipping: CheckoutOrderAddress;
  billing?: CheckoutOrderAddress;
  coupon?: string;
  paymentMethod?: CheckoutPaymentMethod;
  /**
   * Ignored on purpose — present so tests can prove client amounts
   * never reach the backend payload.
   */
  clientTotal?: number;
  clientLinePrice?: number;
  sellerId?: string;
}): CreateOrderRequest {
  void input.clientTotal;
  void input.clientLinePrice;
  void input.sellerId;

  const items = input.items
    .filter((line) => line.productId)
    .map((line) => {
      const variant = resolveVariant(line);
      const item: CreateOrderRequest["items"][number] = {
        product: line.productId,
        quantity: Math.max(1, Math.floor(Number(line.quantity) || 1)),
        ...variant,
      };
      if (line.image && !line.image.startsWith("/") && !line.image.startsWith("http")) {
        item.image = line.image;
      }
      return item;
    });

  const shipping: CheckoutOrderAddress = {
    name: input.shipping.name.trim(),
    email: input.shipping.email.trim(),
    phone: digits(input.shipping.phone),
    address1: input.shipping.address1.trim(),
    city: input.shipping.city.trim(),
    state: input.shipping.state.trim(),
    zip: input.shipping.zip.trim(),
    country: (input.shipping.country || "India").trim(),
  };
  if (input.shipping.address2?.trim()) shipping.address2 = input.shipping.address2.trim();
  if (input.shipping.stateId) shipping.stateId = input.shipping.stateId;
  if (input.shipping.countryId) shipping.countryId = input.shipping.countryId;

  const coupon = input.coupon?.trim().toUpperCase();
  const paymentMethod: CheckoutPaymentMethod =
    input.paymentMethod === "phonepe" ? "phonepe" : "cod";

  return {
    items,
    paymentMethod,
    billingAddress: input.billing ?? shipping,
    shippingAddress: shipping,
    ...(coupon ? { coupon } : {}),
  };
}

export function assertSafeOrderPayload(payload: Record<string, unknown>): string[] {
  const forbidden = [
    "sellerId",
    "seller",
    "sellerShop",
    "totalAmount",
    "paymentStatus",
    "status",
    "buyer",
    "price",
    "variantPriceSnapshot",
  ];
  return forbidden.filter((key) => key in payload);
}
