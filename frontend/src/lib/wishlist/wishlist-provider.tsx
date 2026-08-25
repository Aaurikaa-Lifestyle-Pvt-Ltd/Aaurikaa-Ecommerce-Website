"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useShopperAuth } from "@/lib/auth/shopper-provider";
import {
  clearWishlistIdCache,
  fetchWishlistProductIds,
} from "@/lib/api/wishlist";

type WishlistContextValue = {
  /** Authenticated wishlist size; 0 when guest or not yet loaded. */
  count: number;
  ready: boolean;
  refresh: () => Promise<void>;
  /** Optimistic / post-mutation sync after add. */
  onAdded: (productId: string) => void;
  /** Optimistic / post-mutation sync after remove. */
  onRemoved: (productId: string) => void;
};

const WishlistContext = createContext<WishlistContextValue | null>(null);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { user, ready: authReady } = useShopperAuth();
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      clearWishlistIdCache();
      setIds(new Set());
      setReady(true);
      return;
    }
    try {
      const next = await fetchWishlistProductIds();
      setIds(new Set(next));
    } catch {
      /* keep last known count on soft failure */
    } finally {
      setReady(true);
    }
  }, [user]);

  useEffect(() => {
    if (!authReady) return;
    setReady(false);
    void refresh();
  }, [authReady, user?.id, refresh]);

  const onAdded = useCallback((productId: string) => {
    setIds((prev) => {
      if (prev.has(productId)) return prev;
      const next = new Set(prev);
      next.add(productId);
      return next;
    });
  }, []);

  const onRemoved = useCallback((productId: string) => {
    setIds((prev) => {
      if (!prev.has(productId)) return prev;
      const next = new Set(prev);
      next.delete(productId);
      return next;
    });
  }, []);

  const value = useMemo<WishlistContextValue>(
    () => ({
      count: user ? ids.size : 0,
      ready: authReady && ready,
      refresh,
      onAdded,
      onRemoved,
    }),
    [user, ids, authReady, ready, refresh, onAdded, onRemoved],
  );

  return (
    <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>
  );
}

export function useWishlist(): WishlistContextValue {
  const ctx = useContext(WishlistContext);
  if (!ctx) {
    throw new Error("useWishlist must be used within WishlistProvider");
  }
  return ctx;
}
