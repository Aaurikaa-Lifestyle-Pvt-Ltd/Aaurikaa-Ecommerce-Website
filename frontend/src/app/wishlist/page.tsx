"use client";

import { useEffect, useState } from "react";
import { Container } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";
import { ProductCard } from "@/components/product";
import { useShopperAuth } from "@/lib/auth/shopper-provider";
import { ShopperAuthPanel } from "@/components/account/shopper-auth-panel";
import { ApiError } from "@/lib/api/errors";
import { fetchWishlist } from "@/lib/api/wishlist";
import type { Product } from "@/types/commerce";

export default function WishlistPage() {
  const { user, ready, configured } = useShopperAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready || !user || !configured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchWishlist()
      .then(setProducts)
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : "Unable to load wishlist.");
      })
      .finally(() => setLoading(false));
  }, [ready, user, configured]);

  if (!ready) {
    return (
      <div className="py-16">
        <Container>
          <p className="text-sm text-muted-foreground">Loading wishlist…</p>
        </Container>
      </div>
    );
  }

  if (!configured || !user) {
    return (
      <div className="py-16 sm:py-20">
        <Container>
          <div className="mx-auto max-w-lg">
            <p className="eyebrow mb-4">Wishlist</p>
            <ShopperAuthPanel title="Sign in to view wishlist" />
          </div>
        </Container>
      </div>
    );
  }

  return (
    <div className="pb-16 pt-8 sm:pb-20 sm:pt-10">
      <Container>
        <p className="eyebrow mb-3">Account</p>
        <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">Wishlist</h1>
        {error ? (
          <p className="mt-4 text-sm text-sale" role="alert">
            {error}
          </p>
        ) : null}
        {loading ? (
          <p className="mt-6 text-sm text-muted-foreground">Loading saved pieces…</p>
        ) : products.length === 0 ? (
          <div className="mt-8 max-w-lg">
            <p className="text-sm text-muted-foreground">Your wishlist is empty.</p>
            <div className="mt-6">
              <ButtonLink href="/collections/new-arrivals" variant="primary">
                Continue Shopping
              </ButtonLink>
            </div>
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                initialWishlisted
                onWishlistChange={(wishlisted) => {
                  if (!wishlisted) {
                    setProducts((prev) => prev.filter((item) => item.id !== product.id));
                  }
                }}
              />
            ))}
          </div>
        )}
      </Container>
    </div>
  );
}
