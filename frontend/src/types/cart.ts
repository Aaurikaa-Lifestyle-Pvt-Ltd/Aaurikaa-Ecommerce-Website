import type { Money, ProductImage } from "@/types/commerce";

/**
 * A single cart line. Product + optional variant identity is stable so
 * Checkout can later consume the same shape without rewriting the UI.
 */
export interface CartItem {
  /** Stable line key: productId + variantId (or "default"). */
  id: string;
  productId: string;
  slug: string;
  name: string;
  image: ProductImage;
  quantity: number;
  /** Unit price at the time of add (variant price when applicable). */
  price: Money;
  compareAtPrice?: Money;
  variantId?: string;
  variantTitle?: string;
  /** e.g. { Size: "6", Finish: "Gold" } */
  options?: Record<string, string>;
  /** From product catalogue — display copy only; no client tax math. */
  taxIncluded?: boolean;
}

/** Payload used by PDP (and later Quick Add) to insert into the cart. */
export interface AddToCartInput {
  productId: string;
  slug: string;
  name: string;
  image: ProductImage;
  quantity: number;
  price: Money;
  compareAtPrice?: Money;
  variantId?: string;
  variantTitle?: string;
  options?: Record<string, string>;
  taxIncluded?: boolean;
}
