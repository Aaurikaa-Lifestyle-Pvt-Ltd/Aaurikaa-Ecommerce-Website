"use client";

import { Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { siteConfig, type NavLink } from "@/config/site";
import { Container } from "@/components/ui/container";
import { useCart } from "@/components/cart";
import { SearchAutocomplete } from "@/components/search";
import { useWishlist } from "@/lib/wishlist/wishlist-provider";
import {
  IconBag,
  IconClose,
  IconHeart,
  IconMenu,
  IconSearch,
  IconUser,
} from "@/components/ui/icons";

const iconButton =
  "inline-grid h-10 w-10 place-items-center rounded-control text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function Wordmark({
  className,
  name,
}: {
  className?: string;
  name: string;
}) {
  return (
    <Link href="/" className={className} aria-label={`${name} home`}>
      <span className="font-serif text-xl tracking-tight sm:text-2xl">
        {name}
      </span>
    </Link>
  );
}

type HeaderProps = {
  /** Soft-wired from SiteSettings header.title when present. */
  brandName?: string;
  /** From SiteSettings header.menuLinks when configured; else siteConfig.primaryNav. */
  navLinks?: NavLink[];
};

export function Header({ brandName, navLinks }: HeaderProps = {}) {
  const name = brandName?.trim() || siteConfig.name;
  const primaryNav =
    navLinks && navLinks.length > 0 ? navLinks : siteConfig.primaryNav;
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { itemCount, ready, openCart, isOpen: cartOpen } = useCart();
  const { count: wishlistCount, ready: wishlistReady } = useWishlist();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (cartOpen) return;
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen, cartOpen]);

  useEffect(() => {
    if (!menuOpen && !searchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (menuOpen) setMenuOpen(false);
      if (searchOpen) setSearchOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen, searchOpen]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (mq.matches) setMenuOpen(false);
    };
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function handleOpenCart() {
    setMenuOpen(false);
    openCart();
  }

  const showBadge = ready && itemCount > 0;
  const showWishlistBadge = wishlistReady && wishlistCount > 0;

  const mobileDrawer =
    mounted && menuOpen
      ? createPortal(
          <div className="lg:hidden">
            <button
              type="button"
              aria-label="Close menu"
              className="fixed inset-0 z-50 bg-foreground/40"
              onClick={() => setMenuOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              className="fixed inset-y-0 left-0 z-50 flex w-[86%] max-w-sm flex-col bg-surface shadow-card"
            >
              <div className="flex h-16 items-center justify-between border-b border-border px-5">
                <Wordmark name={name} />
                <button
                  type="button"
                  className={iconButton}
                  aria-label="Close menu"
                  onClick={() => setMenuOpen(false)}
                >
                  <IconClose className="h-5 w-5" />
                </button>
              </div>

              <div className="border-b border-border px-5 py-4">
                <Suspense
                  fallback={
                    <p className="text-sm text-muted-foreground">Search…</p>
                  }
                >
                  <SearchAutocomplete
                    compact
                    onClose={() => setMenuOpen(false)}
                  />
                </Suspense>
              </div>

              <nav
                aria-label="Mobile"
                className="flex-1 overflow-y-auto px-5 py-6"
              >
                <ul className="flex flex-col gap-1">
                  {primaryNav.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="block rounded-control px-2 py-3 text-base text-foreground transition-colors hover:bg-muted"
                        onClick={() => setMenuOpen(false)}
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>

              <div className="border-t border-border px-5 py-5">
                <div className="flex flex-col gap-1">
                  <Link
                    href="/account"
                    className="flex items-center gap-3 rounded-control px-2 py-3 text-sm text-foreground hover:bg-muted"
                    onClick={() => setMenuOpen(false)}
                  >
                    <IconUser className="h-5 w-5" /> Account
                  </Link>
                  <Link
                    href="/wishlist"
                    className="flex items-center gap-3 rounded-control px-2 py-3 text-sm text-foreground hover:bg-muted"
                    onClick={() => setMenuOpen(false)}
                  >
                    <IconHeart className="h-5 w-5" /> Wishlist
                    {showWishlistBadge ? (
                      <span className="text-muted-foreground">
                        ({wishlistCount > 99 ? "99+" : wishlistCount})
                      </span>
                    ) : null}
                  </Link>
                  <button
                    type="button"
                    className="flex items-center gap-3 rounded-control px-2 py-3 text-left text-sm text-foreground hover:bg-muted"
                    onClick={handleOpenCart}
                  >
                    <IconBag className="h-5 w-5" /> Bag
                    {showBadge ? (
                      <span className="text-muted-foreground">
                        ({itemCount})
                      </span>
                    ) : null}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/75">
      <Container>
        <div className="flex h-16 items-center justify-between gap-4 lg:h-20">
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={`${iconButton} lg:hidden`}
              aria-label="Open menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <IconMenu className="h-5 w-5" />
            </button>
            <Wordmark name={name} />
          </div>

          <nav aria-label="Primary" className="hidden lg:block">
            <ul className="flex items-center gap-8">
              {primaryNav.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-foreground/80 underline-offset-8 transition-colors hover:text-foreground hover:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex items-center gap-0.5 sm:gap-1">
            <button
              type="button"
              className={iconButton}
              aria-label={searchOpen ? "Close search" : "Open search"}
              aria-expanded={searchOpen}
              onClick={() => {
                setSearchOpen((open) => {
                  if (!open) setMenuOpen(false);
                  return !open;
                });
              }}
            >
              {searchOpen ? (
                <IconClose className="h-5 w-5" />
              ) : (
                <IconSearch className="h-5 w-5" />
              )}
            </button>
            <Link
              href="/account"
              className={`${iconButton} hidden sm:inline-grid`}
              aria-label="Account"
            >
              <IconUser className="h-5 w-5" />
            </Link>
            <Link
              href="/wishlist"
              className={`relative ${iconButton}`}
              aria-label={
                showWishlistBadge
                  ? `Wishlist, ${wishlistCount} saved`
                  : "Wishlist"
              }
            >
              <IconHeart className="h-5 w-5" />
              {showWishlistBadge ? (
                <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium leading-none text-primary-foreground">
                  {wishlistCount > 99 ? "99+" : wishlistCount}
                </span>
              ) : null}
            </Link>
            <button
              type="button"
              className={`relative ${iconButton}`}
              aria-label={
                showBadge ? `Open bag, ${itemCount} items` : "Open bag"
              }
              aria-expanded={cartOpen}
              aria-haspopup="dialog"
              onClick={handleOpenCart}
            >
              <IconBag className="h-5 w-5" />
              {showBadge ? (
                <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium leading-none text-primary-foreground">
                  {itemCount > 99 ? "99+" : itemCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>
      </Container>

      {searchOpen ? (
        <div className="border-t border-border bg-surface">
          <Container>
            <div className="py-3">
              <Suspense
                fallback={
                  <div className="h-10 animate-pulse rounded-control bg-muted" />
                }
              >
                <SearchAutocomplete
                  autoFocus
                  onClose={() => setSearchOpen(false)}
                />
              </Suspense>
            </div>
          </Container>
        </div>
      ) : null}

      {mobileDrawer}
    </header>
  );
}
