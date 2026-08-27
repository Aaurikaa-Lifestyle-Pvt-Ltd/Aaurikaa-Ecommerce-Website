"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ApiError } from "@/lib/api/errors";
import { fetchShopperOrders, type ShopperOrderListItem } from "@/lib/api/orders";
import { formatMoney } from "@/lib/format";
import { resolveMediaUrl } from "@/lib/mappers/media";
import { BuyAgainButton } from "@/components/orders/buy-again-button";
import { ButtonLink } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { canWriteReview } from "@/lib/review-eligibility";

function formatOrderDate(iso: string | null): string {
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

function paymentLabel(order: ShopperOrderListItem): string | null {
  const visibility = order.paymentVisibility;
  if (!visibility) return null;
  const status = visibility.paymentStatus || null;
  const method =
    visibility.paymentType ||
    visibility.paymentMethod ||
    visibility.gateway ||
    null;
  if (status && method) return `${method} · ${status}`;
  return status || method;
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

function OrderListCard({ order }: { order: ShopperOrderListItem }) {
  const preview = order.itemsPreview || [];
  const visible = preview.slice(0, 3);
  const extra = preview.length > 3 ? preview.length - 3 : 0;
  const pay = paymentLabel(order);

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-surface shadow-xs transition-shadow hover:shadow-card">
      <div className="border-b border-border/70 bg-[#faf8f4]/60 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Order
              </span>
              <span className="font-mono text-sm font-semibold text-foreground" title={order.orderId}>
                #{order.orderId}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Placed on {formatOrderDate(order.createdAt)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 sm:justify-end">
            <span
              className={`inline-flex items-center rounded-full border px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${getStatusBadgeStyle(
                order.orderStatus,
              )}`}
            >
              {order.orderStatus}
            </span>
            <div className="text-right pl-2">
              <p className="font-serif text-base font-semibold text-foreground">
                {typeof order.total === "number"
                  ? formatMoney({ amount: order.total, currency: "INR" })
                  : "—"}
              </p>
              {typeof order.discountAmount === "number" && order.discountAmount > 0 ? (
                <p className="text-[11px] text-sale">
                  {order.couponCode?.trim()
                    ? `Discount (${order.couponCode.trim()}) −${formatMoney({
                        amount: order.discountAmount,
                        currency: "INR",
                      })}`
                    : `Discount −${formatMoney({
                        amount: order.discountAmount,
                        currency: "INR",
                      })}`}
                </p>
              ) : null}
              {pay ? (
                <p className="text-[11px] text-muted-foreground">{pay}</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3 p-4 sm:p-5">
        <ul className="space-y-3">
          {visible.map((item, idx) => {
            const src = resolveMediaUrl(item.image);
            return (
              <li key={`${item.productSlug ?? "item"}-${idx}`} className="flex items-center gap-3.5">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-border/60 bg-[#f4efe6]">
                  {src ? (
                    <Image
                      src={src}
                      alt={item.productName || "Product"}
                      fill
                      sizes="56px"
                      className="object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {item.productName || "Product"}
                  </p>
                  {item.variantSummary ? (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {item.variantSummary}
                    </p>
                  ) : null}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Qty {item.quantity ?? 1}
                  </p>
                </div>
              </li>
            );
          })}
          {extra > 0 ? (
            <li className="pl-[4.5rem] text-xs font-medium text-muted-foreground">
              +{extra} more item{extra > 1 ? "s" : ""}
            </li>
          ) : null}
          {preview.length === 0 ? (
            <li className="text-sm text-muted-foreground">No item preview available</li>
          ) : null}
        </ul>

        {order.trackingSummary?.trackingAvailable ||
        order.trackingSummary?.awbAvailable ||
        order.trackingSummary?.shipmentStatus ? (
          <p className="text-xs text-muted-foreground pt-1 border-t border-border/60">
            {order.trackingSummary.trackingAvailable || order.trackingSummary.awbAvailable
              ? "Tracking available"
              : null}
            {order.trackingSummary.shipmentStatus
              ? `${
                  order.trackingSummary.trackingAvailable ||
                  order.trackingSummary.awbAvailable
                    ? " · "
                    : ""
                }${order.trackingSummary.shipmentStatus}`
              : null}
          </p>
        ) : null}

        {order.afterSales?.status ? (
          <p className="text-xs text-muted-foreground">
            After-sales {order.afterSales.status}
          </p>
        ) : null}

        {order.invoiceAvailable ? (
          <p className="text-xs text-muted-foreground">Invoice available for download</p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-border/70 bg-[#faf8f4]/50 p-3.5 sm:flex sm:flex-wrap sm:items-center sm:px-5 sm:py-3.5">
        {canWriteReview(order.reviewEligibility) ? (
          <ButtonLink
            href={`/account/orders/${order._id}#reviews`}
            variant="primary"
            className="col-span-2 h-10 w-full justify-center rounded-xl text-xs sm:h-11 sm:flex-1 sm:text-sm"
          >
            Write a review
          </ButtonLink>
        ) : null}
        <ButtonLink
          href={`/account/orders/${order._id}`}
          variant="secondary"
          className="h-10 w-full justify-center rounded-xl text-xs sm:h-11 sm:flex-1 sm:text-sm"
        >
          View details
        </ButtonLink>
        <BuyAgainButton
          orderId={order._id}
          variant="secondary"
          className="h-10 w-full justify-center rounded-xl text-xs sm:h-11 sm:flex-1 sm:text-sm"
          redirectToCart
        />
      </div>
    </article>
  );
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<ShopperOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchShopperOrders()
      .then(setOrders)
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : "Unable to load orders.");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8" role="status">
        <Spinner /> Loading orders…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[#ffcdd2] bg-[#fdeded] p-4 text-sm text-[#d32f2f]" role="alert">
        {error}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8 text-center shadow-xs sm:p-12">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
          Order History
        </p>
        <h2 className="mt-2 font-serif text-2xl tracking-tight text-foreground sm:text-3xl">
          No Orders Yet
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          You have not placed an order with Aaurikaa yet.
        </p>
        <div className="mt-6">
          <ButtonLink href="/collections/new-arrivals" variant="primary">
            Explore Jewellery Collections
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-border/70 pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
            Order History
          </p>
          <h2 className="font-serif text-xl font-normal tracking-tight text-foreground sm:text-2xl">
            My Orders ({orders.length})
          </h2>
        </div>
      </div>

      <ul className="space-y-4">
        {orders.map((order) => (
          <li key={order._id}>
            <OrderListCard order={order} />
          </li>
        ))}
      </ul>
    </div>
  );
}
