"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Money, Product, ProductVariant } from "@/types/commerce";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { StarDisplay } from "@/components/ui/star-rating";
import { useToast } from "@/components/ui/toast";
import {
  IconSecure,
  IconShipping,
  IconSupport,
} from "@/components/ui/icons";
import { useCart } from "@/components/cart";
import { useShopperAuth } from "@/lib/auth/shopper-provider";
import { writeBuyNowIntent } from "@/lib/buy-now";
import { createStockNotification } from "@/lib/api/stock-notifications";
import { fetchProductReviews } from "@/lib/api/reviews";
import { ApiError } from "@/lib/api/errors";
import { normalizeVariantKey } from "@/lib/mappers/helpers";
import { StructuredContent } from "@/components/product/structured-content";
import { hasMeaningfulRichText } from "@/lib/rich-text/rich-text-utils";
import {
  clampPurchasableQuantity,
  maxPurchasableQuantity,
} from "@/lib/product-quantity";

interface ProductPurchaseProps {
  product: Product;
}

/** Short assurance chips only — no invented thresholds, timelines, or policies. */
const PDP_ASSURANCES = [
  {
    id: "payments",
    label: "Secured Payments",
    Icon: IconSecure,
    iconClass: "bg-[#5a6f8c]/15 text-[#4a5f7a]",
  },
  {
    id: "delivery",
    label: "Faster Delivery",
    Icon: IconShipping,
    iconClass: "bg-accent/15 text-accent",
  },
  {
    id: "support",
    label: "Helpful Support",
    Icon: IconSupport,
    iconClass: "bg-[#5c7a6a]/15 text-[#4f6b5c]",
  },
] as const;

function discountPercent(price: Money, compareAt?: Money): number {
  if (!compareAt || compareAt.amount <= price.amount) return 0;
  return Math.round((1 - price.amount / compareAt.amount) * 100);
}

function optionKeys(variants: ProductVariant[]): string[] {
  const keys = new Set<string>();
  for (const variant of variants) {
    for (const key of Object.keys(variant.options)) keys.add(key);
  }
  return [...keys];
}

function valuesForKey(variants: ProductVariant[], key: string): string[] {
  const values: string[] = [];
  for (const variant of variants) {
    const value = variant.options[key];
    if (value && !values.includes(value)) values.push(value);
  }
  return values;
}

function findVariant(
  variants: ProductVariant[],
  selected: Record<string, string>,
): ProductVariant | undefined {
  return variants.find((variant) =>
    Object.entries(selected).every(
      ([key, value]) => variant.options[key] === value,
    ),
  );
}

/**
 * PDP purchase column: badge, title, price, variants, qty, ATC / Buy Now,
 * and a simple sticky mobile purchase bar.
 */
export function ProductPurchase({ product }: ProductPurchaseProps) {
  const router = useRouter();
  const { addItem, openCart, busy: cartBusy } = useCart();
  const { user, ready: authReady } = useShopperAuth();
  const toast = useToast();
  const variants = product.variants;
  const hasVariants = Boolean(variants && variants.length > 0);
  const keys = useMemo(
    () => (variants ? optionKeys(variants) : []),
    [variants],
  );

  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>(
    () => {
      if (!variants || variants.length === 0) return {};
      const firstInStock = variants.find((v) => v.inStock) ?? variants[0];
      return { ...firstInStock.options };
    },
  );
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [notifyStatus, setNotifyStatus] = useState<
    "idle" | "loading" | "success" | "exists" | "error"
  >("idle");
  const [notifyMessage, setNotifyMessage] = useState<string | null>(null);
  const [reviewAvgRating, setReviewAvgRating] = useState<number | null>(
    product.avgRating ?? null,
  );
  const [reviewCount, setReviewCount] = useState<number | null>(
    product.reviewCount ?? null,
  );

  useEffect(() => {
    let cancelled = false;
    void fetchProductReviews(product.id)
      .then((payload) => {
        if (cancelled) return;
        setReviewAvgRating(payload.summary.avgRating);
        setReviewCount(payload.summary.reviewCount);
      })
      .catch(() => {
        /* Keep catalogue seed on fetch failure */
      });
    return () => {
      cancelled = true;
    };
  }, [product.id]);

  const selectedVariant = hasVariants
    ? findVariant(variants!, selectedOptions)
    : undefined;

  const price = selectedVariant?.price ?? product.price;
  const compareAt = selectedVariant?.compareAtPrice ?? product.compareAtPrice;
  const inStock = hasVariants
    ? Boolean(selectedVariant?.inStock)
    : product.inStock;
  const soldOut = !inStock;
  const badge = soldOut ? "sold-out" : product.badge;
  const pct = discountPercent(price, compareAt);

  const maxQty = maxPurchasableQuantity({
    hasVariants,
    selectedVariantStock: selectedVariant?.stock,
    productStock: product.stock,
  });

  useEffect(() => {
    setQuantity((prev) => clampPurchasableQuantity(prev, maxQty));
  }, [maxQty]);

  function selectOption(key: string, value: string) {
    setSelectedOptions((prev) => ({ ...prev, [key]: value }));
    setAdded(false);
  }

  function setQty(next: number) {
    setQuantity(clampPurchasableQuantity(next, maxQty));
    setAdded(false);
  }

  function handleAddToCart() {
    if (soldOut) return;
    if (hasVariants && !selectedVariant) return;

    addItem({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      image: product.image,
      quantity,
      price,
      compareAtPrice: compareAt,
      variantId: selectedVariant?.id,
      variantTitle: selectedVariant?.title,
      options: selectedVariant?.options,
      ...(typeof product.taxIncluded === "boolean"
        ? { taxIncluded: product.taxIncluded }
        : {}),
    });
    setAdded(true);
    openCart();
  }

  function handleBuyNow() {
    if (soldOut) return;
    if (hasVariants && !selectedVariant) return;
    const variantKey =
      selectedVariant?.id ||
      (selectedVariant?.options
        ? normalizeVariantKey(selectedVariant.options) ?? undefined
        : undefined);
    writeBuyNowIntent({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      image: product.image,
      quantity,
      variantKey,
      variantTitle: selectedVariant?.title,
      options: selectedVariant?.options,
    });
    router.push("/checkout?source=buy-now");
  }

  async function handleNotifyMe() {
    if (!soldOut) return;
    if (!user) {
      setNotifyStatus("idle");
      setNotifyMessage(null);
      router.push("/account");
      return;
    }
    if (hasVariants && !selectedVariant) {
      setNotifyStatus("error");
      setNotifyMessage("Select options before requesting a notification.");
      return;
    }

    setNotifyStatus("loading");
    setNotifyMessage(null);
    try {
      const result = await createStockNotification({
        productId: product.id,
        variantCombination:
          hasVariants && selectedVariant?.options
            ? selectedVariant.options
            : undefined,
      });
      if (result.alreadyExists) {
        setNotifyStatus("exists");
        setNotifyMessage(result.message);
        toast.info("Already subscribed", result.message);
      } else {
        setNotifyStatus("success");
        setNotifyMessage(result.message);
        toast.success("We'll notify you", result.message);
      }
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unable to save your notification request.";
      setNotifyStatus("error");
      setNotifyMessage(message);
      toast.error("Could not save notification", message);
    }
  }

  const addLabel = soldOut
    ? "Sold Out"
    : hasVariants && !selectedVariant
      ? "Select options"
      : cartBusy
        ? "Adding…"
        : added
          ? "Added to Bag"
          : "Add to Bag";

  const canAdd = !soldOut && (!hasVariants || Boolean(selectedVariant)) && !cartBusy;

  return (
    <div className="flex flex-col">
      {badge ? (
        <div className="mb-3">
          <Badge badge={badge} />
        </div>
      ) : null}

      <h1 className="font-serif text-[1.65rem] leading-snug tracking-tight text-balance sm:text-2xl lg:text-[1.7rem] xl:text-[1.85rem]">
        {product.name}
      </h1>

      {product.sku || selectedVariant?.sku ? (
        <p className="mt-1.5 text-xs tracking-wide text-muted-foreground">
          SKU {selectedVariant?.sku || product.sku}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-baseline gap-2.5">
        <span className={cn("text-xl", soldOut && "text-muted-foreground")}>
          {formatMoney(price)}
        </span>
        {pct > 0 && compareAt ? (
          <>
            <span className="text-sm text-muted-foreground line-through">
              {formatMoney(compareAt)}
            </span>
            <span className="text-sm font-medium text-sale">{pct}% off</span>
          </>
        ) : null}
      </div>
      {typeof product.taxIncluded === "boolean" ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {product.taxIncluded
            ? "All Taxes Included"
            : "Taxes Extra"}
        </p>
      ) : null}

      {hasMeaningfulRichText(product.shortDescription) ? (
        <StructuredContent
          content={product.shortDescription}
          className="structured-content mt-4 w-full space-y-1"
        />
      ) : null}

      {soldOut ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-medium text-muted-foreground" role="status">
            This product is currently unavailable.
          </p>
          {!authReady ? null : !user ? (
            <p className="text-sm text-muted-foreground">
              <Link
                href="/account"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                Sign in
              </Link>{" "}
              to get notified when it is back in stock.
            </p>
          ) : (
            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                size="md"
                disabled={notifyStatus === "loading" || (hasVariants && !selectedVariant)}
                onClick={handleNotifyMe}
              >
                {notifyStatus === "loading" ? (
                  <>
                    <Spinner /> Saving…
                  </>
                ) : notifyStatus === "success" || notifyStatus === "exists" ? (
                  "Notification saved"
                ) : (
                  "Notify me"
                )}
              </Button>
              {notifyMessage ? (
                <p
                  className={cn(
                    "text-sm",
                    notifyStatus === "error" ? "text-sale" : "text-muted-foreground",
                  )}
                  role={notifyStatus === "error" ? "alert" : "status"}
                >
                  {notifyMessage}
                </p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {hasVariants && variants
        ? keys.map((key) => (
            <fieldset key={key} className="mt-8">
              <legend className="mb-3 text-sm font-medium">
                {key}
                {selectedOptions[key] ? (
                  <span className="ml-2 font-normal text-muted-foreground">
                    {selectedOptions[key]}
                  </span>
                ) : null}
              </legend>
              <div className="flex flex-wrap gap-2">
                {valuesForKey(variants, key).map((value) => {
                  const candidate = findVariant(variants, {
                    ...selectedOptions,
                    [key]: value,
                  });
                  const unavailable = candidate ? !candidate.inStock : false;
                  const active = selectedOptions[key] === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        if (unavailable) return;
                        selectOption(key, value);
                      }}
                      aria-pressed={active}
                      aria-disabled={unavailable}
                      disabled={unavailable}
                      className={cn(
                        "min-h-11 min-w-11 rounded-control border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active
                          ? "border-foreground bg-foreground text-background"
                          : "border-border bg-surface text-foreground hover:border-foreground/50",
                        unavailable &&
                          "cursor-not-allowed opacity-45 line-through hover:border-border",
                      )}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))
        : null}

      <div className="mt-8">
        <p className="mb-3 text-sm font-medium">Quantity</p>
        <div className="inline-flex items-center rounded-control border border-border">
          <button
            type="button"
            aria-label="Decrease quantity"
            disabled={quantity <= 1 || soldOut}
            onClick={() => setQty(quantity - 1)}
            className="inline-grid h-11 w-11 place-items-center text-lg transition-colors hover:bg-muted disabled:opacity-40"
          >
            −
          </button>
          <span
            className="min-w-10 text-center text-sm tabular-nums"
            aria-live="polite"
          >
            {quantity}
          </span>
          <button
            type="button"
            aria-label="Increase quantity"
            disabled={soldOut || (maxQty != null && quantity >= maxQty)}
            onClick={() => setQty(quantity + 1)}
            className="inline-grid h-11 w-11 place-items-center text-lg transition-colors hover:bg-muted disabled:opacity-40"
          >
            +
          </button>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button
          type="button"
          variant="primary"
          size="lg"
          className="w-full sm:flex-1"
          disabled={!canAdd}
          onClick={handleAddToCart}
          aria-live="polite"
        >
          {cartBusy ? (
            <>
              <Spinner /> Adding…
            </>
          ) : (
            addLabel
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full sm:flex-1"
          disabled={!canAdd}
          onClick={handleBuyNow}
        >
          Buy Now
        </Button>
      </div>

      <ul className="mt-8 grid grid-cols-3 gap-2 border-t border-border pt-6 sm:gap-3">
        {PDP_ASSURANCES.map(({ id, label, Icon, iconClass }) => (
          <li
            key={id}
            className="flex flex-col items-center gap-2 rounded-card bg-muted/50 px-2 py-3 text-center"
          >
            <span
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-full",
                iconClass,
              )}
              aria-hidden
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="text-[11px] font-medium leading-snug text-foreground sm:text-xs">
              {label}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-sm text-muted-foreground">
        <Link
          href={`/contact?product=${encodeURIComponent(product.slug)}`}
          className="underline-offset-4 hover:text-foreground hover:underline"
        >
          Ask about this product
        </Link>
      </p>

      {/* Sticky mobile purchase bar */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 lg:hidden">
        <div className="pointer-events-auto border-t border-border bg-background/95 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/90">
          <div className="mx-auto flex max-w-[1280px] items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{product.name}</p>
              <p className="text-sm text-muted-foreground">
                {formatMoney(price)}
              </p>
            </div>
            <Button
              type="button"
              variant="primary"
              size="md"
              className="shrink-0"
              disabled={!canAdd}
              onClick={handleAddToCart}
            >
              {soldOut ? "Sold Out" : added ? "Added" : "Add to Bag"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="md"
              className="shrink-0"
              disabled={!canAdd}
              onClick={handleBuyNow}
            >
              Buy Now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
