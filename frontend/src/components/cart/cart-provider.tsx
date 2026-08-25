"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { AddToCartInput, CartItem } from "@/types/cart";
import type { Money } from "@/types/commerce";
import {
  addCartItem,
  cartItemCount,
  cartLineCount,
  cartSubtotal,
  parseCartLineId,
  removeCartItem,
  setCartItemQuantity,
} from "@/lib/cart";
import {
  getCartReadySnapshot,
  getCartSnapshot,
  getServerCartReadySnapshot,
  getServerCartSnapshot,
  replaceCartItems,
  subscribeCart,
} from "@/lib/cart-store";
import { useShopperAuth } from "@/lib/auth/shopper-provider";
import {
  addShopperCartItem,
  clearShopperCart,
  fetchShopperCart,
  removeShopperCartItem,
  updateShopperCartQuantity,
} from "@/lib/api/cart";
import {
  guestLinesAddedSince,
  guestLinesToCartAdds,
} from "@/lib/guest-cart-merge";
import { formatCommerceApiError } from "@/lib/commerce-errors";
import { useToast } from "@/components/ui/toast";

interface CartContextValue {
  items: CartItem[];
  /** False until localStorage has been read (avoids hydration mismatch). */
  ready: boolean;
  itemCount: number;
  lineCount: number;
  subtotal: Money;
  isOpen: boolean;
  busy: boolean;
  error: string | null;
  source: "local" | "server";
  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
  addItem: (input: AddToCartInput) => void;
  setQuantity: (lineId: string, quantity: number) => void;
  removeItem: (lineId: string) => void;
  clearCart: () => void;
  /** Re-fetch server cart after external mutations (e.g. Buy Again). */
  refreshCart: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, ready: authReady } = useShopperAuth();
  const toast = useToast();
  const items = useSyncExternalStore(
    subscribeCart,
    getCartSnapshot,
    getServerCartSnapshot,
  );
  const ready = useSyncExternalStore(
    subscribeCart,
    getCartReadySnapshot,
    getServerCartReadySnapshot,
  );
  const [isOpen, setIsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const serverCart = Boolean(user);
  /** undefined = auth not resolved yet; null = guest; string = shopper id */
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  /** Bag snapshot at logout — used so re-login only merges new guest adds. */
  const bagAtLogoutRef = useRef<CartItem[] | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!authReady || !ready) return;

    const nextUserId = user?.id ?? null;
    const prevUserId = prevUserIdRef.current;

    if (!user) {
      if (prevUserId) {
        bagAtLogoutRef.current = getCartSnapshot();
      }
      prevUserIdRef.current = null;
      return;
    }

    // Merge guest bag only on guest → login, never on session restore / refresh.
    const justLoggedIn = prevUserId === null && nextUserId !== null;
    prevUserIdRef.current = nextUserId;

    let cancelled = false;
    const guestSnapshot = justLoggedIn
      ? guestLinesAddedSince(bagAtLogoutRef.current, getCartSnapshot())
      : [];
    if (justLoggedIn) {
      bagAtLogoutRef.current = null;
    }

    const id = window.setTimeout(() => {
      void (async () => {
        setBusy(true);
        try {
          if (justLoggedIn && guestSnapshot.length > 0) {
            const adds = guestLinesToCartAdds(guestSnapshot);
            for (const line of adds) {
              if (cancelled) return;
              try {
                await addShopperCartItem({
                  productId: line.productId,
                  quantity: line.quantity,
                  options: line.options,
                  slug: "",
                  name: "",
                  image: { src: "", alt: "" },
                  price: { amount: 0, currency: "INR" },
                });
              } catch {
                // Best-effort merge — continue remaining lines.
              }
            }
          }

          if (cancelled) return;
          const next = await fetchShopperCart();
          if (!cancelled) {
            replaceCartItems(next);
            setError(null);
          }
        } catch (err: unknown) {
          if (cancelled) return;
          setError(formatCommerceApiError(err, "Unable to load your bag."));
        } finally {
          if (!cancelled) setBusy(false);
        }
      })();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [authReady, ready, user]);

  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);
  const toggleCart = useCallback(() => setIsOpen((v) => !v), []);

  const runServer = useCallback(async (op: () => Promise<CartItem[]>, successMessage?: string) => {
    setBusy(true);
    setError(null);
    try {
      const next = await op();
      replaceCartItems(next);
      if (successMessage) toast.success(successMessage);
    } catch (err: unknown) {
      const message = formatCommerceApiError(err, "Unable to update your bag.");
      setError(message);
      toast.error("Bag update failed", message);
    } finally {
      setBusy(false);
    }
  }, [toast]);

  const addItem = useCallback(
    (input: AddToCartInput) => {
      if (serverCart) {
        void runServer(
          () => addShopperCartItem(input).then(() => fetchShopperCart()),
          "Added to bag",
        );
        return;
      }
      replaceCartItems((prev) => addCartItem(prev, input));
      toast.success("Added to bag");
    },
    [runServer, serverCart, toast],
  );

  const setQuantity = useCallback(
    (lineId: string, quantity: number) => {
      if (serverCart) {
        const { productId, variantKey } = parseCartLineId(lineId);
        void runServer(() =>
          updateShopperCartQuantity(productId, quantity, variantKey).then(() =>
            fetchShopperCart(),
          ),
        );
        return;
      }
      replaceCartItems((prev) => setCartItemQuantity(prev, lineId, quantity));
    },
    [runServer, serverCart],
  );

  const removeItem = useCallback(
    (lineId: string) => {
      if (serverCart) {
        const { productId, variantKey } = parseCartLineId(lineId);
        void runServer(
          () => removeShopperCartItem(productId, variantKey).then(() => fetchShopperCart()),
          "Removed from bag",
        );
        return;
      }
      replaceCartItems((prev) => removeCartItem(prev, lineId));
      toast.success("Removed from bag");
    },
    [runServer, serverCart, toast],
  );

  const clearCart = useCallback(() => {
    if (serverCart) {
      void runServer(() => clearShopperCart().then(() => fetchShopperCart()), "Bag cleared");
      return;
    }
    replaceCartItems([]);
    toast.success("Bag cleared");
  }, [runServer, serverCart, toast]);

  const refreshCart = useCallback(async () => {
    if (!serverCart) return;
    setBusy(true);
    try {
      const next = await fetchShopperCart();
      replaceCartItems(next);
      setError(null);
    } catch (err: unknown) {
      const message = formatCommerceApiError(err, "Unable to refresh your bag.");
      setError(message);
    } finally {
      setBusy(false);
    }
  }, [serverCart]);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      ready: ready && authReady,
      itemCount: cartItemCount(items),
      lineCount: cartLineCount(items),
      subtotal: cartSubtotal(items),
      isOpen,
      busy,
      error,
      source: serverCart ? "server" : "local",
      openCart,
      closeCart,
      toggleCart,
      addItem,
      setQuantity,
      removeItem,
      clearCart,
      refreshCart,
    }),
    [
      items,
      ready,
      authReady,
      isOpen,
      busy,
      error,
      serverCart,
      openCart,
      closeCart,
      toggleCart,
      addItem,
      setQuantity,
      removeItem,
      clearCart,
      refreshCart,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used within CartProvider");
  }
  return ctx;
}
