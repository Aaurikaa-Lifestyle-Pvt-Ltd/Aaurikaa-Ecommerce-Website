"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Container } from "@/components/ui/container";
import { Button, ButtonLink } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { ORDER_STORAGE_KEY } from "@/config/checkout";
import {
  fetchShopperOrder,
  downloadShopperInvoice,
  type ShopperOrderDetail,
} from "@/lib/api/orders";
import { useShopperAuth } from "@/lib/auth/shopper-provider";
import { OrderPricingBreakdown } from "@/components/orders/order-pricing-breakdown";
import { OrderDeliveryAddress } from "@/components/orders/order-delivery-address";
import { formatMoney } from "@/lib/format";
import { ApiError } from "@/lib/api/errors";

type StoredConfirmation = {
  orderNumber?: string;
  orderId?: string;
  totalAmount?: number;
  status?: string;
  paymentStatus?: string;
  demo?: boolean;
};

function readStored(): StoredConfirmation | null {
  try {
    const raw = sessionStorage.getItem(ORDER_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredConfirmation;
  } catch {
    return null;
  }
}

function paymentMethodLabel(order: ShopperOrderDetail): string | null {
  const v = order.paymentVisibility;
  if (!v) return null;
  return v.paymentType || v.paymentMethod || v.gateway || null;
}

export function OrderConfirmationView() {
  const searchParams = useSearchParams();
  const { user, ready } = useShopperAuth();
  const toast = useToast();
  const orderFromQuery = searchParams.get("order");
  const idFromQuery = searchParams.get("id");
  const [stored, setStored] = useState<StoredConfirmation | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [detail, setDetail] = useState<ShopperOrderDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [invoiceBusy, setInvoiceBusy] = useState(false);

  useEffect(() => {
    setStored(readStored());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!ready || !user) return;
    const id = idFromQuery || stored?.orderId;
    if (!id) return;
    setLoadingDetail(true);
    fetchShopperOrder(id)
      .then(setDetail)
      .catch(() => {
        setDetail(null);
      })
      .finally(() => setLoadingDetail(false));
  }, [ready, user, idFromQuery, stored?.orderId]);

  if (!hydrated) {
    return (
      <div className="py-16 sm:py-20">
        <Container>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> Loading confirmation…
          </p>
        </Container>
      </div>
    );
  }

  const orderNumber = detail?.orderId ?? stored?.orderNumber ?? orderFromQuery;
  const status = detail?.orderStatus ?? stored?.status;
  const paymentStatus =
    detail?.paymentVisibility?.paymentStatus ?? stored?.paymentStatus;
  const paymentMethod = detail ? paymentMethodLabel(detail) : null;
  const orderMongoId = idFromQuery || stored?.orderId;
  const pricing = detail?.pricingSummary;
  const storedTotal = stored?.totalAmount;

  if (!orderNumber) {
    return (
      <div className="py-20 sm:py-28">
        <Container>
          <div className="mx-auto max-w-lg text-center">
            <p className="eyebrow mb-4">Orders</p>
            <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">
              No order found
            </h1>
            <p className="mt-4 text-sm text-muted-foreground">
              Place an order from checkout to see a confirmation here.
            </p>
            <div className="mt-8">
              <ButtonLink href="/collections/new-arrivals" variant="primary">
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
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow mb-4">Order placed</p>
          <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">
            Order Confirmed
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Your order was created on the shopper account. Amounts below come from
            the backend order record. Prepaid PhonePe status is confirmed by the
            payment APIs, not by this page alone.
          </p>
          <p className="mt-6 font-serif text-2xl tracking-tight">
            Order #{orderNumber}
          </p>
          {status ? (
            <p className="mt-2 text-sm uppercase tracking-wide text-muted-foreground">
              {status}
              {paymentStatus ? ` · ${paymentStatus}` : ""}
            </p>
          ) : null}
          {paymentMethod ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Payment: {paymentMethod}
            </p>
          ) : null}
        </div>

        <div className="mx-auto mt-12 max-w-2xl rounded-card border border-border bg-surface p-5 sm:p-8">
          {loadingDetail ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Loading order totals…
            </p>
          ) : pricing ? (
            <OrderPricingBreakdown
              pricingSummary={pricing}
              fallbackTotal={detail?.total ?? storedTotal}
            />
          ) : typeof storedTotal === "number" ? (
            <div className="flex justify-between text-base font-medium">
              <span>Payable total</span>
              <span>{formatMoney({ amount: storedTotal, currency: "INR" })}</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Open the order in your account to see the server total.
            </p>
          )}

          {detail ? (
            <OrderDeliveryAddress
              order={detail}
              className="mt-6 border-t border-border pt-5"
            />
          ) : null}
        </div>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {orderMongoId ? (
            <ButtonLink
              href={`/account/orders/${orderMongoId}`}
              variant="primary"
              size="md"
            >
              View order
            </ButtonLink>
          ) : (
            <ButtonLink href="/account/orders" variant="primary" size="md">
              View orders
            </ButtonLink>
          )}
          {orderMongoId ? (
            <Button
              type="button"
              variant="secondary"
              size="md"
              disabled={invoiceBusy}
              onClick={() => {
                setInvoiceBusy(true);
                downloadShopperInvoice(orderMongoId)
                  .then(() => toast.success("Invoice downloaded"))
                  .catch((err: unknown) => {
                    toast.error(
                      "Invoice unavailable",
                      err instanceof ApiError
                        ? err.message
                        : "Unable to download this invoice.",
                    );
                  })
                  .finally(() => setInvoiceBusy(false));
              }}
            >
              {invoiceBusy ? (
                <>
                  <Spinner /> Preparing…
                </>
              ) : (
                "Download invoice"
              )}
            </Button>
          ) : null}
          <Link
            href="/"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Return home
          </Link>
        </div>
      </Container>
    </div>
  );
}
