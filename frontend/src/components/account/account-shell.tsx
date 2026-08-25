"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { useShopperAuth } from "@/lib/auth/shopper-provider";
import { ShopperAuthPanel } from "./shopper-auth-panel";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/account", label: "Overview" },
  { href: "/account/profile", label: "Profile" },
  { href: "/account/addresses", label: "Addresses" },
  { href: "/account/orders", label: "Orders" },
  { href: "/wishlist", label: "Wishlist" },
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
      <div className="py-16">
        <Container>
          <p className="text-sm text-muted-foreground">Loading account…</p>
        </Container>
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="py-16 sm:py-20">
        <Container>
          <div className="mx-auto max-w-lg text-center">
            <p className="eyebrow mb-4">Account</p>
            <h1 className="font-serif text-3xl tracking-tight">Sign in unavailable</h1>
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

  return (
    <div className="pb-16 pt-8 sm:pb-20 sm:pt-10">
      <Container>
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4 sm:mb-10">
          <div>
            <p className="eyebrow mb-3">Account</p>
            <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">
              Hello, {user.firstName || user.username}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{user.email}</p>
          </div>
          <Button type="button" variant="secondary" onClick={logout}>
            Sign out
          </Button>
        </header>

        <nav aria-label="Account" className="mb-8 flex flex-wrap gap-2 border-b border-border pb-4">
          {NAV.map((link) => {
            const active =
              link.href === "/account"
                ? pathname === "/account"
                : pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-control px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {children}
      </Container>
    </div>
  );
}
