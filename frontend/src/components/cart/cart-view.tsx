"use client";

import Link from "next/link";
import { Container } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";
import { useCart } from "./cart-provider";
import { CartLineItem } from "./cart-line-item";
import { CartSummary } from "./cart-summary";

/**
 * Full cart page body (client) — populated table-like layout on desktop,
 * stacked lines on mobile, polished empty state.
 * Coupons are entered at checkout (server pricing quote) — not on the bag.
 */
export function CartView() {
  const { items, itemCount, ready, error, source } = useCart();

  if (!ready) {
    return (
      <div className="py-16 sm:py-20">
        <Container>
          <p className="text-sm text-muted-foreground">Loading your bag…</p>
        </Container>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="py-20 sm:py-28">
        <Container>
          <div className="mx-auto max-w-lg text-center">
            <p className="eyebrow mb-4">Bag</p>
            <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">
              Your bag is empty
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
              Discover pieces made to complete your look.
            </p>
            <div className="mt-8">
              <ButtonLink
                href="/collections/new-arrivals"
                variant="primary"
                size="md"
              >
                Continue Shopping
              </ButtonLink>
            </div>
          </div>
        </Container>
      </div>
    );
  }

  return (
    <div className="pb-16 pt-8 sm:pb-20 sm:pt-10">
      <Container>
        <header className="mb-8 sm:mb-10">
          <p className="eyebrow mb-3">Cart</p>
          <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">
            Your Bag
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {itemCount} {itemCount === 1 ? "item" : "items"}
            {source === "server" ? " · Prices from the bag on your account" : ""}
          </p>
          {error ? (
            <p className="mt-3 text-sm text-sale" role="alert">
              {error}
            </p>
          ) : null}
        </header>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-14 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <div className="mb-4 hidden grid-cols-[104px_1fr_auto_auto] gap-4 border-b border-border pb-3 text-xs uppercase tracking-[0.14em] text-muted-foreground sm:grid">
              <span className="sr-only">Product</span>
              <span className="col-start-2">Details</span>
              <span className="sr-only">Qty</span>
              <span className="text-right">Price</span>
            </div>

            <ul className="flex flex-col gap-8 divide-y divide-border">
              {items.map((item) => (
                <li key={item.id} className="pt-8 first:pt-0">
                  <CartLineItem item={item} />
                </li>
              ))}
            </ul>

            <p className="mt-8">
              <Link
                href="/collections/new-arrivals"
                className="text-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Continue Shopping
              </Link>
            </p>
          </div>

          <aside className="h-fit rounded-card border border-border bg-surface p-5 sm:p-6 lg:sticky lg:top-28">
            <h2 className="font-serif text-xl tracking-tight">Order summary</h2>
            <CartSummary className="mt-5" />
            <ButtonLink
              href="/checkout"
              variant="primary"
              size="lg"
              className="mt-6 w-full"
            >
              Proceed to Checkout
            </ButtonLink>
          </aside>
        </div>
      </Container>
    </div>
  );
}
