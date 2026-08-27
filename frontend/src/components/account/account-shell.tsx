"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Container } from "@/components/ui/container";
import { useShopperAuth } from "@/lib/auth/shopper-provider";
import { ShopperAuthPanel } from "./shopper-auth-panel";
import { cn } from "@/lib/cn";
import {
  IconBag,
  IconHeart,
  IconLayoutGrid,
  IconLogOut,
  IconMapPin,
  IconSparkle,
  IconUser,
} from "@/components/ui/icons";

const NAV_ITEMS = [
  { href: "/account", label: "Overview", icon: IconLayoutGrid },
  { href: "/account/orders", label: "Orders", icon: IconBag },
  { href: "/wishlist", label: "Wishlist", icon: IconHeart },
  { href: "/account/profile", label: "Profile", icon: IconUser },
  { href: "/account/addresses", label: "Addresses", icon: IconMapPin },
];

export function AccountShell({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) {
  const pathname = usePathname();
  const { user, ready, configured, logout } = useShopperAuth();

  if (!ready) {
    return (
      <div className="py-16 sm:py-24">
        <Container>
          <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-xs">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-accent">
              Aaurikaa Account
            </p>
            <p className="mt-3 text-sm text-muted-foreground">Loading account details…</p>
          </div>
        </Container>
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="py-16 sm:py-20">
        <Container>
          <div className="mx-auto max-w-lg rounded-2xl border border-border bg-surface p-8 text-center shadow-xs sm:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
              Account
            </p>
            <h1 className="mt-2 font-serif text-3xl tracking-tight text-foreground">
              Sign in unavailable
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Set NEXT_PUBLIC_API_BASE_URL to enable customer authentication.
            </p>
          </div>
        </Container>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="py-16 sm:py-20">
        <Container>
          <div className="mx-auto max-w-md">
            <ShopperAuthPanel title={title ?? "Welcome back"} />
          </div>
        </Container>
      </div>
    );
  }

  const displayName = user.firstName || user.username || "Guest";

  return (
    <div className="pb-16 pt-6 sm:pb-24 sm:pt-8">
      <Container className="max-w-7xl">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)]">
          {/* Desktop Left Sidebar */}
          <aside className="hidden lg:flex lg:flex-col lg:justify-between lg:pr-4">
            <div className="space-y-6">
              {/* Brand Emblem & Wordmark */}
              <Link
                href="/"
                className="group flex items-center gap-3 transition-opacity hover:opacity-90"
                aria-label="Aaurikaa home"
              >
                <Image
                  src="/images/logo/aaurikaa-emblem.png"
                  alt="Aaurikaa emblem"
                  width={48}
                  height={48}
                  priority
                  className="h-10 w-10 object-contain drop-shadow-xs"
                />
                <div className="flex flex-col text-left">
                  <span className="font-serif text-xl font-semibold tracking-[0.03em] leading-tight bg-gradient-to-r from-[#8c6014] via-[#b38018] to-[#7d520e] bg-clip-text text-transparent">
                    Aaurikaa
                  </span>
                  <span className="mt-0.5 text-[8px] font-semibold uppercase tracking-[0.2em] text-[#6b4e18] leading-none">
                    FOR THE QUEEN WITHIN…
                  </span>
                </div>
              </Link>

              {/* Navigation Section */}
              <div className="pt-2">
                <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
                  Account
                </p>
                <nav aria-label="Account navigation" className="mt-3 space-y-1">
                  {NAV_ITEMS.map((item) => {
                    const active =
                      item.href === "/account"
                        ? pathname === "/account"
                        : pathname === item.href || pathname.startsWith(`${item.href}/`);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-150",
                          active
                            ? "bg-[#f4efe6] text-foreground shadow-xs font-semibold"
                            : "text-muted-foreground hover:bg-[#f8f5ee] hover:text-foreground",
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0 transition-colors",
                            active ? "text-foreground" : "text-muted-foreground",
                          )}
                        />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </nav>
              </div>
            </div>

            {/* Bottom Sign Out Action */}
            <div className="border-t border-border/80 pt-4">
              <button
                type="button"
                onClick={logout}
                className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-muted-foreground transition-all duration-150 hover:bg-[#f8f5ee] hover:text-foreground"
              >
                <IconLogOut className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span>Sign out</span>
              </button>
            </div>
          </aside>

          {/* Right Main Content Area */}
          <main className="min-w-0 flex-1">
            {/* Header Greeting Banner */}
            <header className="mb-6 flex flex-col justify-between gap-4 rounded-2xl border border-border bg-surface p-6 shadow-xs sm:mb-8 sm:flex-row sm:items-center sm:p-7">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
                  My Aaurikaa
                </p>
                <h1 className="mt-1.5 flex items-center gap-2 font-serif text-2xl font-normal tracking-tight text-foreground sm:text-3xl lg:text-4xl">
                  <span>Welcome back, {displayName}</span>
                  <IconSparkle className="h-4 w-4 sm:h-5 sm:w-5 text-accent animate-pulse shrink-0 inline-block" />
                </h1>
                {user.email ? (
                  <p className="mt-1 truncate text-xs text-muted-foreground sm:text-sm">
                    {user.email}
                  </p>
                ) : null}
              </div>

              <div className="flex items-center gap-3 self-start sm:self-center">
                <button
                  type="button"
                  onClick={logout}
                  className="inline-flex items-center gap-2 rounded-control border border-border bg-surface px-3.5 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted/60 sm:text-sm"
                >
                  <span>Sign out</span>
                  <IconLogOut className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
            </header>

            {/* Mobile / Tablet Horizontal Navigation Scroll */}
            <nav
              aria-label="Account mobile navigation"
              className="no-scrollbar mb-6 flex gap-1.5 overflow-x-auto pb-1 lg:hidden"
            >
              {NAV_ITEMS.map((item) => {
                const active =
                  item.href === "/account"
                    ? pathname === "/account"
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium transition-all sm:text-sm",
                      active
                        ? "bg-[#f4efe6] text-foreground font-semibold shadow-xs"
                        : "border border-border/60 bg-surface text-muted-foreground hover:bg-[#f8f5ee] hover:text-foreground",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Page Content */}
            <div className="min-w-0">{children}</div>
          </main>
        </div>
      </Container>
    </div>
  );
}
