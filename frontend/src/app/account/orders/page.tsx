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

function OrderListCard({ order }: { order: ShopperOrderListItem }) {
  const preview = order.itemsPreview || [];
  const visible = preview.slice(0, 3);
  const extra = preview.length > 3 ? preview.length - 3 : 0;
  const pay = paymentLabel(order);

  return (
    <article className="rounded-card border border-border bg-surface overflow-hidden">
      <div className="border-b border-border p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Order
            </p>
            <p className="truncate text-sm font-medium" title={order.orderId}>
              {order.orderId}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {formatOrderDate(order.createdAt)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {order.orderStatus}
            </p>
            {pay ? (
              <p className="text-xs text-muted-foreground">{pay}</p>
            ) : null}
            <p className="text-base font-medium">
              {typeof order.total === "number"
                ? formatMoney({ amount: order.total, currency: "INR" })
                : "—"}
            </p>
            {typeof order.discountAmount === "number" && order.discountAmount > 0 ? (
              <p className="text-xs text-sale">
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
          </div>
        </div>
      </div>

      <div className="space-y-3 p-4 sm:p-5">
        <ul className="space-y-3">
          {visible.map((item, idx) => {
            const src = resolveMediaUrl(item.image);
            return (
              <li key={`${item.productSlug ?? "item"}-${idx}`} className="flex gap-3">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-control bg-muted">
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
                  <p className="truncate text-sm font-medium">
                    {item.productName || "Product"}
                  </p>
                  {item.variantSummary ? (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {item.variantSummary}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Qty {item.quantity ?? 1}
                  </p>
                </div>
              </li>
            );
          })}
          {extra > 0 ? (
            <li className="pl-[4.25rem] text-xs text-muted-foreground">
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
          <p className="text-xs text-muted-foreground">
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
          <p className="text-xs text-muted-foreground">Invoice available</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 border-t border-border bg-muted/30 px-4 py-3 sm:flex-row sm:flex-wrap sm:px-5">
        {canWriteReview(order.reviewEligibility) ? (
          <ButtonLink
            href={`/account/orders/${order._id}#reviews`}
            variant="primary"
            className="flex-1 justify-center"
          >
            Write a review
          </ButtonLink>
        ) : null}
        <ButtonLink
          href={`/account/orders/${order._id}`}
          variant="secondary"
          className="flex-1 justify-center"
        >
          View details
        </ButtonLink>
        <BuyAgainButton orderId={order._id} className="flex-1" redirectToCart />
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
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Spinner /> Loading orders…
      </p>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-sale" role="alert">
        {error}
      </p>
    );
  }

  if (orders.length === 0) {
    return (
      <div>
        <h2 className="font-serif text-2xl tracking-tight">Orders</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          You have not placed an order yet.
        </p>
        <p className="mt-4">
          <Link href="/collections/new-arrivals" className="text-sm underline-offset-4 hover:underline">
            Continue shopping
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-serif text-2xl tracking-tight">Orders</h2>
      <ul className="mt-6 space-y-4">
        {orders.map((order) => (
          <li key={order._id}>
            <OrderListCard order={order} />
          </li>
        ))}
      </ul>
    </div>
  );
}
