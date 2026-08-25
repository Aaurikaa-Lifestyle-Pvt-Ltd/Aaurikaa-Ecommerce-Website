import type { ProductImage } from "@/types/commerce";

export const BUY_NOW_STORAGE_KEY = "aaurikaa.checkout.intent.v1";

export type BuyNowLine = {
  productId: string;
  slug: string;
  name: string;
  image: ProductImage;
  quantity: number;
  variantKey?: string;
  variantTitle?: string;
  options?: Record<string, string>;
};

export type BuyNowIntent = {
  source: "buy-now";
  createdAt: string;
  line: BuyNowLine;
};

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function memoryStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function createBuyNowIntent(line: BuyNowLine): BuyNowIntent {
  return {
    source: "buy-now",
    createdAt: new Date().toISOString(),
    line: {
      ...line,
      quantity: Math.max(1, Math.floor(Number(line.quantity) || 1)),
      productId: String(line.productId),
    },
  };
}

export function writeBuyNowIntent(
  line: BuyNowLine,
  storage: StorageLike | null = memoryStorage(),
): BuyNowIntent {
  const intent = createBuyNowIntent(line);
  if (!storage) return intent;
  storage.setItem(BUY_NOW_STORAGE_KEY, JSON.stringify(intent));
  return intent;
}

export function readBuyNowIntent(
  storage: StorageLike | null = memoryStorage(),
): BuyNowIntent | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(BUY_NOW_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BuyNowIntent;
    if (parsed?.source !== "buy-now" || !parsed.line?.productId) return null;
    if (!Number.isFinite(parsed.line.quantity) || parsed.line.quantity < 1) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearBuyNowIntent(
  storage: StorageLike | null = memoryStorage(),
): void {
  storage?.removeItem(BUY_NOW_STORAGE_KEY);
}
