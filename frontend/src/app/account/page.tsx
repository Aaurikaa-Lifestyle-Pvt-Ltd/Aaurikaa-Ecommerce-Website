"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { formatMoney } from "@/lib/format";
import { resolveMediaUrl } from "@/lib/mappers/media";
import {
  fetchShopperDashboardStats,
  type ShopperDashboardStats,
} from "@/lib/api/shopper-dashboard";
import { fetchShopperOrders, type ShopperOrderListItem } from "@/lib/api/orders";
import {
  IconArrowRight,
  IconBag,
  IconChevronRight,
  IconHeart,
  IconMapPin,
  IconRupee,
  IconUser,
} from "@/components/ui/icons";

const TILES = [
  {
    href: "/account/orders",
    title: "Orders",
    copy: "Order history, shipment tracking, and invoices.",
    icon: IconBag,
  },
  {
    href: "/wishlist",
    title: "Wishlist",
    copy: "Saved jewellery pieces you love.",
    icon: IconHeart,
  },
  {
    href: "/account/profile",
    title: "Profile",
    copy: "Name, username, and mobile on your shopper record.",
    icon: IconUser,
  },
  {
    href: "/account/addresses",
    title: "Addresses",
    copy: "Saved delivery addresses and default shipping address.",
    icon: IconMapPin,
  },
];

function formatOrderDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

function getStatusBadgeStyle(status?: string | null): string {
  const s = (status || "").toLowerCase();
  if (s.includes("delivered") || s.includes("completed")) {
    return "bg-[#edf7ed] text-[#2e7d32] border-[#c8e6c9]";
  }
  if (s.includes("cancel") || s.includes("failed")) {
    return "bg-[#fdeded] text-[#d32f2f] border-[#ffcdd2]";
  }
  if (s.includes("ship") || s.includes("transit") || s.includes("out")) {
    return "bg-[#e8f4fd] text-[#0288d1] border-[#b3e5fc]";
  }
  return "bg-[#fff8e1] text-[#b78103] border-[#ffe082]";
}

export default function AccountPage() {
  const [stats, setStats] = useState<ShopperDashboardStats | null>(null);
  const [recentOrder, setRecentOrder] = useState<ShopperOrderListItem | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchShopperDashboardStats().then((next) => {
      if (!cancelled) setStats(next);
    });
    fetchShopperOrders()
      .then((orders) => {
        if (!cancelled && orders && orders.length > 0) {
          setRecentOrder(orders[0]);
        }
      })
      .catch(() => {
        // Non-critical fallback for recent order widget
      })
      .finally(() => {
        if (!cancelled) setLoadingOrders(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const activeOrdersCount = typeof stats?.activeOrders === "number" ? stats.activeOrders : 0;
  const wishlistCount = typeof stats?.wishlistCount === "number" ? stats.wishlistCount : 0;
  const totalSpentAmount = typeof stats?.totalSpent === "number" ? stats.totalSpent : 0;

  const firstItem = recentOrder?.itemsPreview?.[0];
  const firstItemImage = firstItem?.image ? resolveMediaUrl(firstItem.image) : null;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* 3 Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Active Orders */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-surface p-5 shadow-xs transition-shadow hover:shadow-card sm:p-6">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border/80 bg-[#faf8f4] text-foreground">
              <IconBag className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Active Orders
              </p>
              <p className="font-serif text-2xl font-normal tracking-tight text-foreground sm:text-3xl">
                {activeOrdersCount}
              </p>
            </div>
          </div>
          <Link
            href="/account/orders"
            className="group mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <span>Track your latest purchase</span>
            <IconArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {/* Wishlist */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-surface p-5 shadow-xs transition-shadow hover:shadow-card sm:p-6">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border/80 bg-[#faf8f4] text-foreground">
              <IconHeart className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Wishlist
              </p>
              <p className="font-serif text-2xl font-normal tracking-tight text-foreground sm:text-3xl">
                {wishlistCount}
              </p>
            </div>
          </div>
          <Link
            href="/wishlist"
            className="group mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <span>Explore your wishlist</span>
            <IconArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {/* Total Spent */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-surface p-5 shadow-xs transition-shadow hover:shadow-card sm:p-6">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border/80 bg-[#faf8f4] text-foreground">
              <IconRupee className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Total Spent
              </p>
              <p className="font-serif text-2xl font-normal tracking-tight text-foreground sm:text-3xl">
                {formatMoney({ amount: totalSpentAmount, currency: "INR" })}
              </p>
            </div>
          </div>
          <div className="mt-4 text-xs font-medium text-muted-foreground">
            Your shopping journey
          </div>
        </div>
      </div>

      {/* Recent Order Preview Card */}
      <section aria-labelledby="recent-order-heading" className="rounded-2xl border border-border bg-surface p-5 shadow-xs sm:p-6">
        <div className="flex items-center justify-between gap-4 border-b border-border/70 pb-4">
          <h2 id="recent-order-heading" className="font-serif text-lg font-normal tracking-tight text-foreground sm:text-xl">
            Recent Order
          </h2>
          <Link
            href="/account/orders"
            className="group inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <span>View all orders</span>
            <IconArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {recentOrder ? (
          <Link
            href={`/account/orders/${recentOrder._id}`}
            className="group mt-4 flex flex-col gap-4 rounded-xl p-2 transition-colors hover:bg-[#faf8f4] sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-4 min-w-0">
              <div className="relative h-18 w-18 sm:h-20 sm:w-20 shrink-0 overflow-hidden rounded-xl border border-border/60 bg-[#f4efe6]">
                {firstItemImage ? (
                  <Image
                    src={firstItemImage}
                    alt={firstItem?.productName || "Product"}
                    fill
                    sizes="80px"
                    className="object-cover transition-transform group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <IconBag className="h-7 w-7 opacity-40" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    ORDER #{recentOrder.orderId}
                  </p>
                  <span className="text-xs text-muted-foreground">·</span>
                  <p className="text-xs text-muted-foreground">
                    Placed on {formatOrderDate(recentOrder.createdAt)}
                  </p>
                </div>
                <p className="truncate text-sm font-medium text-foreground sm:text-base">
                  {firstItem?.productName || "Aaurikaa Jewellery"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Qty {firstItem?.quantity || 1} · {formatMoney({ amount: recentOrder.total, currency: "INR" })}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 self-end sm:self-center">
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${getStatusBadgeStyle(
                  recentOrder.orderStatus,
                )}`}
              >
                {recentOrder.orderStatus}
              </span>
              <IconChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
          </Link>
        ) : loadingOrders ? (
          <p className="mt-4 text-xs text-muted-foreground">Loading recent order…</p>
        ) : (
          <div className="mt-4 py-4 text-center">
            <p className="text-sm text-muted-foreground">You have not placed an order yet.</p>
            <Link
              href="/collections/new-arrivals"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent transition-colors hover:text-foreground"
            >
              <span>Explore New Arrivals</span>
              <IconArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}
      </section>

      {/* Account Quick Navigation Tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {TILES.map((tile) => {
          const Icon = tile.icon;
          return (
            <Link
              key={tile.href}
              href={tile.href}
              className="group flex items-start gap-4 rounded-2xl border border-border bg-surface p-5 shadow-xs transition-all hover:border-accent/40 hover:bg-[#faf8f4] hover:shadow-card"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-[#f4efe6] text-foreground transition-colors group-hover:border-accent/40">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-serif text-lg font-normal tracking-tight text-foreground">
                    {tile.title}
                  </h3>
                  <IconChevronRight className="h-4 w-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {tile.copy}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

