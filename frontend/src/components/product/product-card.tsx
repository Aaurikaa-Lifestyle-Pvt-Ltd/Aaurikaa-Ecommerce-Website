"use client";

import { useEffect, useState, type MouseEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Product } from "@/types/commerce";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { IconHeart } from "@/components/ui/icons";
import { useCart } from "@/components/cart";
import { isRemoteSrc } from "@/lib/mappers/media";
import { useShopperAuth } from "@/lib/auth/shopper-provider";
import { useWishlist } from "@/lib/wishlist/wishlist-provider";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import {
  addWishlistProduct,
  isProductWishlisted,
  removeWishlistProduct,
} from "@/lib/api/wishlist";
import { ApiError } from "@/lib/api/errors";

interface ProductCardProps {
  product: Product;
  /** Reveal the quick-add control on hover/focus. */
  quickAdd?: boolean;
  /** Sizes hint for the responsive image. */
  sizes?: string;
  className?: string;
  /** Seed the heart when the product is already on the wishlist. */
  initialWishlisted?: boolean;
  /** Notified after a successful add/remove (or optimistic guest deny). */
  onWishlistChange?: (wishlisted: boolean) => void;
}

const DEFAULT_SIZES =
  "(min-width: 768px) 23vw, (min-width: 640px) 46vw, 72vw";

/**
 * ProductCard (brief §15/§32) — the shared, image-first product tile used across
 * merchandising, listing, search, wishlist and recommendations.
 *
 * Industry-neutral: it only knows the generic `Product` shape. Interactions are
 * intentionally restrained (image carries the weight; controls reveal on hover).
 *
 * Quick Add uses the shared CartProvider — no separate cart path. Products that
 * require a variant selection navigate to the PDP instead of guessing a variant.
 */
export function ProductCard({
  product,
  quickAdd = true,
  sizes = DEFAULT_SIZES,
  className,
  initialWishlisted = false,
  onWishlistChange,
}: ProductCardProps) {
  const router = useRouter();
  const { addItem, openCart } = useCart();
  const { user, ready } = useShopperAuth();
  const { onAdded, onRemoved } = useWishlist();
  const toast = useToast();
  const [wishlisted, setWishlisted] = useState(initialWishlisted);
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const [guestPrompt, setGuestPrompt] = useState(false);
  const [wishlistError, setWishlistError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => {
    setWishlisted(initialWishlisted);
  }, [initialWishlisted, product.id]);

  useEffect(() => {
    if (!ready || !user || initialWishlisted) return;
    let cancelled = false;
    isProductWishlisted(product.id)
      .then((yes) => {
        if (!cancelled && yes) setWishlisted(true);
      })
      .catch(() => {
        /* hydrate is best-effort */
      });
    return () => {
      cancelled = true;
    };
  }, [ready, user, product.id, initialWishlisted]);

  const soldOut = !product.inStock;
  // Out-of-stock always wins the badge slot; otherwise use the product badge.
  const badge = soldOut ? "sold-out" : product.badge;
  const requiresVariant = Boolean(
    product.variants && product.variants.length > 0,
  );

  const hasDiscount =
    product.compareAtPrice != null &&
    product.compareAtPrice.amount > product.price.amount;
  const discountPct = hasDiscount
    ? Math.round(
        (1 - product.price.amount / product.compareAtPrice!.amount) * 100,
      )
    : 0;

  const href = `/products/${product.slug}`;

  function handleQuickAdd(e: MouseEvent<HTMLButtonElement>) {
    // Stretched title link covers the card — keep Quick Add independent.
    e.preventDefault();
    e.stopPropagation();
    if (soldOut) return;

    if (requiresVariant) {
      router.push(href);
      return;
    }

    addItem({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      image: product.image,
      quantity: 1,
      price: product.price,
      compareAtPrice: product.compareAtPrice,
      ...(typeof product.taxIncluded === "boolean"
        ? { taxIncluded: product.taxIncluded }
        : {}),
    });
    setJustAdded(true);
    openCart();
  }

  async function handleWishlistToggle(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    setWishlistError(null);

    if (!ready) return;

    if (!user) {
      setGuestPrompt(true);
      toast.info("Sign in to save items", "Wishlist is available on your account.");
      return;
    }

    if (wishlistBusy) return;

    const next = !wishlisted;
    setWishlisted(next);
    setWishlistBusy(true);
    try {
      if (next) {
        await addWishlistProduct(product.id);
        onAdded(product.id);
        toast.success("Saved to wishlist");
      } else {
        await removeWishlistProduct(product.id);
        onRemoved(product.id);
        toast.success("Removed from wishlist");
      }
      onWishlistChange?.(next);
    } catch (err: unknown) {
      setWishlisted(!next);
      const message =
        err instanceof ApiError ? err.message : "Unable to update wishlist.";
      setWishlistError(message);
      toast.error("Wishlist update failed", message);
    } finally {
      setWishlistBusy(false);
    }
  }

  return (
    <article className={cn("group relative flex flex-col", className)}>
      <div className="relative aspect-[4/5] overflow-hidden rounded-card bg-muted">
        <Image
          src={product.image.src}
          alt={product.image.alt}
          fill
          sizes={sizes}
          unoptimized={isRemoteSrc(product.image.src)}
          className={cn(
            "object-cover transition-opacity duration-500",
            product.hoverImage && "group-hover:opacity-0",
          )}
        />
        {product.hoverImage ? (
          <Image
            src={product.hoverImage.src}
            alt=""
            aria-hidden
            fill
            sizes={sizes}
            unoptimized={isRemoteSrc(product.hoverImage.src)}
            className="object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          />
        ) : null}

        {badge ? (
          <div className="absolute left-3 top-3 z-10">
            <Badge badge={badge} />
          </div>
        ) : null}

        <button
          type="button"
          onClick={(e) => void handleWishlistToggle(e)}
          disabled={wishlistBusy}
          aria-pressed={wishlisted}
          aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
          className="absolute right-3 top-3 z-10 inline-grid h-9 w-9 place-items-center rounded-full bg-surface/80 text-foreground backdrop-blur transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          {wishlistBusy ? (
            <Spinner className="h-3.5 w-3.5" label="Updating wishlist" />
          ) : (
            <IconHeart
              className={cn("h-5 w-5", wishlisted && "text-sale")}
              fill={wishlisted ? "currentColor" : "none"}
            />
          )}
        </button>

        {quickAdd && !soldOut ? (
          <div className="absolute inset-x-3 bottom-3 z-10 translate-y-2 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
            <button
              type="button"
              onClick={handleQuickAdd}
              aria-label={
                requiresVariant
                  ? `Select options for ${product.name}`
                  : `Quick add ${product.name} to bag`
              }
              className="relative z-10 h-10 w-full rounded-control bg-primary text-xs font-medium uppercase tracking-[0.12em] text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {requiresVariant
                ? "Select Options"
                : justAdded
                  ? "Added"
                  : "Quick Add"}
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-col gap-1">
        <h3 className="text-sm font-medium leading-snug">
          <Link
            href={href}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            <span className="line-clamp-1">{product.name}</span>
          </Link>
        </h3>
        <div className="flex items-center justify-between gap-2 text-sm">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className={cn(soldOut && "text-muted-foreground")}>
              {formatMoney(product.price)}
            </span>
            {hasDiscount ? (
              <>
                <span className="text-xs text-muted-foreground line-through">
                  {formatMoney(product.compareAtPrice!)}
                </span>
                <span className="text-xs font-medium text-sale">
                  {discountPct}% off
                </span>
              </>
            ) : null}
          </div>
          {product.reviewCount != null &&
          product.reviewCount > 0 &&
          product.avgRating != null ? (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums"
              aria-label={`Rating ${product.avgRating.toFixed(1)} from ${product.reviewCount} ${product.reviewCount === 1 ? "review" : "reviews"}`}
            >
              <span className="leading-none text-accent" aria-hidden>
                ★
              </span>
              <span className="font-medium text-foreground">
                {product.avgRating.toFixed(1)}
              </span>
              <span className="text-muted-foreground">
                ({product.reviewCount})
              </span>
            </span>
          ) : null}
        </div>
        {product.taxIncluded === true ? (
          <p className="text-xs text-muted-foreground">(Inclusive of all taxes)</p>
        ) : product.taxIncluded === false ? (
          <p className="text-xs text-muted-foreground">Taxes Extra</p>
        ) : null}
        {guestPrompt ? (
          <p className="relative z-20 text-xs text-muted-foreground">
            <Link href="/account" className="underline-offset-4 hover:underline">
              Sign in
            </Link>{" "}
            to save this piece.
          </p>
        ) : null}
        {wishlistError ? (
          <p className="relative z-20 text-xs text-sale" role="alert">
            {wishlistError}
          </p>
        ) : null}
      </div>
    </article>
  );
}
