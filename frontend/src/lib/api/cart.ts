import type { AddToCartInput, CartItem } from "@/types/cart";
import { apiRequest } from "./client";
import { mapBackendCartItems, toCartAddPayload } from "../mappers/cart";

type CartResponse = {
  success?: boolean;
  cart?: { items?: unknown[] };
};

function itemsFrom(response: CartResponse): CartItem[] {
  return mapBackendCartItems(response.cart?.items);
}

export async function fetchShopperCart(): Promise<CartItem[]> {
  const response = await apiRequest<CartResponse>("/api/shopper/cart", { auth: true });
  return itemsFrom(response);
}

export async function addShopperCartItem(input: AddToCartInput): Promise<CartItem[]> {
  const response = await apiRequest<CartResponse>("/api/shopper/cart/add", {
    method: "POST",
    auth: true,
    body: toCartAddPayload({
      productId: input.productId,
      quantity: input.quantity,
      options: input.options,
    }),
  });
  return itemsFrom(response);
}

export async function updateShopperCartQuantity(
  productId: string,
  quantity: number,
  variantKey?: string,
): Promise<CartItem[]> {
  const response = await apiRequest<CartResponse>("/api/shopper/cart/update-quantity", {
    method: "PUT",
    auth: true,
    body: { productId, quantity, variantKey },
  });
  return itemsFrom(response);
}

export async function removeShopperCartItem(
  productId: string,
  variantKey?: string,
): Promise<CartItem[]> {
  const response = await apiRequest<CartResponse>("/api/shopper/cart/remove", {
    method: "POST",
    auth: true,
    body: { productId, variantKey },
  });
  return itemsFrom(response);
}

export async function clearShopperCart(): Promise<CartItem[]> {
  const response = await apiRequest<CartResponse>("/api/shopper/cart", {
    method: "DELETE",
    auth: true,
  });
  return itemsFrom(response);
}
