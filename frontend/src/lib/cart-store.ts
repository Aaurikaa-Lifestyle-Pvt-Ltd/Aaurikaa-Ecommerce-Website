import type { CartItem } from "@/types/cart";
import { CART_STORAGE_KEY } from "@/lib/cart";

/**
 * Minimal in-memory cart store with localStorage sync.
 * Consumed via useSyncExternalStore so hydration stays mismatch-safe.
 */

const EMPTY: CartItem[] = [];
const listeners = new Set<() => void>();

let items: CartItem[] = EMPTY;
let ready = false;
let hydrateScheduled = false;

function emit() {
  for (const listener of listeners) listener();
}

function persist(next: CartItem[]) {
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota / private-mode failures in the demo.
  }
}

function readStoredCart(): CartItem[] {
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return EMPTY;
    const valid = parsed.filter(
      (item): item is CartItem =>
        Boolean(
          item &&
            typeof item === "object" &&
            "id" in item &&
            "productId" in item &&
            "quantity" in item,
        ),
    );
    return valid.length === 0 ? EMPTY : valid;
  } catch {
    return EMPTY;
  }
}

function hydrateFromStorage() {
  if (ready || typeof window === "undefined") return;
  items = readStoredCart();
  ready = true;
  emit();
}

export function subscribeCart(listener: () => void) {
  listeners.add(listener);

  // Defer hydration so the first client snapshot still matches the server
  // empty snapshot, then notify subscribers once storage is read.
  if (typeof window !== "undefined" && !ready && !hydrateScheduled) {
    hydrateScheduled = true;
    queueMicrotask(hydrateFromStorage);
  }

  return () => {
    listeners.delete(listener);
  };
}

export function getCartSnapshot(): CartItem[] {
  return items;
}

export function getServerCartSnapshot(): CartItem[] {
  return EMPTY;
}

export function getCartReadySnapshot(): boolean {
  return ready;
}

export function getServerCartReadySnapshot(): boolean {
  return false;
}

export function replaceCartItems(
  next: CartItem[] | ((prev: CartItem[]) => CartItem[]),
) {
  const resolved = typeof next === "function" ? next(items) : next;
  items = resolved.length === 0 ? EMPTY : resolved;
  ready = true;
  if (typeof window !== "undefined") persist(items);
  emit();
}
