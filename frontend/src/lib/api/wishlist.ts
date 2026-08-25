import type { Product } from "@/types/commerce";
import { apiRequest } from "./client";
import { mapBackendProduct, type BackendProduct } from "../mappers/product";

function mapList(raw: unknown): Product[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => mapBackendProduct(item as BackendProduct))
    .filter((item): item is Product => Boolean(item));
}

let wishlistIdCache: Set<string> | null = null;
let wishlistIdInflight: Promise<Set<string>> | null = null;

export function clearWishlistIdCache(): void {
  wishlistIdCache = null;
  wishlistIdInflight = null;
}

function rememberIds(products: Product[]): Set<string> {
  const ids = new Set(products.map((product) => product.id).filter(Boolean));
  wishlistIdCache = ids;
  return ids;
}

/**
 * Single-flight GET wishlist → product id set for hydrating hearts across cards.
 */
export async function fetchWishlistProductIds(): Promise<Set<string>> {
  if (wishlistIdCache) return wishlistIdCache;
  if (wishlistIdInflight) return wishlistIdInflight;

  wishlistIdInflight = fetchWishlist()
    .then((products) => rememberIds(products))
    .catch((error: unknown) => {
      wishlistIdInflight = null;
      throw error;
    })
    .finally(() => {
      wishlistIdInflight = null;
    });

  return wishlistIdInflight;
}

export async function isProductWishlisted(productId: string): Promise<boolean> {
  const ids = await fetchWishlistProductIds();
  return ids.has(productId);
}

export async function fetchWishlist(): Promise<Product[]> {
  const response = await apiRequest<unknown>("/api/shopper/wishlist", { auth: true });
  const products = mapList(response);
  rememberIds(products);
  return products;
}

export async function addWishlistProduct(productId: string): Promise<Product[]> {
  const response = await apiRequest<{ wishlist?: unknown }>("/api/shopper/wishlist/add", {
    method: "POST",
    auth: true,
    body: { productId },
  });
  const products = mapList(response.wishlist);
  if (products.length > 0) {
    rememberIds(products);
  } else if (wishlistIdCache) {
    wishlistIdCache.add(productId);
  } else {
    wishlistIdCache = new Set([productId]);
  }
  return products;
}

export async function removeWishlistProduct(productId: string): Promise<Product[]> {
  const response = await apiRequest<{ wishlist?: unknown }>("/api/shopper/wishlist/remove", {
    method: "POST",
    auth: true,
    body: { productId },
  });
  const products = mapList(response.wishlist);
  if (products.length > 0 || Array.isArray(response.wishlist)) {
    rememberIds(products);
  } else if (wishlistIdCache) {
    wishlistIdCache.delete(productId);
  }
  return products;
}
