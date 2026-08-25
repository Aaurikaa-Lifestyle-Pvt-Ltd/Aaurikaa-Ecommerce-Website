import type { CartItem } from "@/types/cart";
import { cartLineId } from "@/lib/cart";
import { idString, resolveMediaUrl } from "./media";
import { mapProductPrices } from "./helpers";

export { toCartAddPayload } from "./helpers";

export type BackendCartItem = {
  product?: {
    _id?: unknown;
    id?: unknown;
    slug?: string;
    name?: string;
    mainImage?: string;
    regularPrice?: number;
    salePrice?: number;
    taxIncluded?: boolean;
  } | string;
  quantity?: number;
  variantKey?: string;
  variantCombination?: Record<string, string>;
  variantPriceSnapshot?: number;
  image?: string;
};

/**
 * Cart display prices come from the backend snapshot / product document.
 * Client-authored prices are not used.
 */
export function mapBackendCartItem(raw: BackendCartItem | null | undefined): CartItem | null {
  if (!raw || !raw.product || typeof raw.product === "string") return null;
  const productId = idString(raw.product._id ?? raw.product.id);
  if (!productId) return null;

  const quantity = Math.max(1, Number(raw.quantity) || 1);
  const snapshot = Number(raw.variantPriceSnapshot);
  const mapped = mapProductPrices(raw.product.regularPrice, raw.product.salePrice);
  const unitAmount = Number.isFinite(snapshot) && snapshot > 0 ? snapshot : mapped.price.amount;
  const variantId = raw.variantKey || undefined;
  const options = raw.variantCombination ?? undefined;
  const title = options ? Object.values(options).join(" / ") : variantId;

  return {
    id: cartLineId(productId, variantId),
    productId,
    slug: String(raw.product.slug ?? ""),
    name: String(raw.product.name ?? "Product"),
    image: {
      src: resolveMediaUrl(raw.image || raw.product.mainImage),
      alt: String(raw.product.name ?? "Product"),
    },
    quantity,
    price: { amount: unitAmount, currency: "INR" },
    compareAtPrice: mapped.compareAtPrice,
    variantId,
    variantTitle: title,
    options,
    ...(typeof raw.product.taxIncluded === "boolean"
      ? { taxIncluded: raw.product.taxIncluded }
      : {}),
  };
}

export function mapBackendCartItems(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => mapBackendCartItem(item as BackendCartItem))
    .filter((item): item is CartItem => Boolean(item));
}
