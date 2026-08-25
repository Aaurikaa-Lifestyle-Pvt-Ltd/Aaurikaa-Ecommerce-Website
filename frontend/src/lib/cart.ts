import type { Money } from "@/types/commerce";
import type { AddToCartInput, CartItem } from "@/types/cart";

/** Demo free-shipping threshold (matches site announcement). */
export const FREE_SHIPPING_THRESHOLD = 1499;

export const CART_STORAGE_KEY = "imagineairy.cart.v1";

export function cartLineId(
  productId: string,
  variantId?: string,
): string {
  return `${productId}::${variantId ?? "default"}`;
}

export function formatCartVariantLabel(
  options?: Record<string, string>,
  variantTitle?: string,
): string | undefined {
  if (options && Object.keys(options).length > 0) {
    return Object.entries(options)
      .map(([key, value]) => `${key}: ${value}`)
      .join(" · ");
  }
  return variantTitle;
}

export function lineTotal(item: CartItem): Money {
  return {
    amount: item.price.amount * item.quantity,
    currency: item.price.currency,
  };
}

export function cartItemCount(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

export function cartLineCount(items: CartItem[]): number {
  return items.length;
}

export function cartSubtotal(items: CartItem[]): Money {
  if (items.length === 0) {
    return { amount: 0, currency: "INR" };
  }
  const currency = items[0].price.currency;
  return {
    amount: items.reduce(
      (sum, item) => sum + item.price.amount * item.quantity,
      0,
    ),
    currency,
  };
}

/** Pure add — merges quantity when product + variant already exist. */
export function addCartItem(
  items: CartItem[],
  input: AddToCartInput,
): CartItem[] {
  const id = cartLineId(input.productId, input.variantId);
  const qty = Math.max(1, input.quantity);
  const existing = items.find((item) => item.id === id);

  if (existing) {
    return items.map((item) =>
      item.id === id
        ? {
            ...item,
            quantity: item.quantity + qty,
            ...(typeof input.taxIncluded === "boolean"
              ? { taxIncluded: input.taxIncluded }
              : {}),
          }
        : item,
    );
  }

  const next: CartItem = {
    id,
    productId: input.productId,
    slug: input.slug,
    name: input.name,
    image: input.image,
    quantity: qty,
    price: input.price,
    compareAtPrice: input.compareAtPrice,
    variantId: input.variantId,
    variantTitle: input.variantTitle,
    options: input.options,
    ...(typeof input.taxIncluded === "boolean"
      ? { taxIncluded: input.taxIncluded }
      : {}),
  };

  return [...items, next];
}

export function setCartItemQuantity(
  items: CartItem[],
  lineId: string,
  quantity: number,
): CartItem[] {
  const qty = Math.max(1, quantity);
  return items.map((item) =>
    item.id === lineId ? { ...item, quantity: qty } : item,
  );
}

export function removeCartItem(
  items: CartItem[],
  lineId: string,
): CartItem[] {
  return items.filter((item) => item.id !== lineId);
}

export function qualifiesForFreeShipping(subtotal: Money): boolean {
  return subtotal.amount >= FREE_SHIPPING_THRESHOLD;
}

export function parseCartLineId(lineId: string): {
  productId: string;
  variantKey?: string;
} {
  const idx = lineId.indexOf("::");
  if (idx === -1) return { productId: lineId };
  const productId = lineId.slice(0, idx);
  const variant = lineId.slice(idx + 2);
  return {
    productId,
    variantKey: !variant || variant === "default" ? undefined : variant,
  };
}
