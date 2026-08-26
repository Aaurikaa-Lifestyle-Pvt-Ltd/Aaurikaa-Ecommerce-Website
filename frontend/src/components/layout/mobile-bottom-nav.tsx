"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "@/components/cart";
import { useWishlist } from "@/lib/wishlist/wishlist-provider";
import { IconBag, IconHeart, IconHome, IconShop } from "@/components/ui/icons";

/**
 * Fixed mobile bottom nav — Home | Shop | Wishlist | Cart (lg:hidden).
 * Shop → existing `/categories` jewellery discovery (no new /shop route).
 */
const items = [
  { href: "/", label: "Home", Icon: IconHome, match: "exact" as const },
  {
    href: "/categories",
    label: "Shop",
    Icon: IconShop,
    match: "prefix" as const,
  },
  {
    href: "/wishlist",
    label: "Wishlist",
    Icon: IconHeart,
    match: "prefix" as const,
  },
  { href: "/cart", label: "Cart", Icon: IconBag, match: "prefix" as const },
] as const;

function isActive(pathname: string, href: string, match: "exact" | "prefix") {
  if (match === "exact") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileBottomNav() {
  const pathname = usePathname() || "/";
  const { itemCount, ready } = useCart();
  const { count: wishlistCount, ready: wishlistReady } = useWishlist();
  const showCartBadge = ready && itemCount > 0;
  const showWishlistBadge = wishlistReady && wishlistCount > 0;

  return (
    <nav
      aria-label="Mobile primary"
      className="fixed inset-x-0 bottom-0 z-40 lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {/* Warm ivory → champagne field — matches storefront surface language */}
      <div
        className="relative overflow-hidden border-t border-[#d9d0c3]/90 shadow-[0_-10px_32px_-16px_rgba(23,21,18,0.22)]"
        style={{
          backgroundImage: `
            linear-gradient(180deg, rgba(255,252,247,0.72) 0%, rgba(250,246,238,0.55) 42%, rgba(244,237,224,0.7) 100%),
            linear-gradient(118deg, #fffdf9 0%, #f7f1e6 48%, #efe6d6 100%)
          `,
        }}
      >
        {/* Soft champagne wash + top sheen */}
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-10%,rgba(166,135,92,0.16),transparent_55%)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#a6875c]/55 to-transparent"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-x-6 top-0 h-8 bg-gradient-to-b from-white/50 to-transparent"
          aria-hidden
        />

        <ul className="relative mx-auto flex h-[3.65rem] max-w-lg items-stretch justify-around px-2">
          {items.map(({ href, label, Icon, match }) => {
            const active = isActive(pathname, href, match);
            const isCart = href === "/cart";
            const isWishlist = href === "/wishlist";
            const badgeCount = isCart
              ? itemCount
              : isWishlist
                ? wishlistCount
                : 0;
            const showBadge =
              (isCart && showCartBadge) || (isWishlist && showWishlistBadge);

            return (
              <li key={href} className="flex min-w-0 flex-1">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  aria-label={
                    showBadge
                      ? `${label}, ${badgeCount > 99 ? "99+" : badgeCount}`
                      : label
                  }
                  className="group relative flex min-h-12 w-full flex-col items-center justify-center gap-1 px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {/* Active indicator — restrained champagne underline */}
                  <span
                    aria-hidden
                    className={`absolute inset-x-3 top-0 h-[2px] rounded-full transition-opacity duration-200 ${
                      active
                        ? "bg-gradient-to-r from-[#c4a574]/0 via-[#a6875c] to-[#c4a574]/0 opacity-100"
                        : "opacity-0"
                    }`}
                  />

                  <span
                    className={`relative inline-grid h-8 w-8 place-items-center rounded-[10px] transition-colors duration-200 ${
                      active
                        ? "bg-[color-mix(in_oklab,var(--accent)_14%,transparent)] text-[#7a6238]"
                        : "text-muted-foreground group-hover:bg-muted/80 group-hover:text-foreground"
                    }`}
                  >
                    <Icon
                      className={`h-[1.15rem] w-[1.15rem] transition-[stroke-width] duration-200 ${
                        active ? "stroke-[1.9]" : "stroke-[1.55]"
                      }`}
                    />
                    {showBadge ? (
                      <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-none text-primary-foreground shadow-soft ring-2 ring-[#f7f1e6]">
                        {badgeCount > 99 ? "99+" : badgeCount}
                      </span>
                    ) : null}
                  </span>

                  <span
                    className={`text-[9.5px] font-semibold uppercase tracking-[0.14em] transition-colors duration-200 ${
                      active
                        ? "text-[#6b5430]"
                        : "text-muted-foreground group-hover:text-foreground/80"
                    }`}
                  >
                    {label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
