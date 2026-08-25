"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import {
  fetchShopperDashboardStats,
  type ShopperDashboardStats,
} from "@/lib/api/shopper-dashboard";

const tiles = [
  { href: "/account/profile", title: "Profile", copy: "Name, username, and mobile on your shopper record." },
  { href: "/account/addresses", title: "Addresses", copy: "Saved delivery addresses and a default address." },
  { href: "/account/orders", title: "Orders", copy: "Order history and status from the shopper order APIs." },
  { href: "/wishlist", title: "Wishlist", copy: "Saved products on your account." },
];

export default function AccountPage() {
  const [stats, setStats] = useState<ShopperDashboardStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchShopperDashboardStats().then((next) => {
      if (!cancelled) setStats(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const hasStats =
    stats &&
    (typeof stats.activeOrders === "number" ||
      typeof stats.wishlistCount === "number" ||
      typeof stats.totalSpent === "number");

  return (
    <div className="space-y-8">
      {hasStats ? (
        <dl className="grid gap-3 sm:grid-cols-3">
          {typeof stats.activeOrders === "number" ? (
            <div className="rounded-card border border-border bg-surface p-4">
              <dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                Active orders
              </dt>
              <dd className="mt-2 font-serif text-2xl tracking-tight">{stats.activeOrders}</dd>
            </div>
          ) : null}
          {typeof stats.wishlistCount === "number" ? (
            <div className="rounded-card border border-border bg-surface p-4">
              <dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                Wishlist
              </dt>
              <dd className="mt-2 font-serif text-2xl tracking-tight">{stats.wishlistCount}</dd>
            </div>
          ) : null}
          {typeof stats.totalSpent === "number" ? (
            <div className="rounded-card border border-border bg-surface p-4">
              <dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                Total spent
              </dt>
              <dd className="mt-2 font-serif text-2xl tracking-tight">
                {formatMoney({ amount: stats.totalSpent, currency: "INR" })}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {tiles.map((tile) => (
          <Link
            key={tile.href}
            href={tile.href}
            className="rounded-card border border-border bg-surface p-5 transition-colors hover:border-foreground/40"
          >
            <h2 className="font-serif text-xl tracking-tight">{tile.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{tile.copy}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
