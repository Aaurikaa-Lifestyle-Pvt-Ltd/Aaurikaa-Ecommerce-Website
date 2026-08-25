"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { IconClose } from "@/components/ui/icons";
import { ButtonLink } from "@/components/ui/button";
import { useCart } from "./cart-provider";
import { CartLineItem } from "./cart-line-item";
import { CartSummary } from "./cart-summary";

const iconButton =
  "inline-grid h-10 w-10 place-items-center rounded-control text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * Lightweight cart drawer — visual kin to the mobile nav drawer.
 * Not a checkout panel: View Cart + Continue Shopping only.
 */
export function MiniCart() {
  const { items, itemCount, isOpen, closeCart, error, busy, source } = useCart();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCart();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, closeCart]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close bag"
        className="absolute inset-0 bg-foreground/40"
        onClick={closeCart}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Your bag"
        className="absolute inset-y-0 right-0 flex w-[92%] max-w-md flex-col bg-surface shadow-card"
      >
        <div className="flex h-16 items-center justify-between border-b border-border px-5">
          <div>
            <p className="font-serif text-xl tracking-tight">Your Bag</p>
            <p className="text-xs text-muted-foreground">
              {itemCount === 0
                ? "Empty"
                : `${itemCount} ${itemCount === 1 ? "item" : "items"}`}
              {source === "server" ? " · Saved to account" : ""}
              {busy ? " · Updating…" : ""}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className={iconButton}
            aria-label="Close bag"
            onClick={closeCart}
          >
            <IconClose className="h-5 w-5" />
          </button>
        </div>

        {error ? (
          <p className="border-b border-border px-5 py-3 text-sm text-sale" role="alert">
            {error}
          </p>
        ) : null}

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
            <p className="font-serif text-2xl tracking-tight">Your bag is empty</p>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              Discover pieces made to complete your look.
            </p>
            <ButtonLink
              href="/collections/new-arrivals"
              variant="primary"
              size="md"
              className="mt-8"
              onClick={closeCart}
            >
              Continue Shopping
            </ButtonLink>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-5">
              <ul className="flex flex-col gap-6">
                {items.map((item) => (
                  <li key={item.id}>
                    <CartLineItem item={item} compact />
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-t border-border px-5 py-5">
              <CartSummary compact />
              <div className="mt-5 flex flex-col gap-2">
                <ButtonLink
                  href="/cart"
                  variant="primary"
                  size="md"
                  className="w-full"
                  onClick={closeCart}
                >
                  View Cart
                </ButtonLink>
                <button
                  type="button"
                  onClick={closeCart}
                  className="h-11 w-full rounded-control text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Continue Shopping
                </button>
              </div>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                or{" "}
                <Link
                  href="/collections/new-arrivals"
                  onClick={closeCart}
                  className="underline-offset-4 hover:underline"
                >
                  browse New Arrivals
                </Link>
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
