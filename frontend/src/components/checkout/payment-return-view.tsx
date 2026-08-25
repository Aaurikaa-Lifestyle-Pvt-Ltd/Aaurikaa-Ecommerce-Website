"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";
import { OrderPricingBreakdown } from "@/components/orders/order-pricing-breakdown";
import { verifyPhonePePayment } from "@/lib/api/payments";
import {
  fetchShopperOrder,
  type ShopperOrderDetail,
} from "@/lib/api/orders";
import { useShopperAuth } from "@/lib/auth/shopper-provider";
import { formatMoney } from "@/lib/format";
import { formatCommerceApiError } from "@/lib/commerce-errors";

export function PaymentReturnView() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId") || searchParams.get("id");
  const { user, ready } = useShopperAuth();
  const [message, setMessage] = useState("Checking payment status…");
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [pricingSummary, setPricingSummary] = useState<
    ShopperOrderDetail["pricingSummary"] | null
  >(null);
  const [fallbackTotal, setFallbackTotal] = useState<number | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setMessage("Sign in to confirm this payment.");
      setFailed(true);
      return;
    }
    if (!orderId) {
      setMessage("Missing order identifier.");
      setFailed(true);
      return;
    }

    let cancelled = false;
    (async () => {
      let verifyFailed = false;
      try {
        const verified = await verifyPhonePePayment(orderId);
        if (cancelled) return;
        setStatus(verified.orderStatus || verified.status || null);
        if (verified.success === false) {
          verifyFailed = true;
          setFailed(true);
          setMessage(
            verified.message?.trim() ||
              "Payment could not be verified. The order remains unpaid until PhonePe confirms.",
          );
        } else {
          setFailed(false);
          setMessage("Payment status updated from PhonePe.");
        }
      } catch (err: unknown) {
        if (cancelled) return;
        verifyFailed = true;
        setFailed(true);
        setMessage(
          formatCommerceApiError(
            err,
            "Unable to verify this payment yet. The order remains unpaid until PhonePe confirms.",
          ),
        );
      }

      try {
        const order = await fetchShopperOrder(orderId);
        if (cancelled) return;
        setInvoiceNumber(order.orderId);
        setPricingSummary(order.pricingSummary ?? null);
        setFallbackTotal(order.pricingSummary?.total ?? order.total ?? null);
        if (order.orderStatus) setStatus(order.orderStatus);
        const pay = order.paymentVisibility?.paymentStatus ?? null;
        setPaymentStatus(pay);
        if (
          verifyFailed ||
          (pay && /unpaid|pending|failed|initiated/i.test(pay))
        ) {
          setFailed(true);
          if (verifyFailed) {
            setMessage((prev) =>
              prev.includes("unpaid")
                ? prev
                : `${prev} This order is still unpaid.`,
            );
          }
        }
      } catch {
        // Verification message is enough.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, user, orderId]);

  return (
    <div className="pb-16 pt-8 sm:pb-20 sm:pt-10">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow mb-4">Payment</p>
          <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">
            {failed ? "Payment not confirmed" : "Payment return"}
          </h1>
          <p
            className={`mt-4 text-sm ${failed ? "text-sale" : "text-muted-foreground"}`}
            role={failed ? "alert" : undefined}
          >
            {message}
          </p>
          {invoiceNumber ? (
            <p className="mt-6 font-serif text-2xl tracking-tight">Order #{invoiceNumber}</p>
          ) : null}
          {status ? (
            <p className="mt-2 text-sm uppercase tracking-wide text-muted-foreground">{status}</p>
          ) : null}
          {paymentStatus ? (
            <p className="mt-1 text-sm uppercase tracking-wide text-muted-foreground">
              Payment {paymentStatus}
            </p>
          ) : null}
          {failed ? (
            <p className="mt-4 text-xs text-muted-foreground">
              No refund is created from this screen. Open the order for the current
              payment status, or contact support if PhonePe deducted funds.
            </p>
          ) : null}
        </div>

        {pricingSummary ? (
          <div className="mx-auto mt-10 max-w-md rounded-card border border-border bg-surface p-5 text-left sm:p-6">
            <OrderPricingBreakdown
              pricingSummary={pricingSummary}
              fallbackTotal={fallbackTotal ?? undefined}
            />
          </div>
        ) : typeof fallbackTotal === "number" ? (
          <p className="mt-10 text-center text-sm">
            Server total {formatMoney({ amount: fallbackTotal, currency: "INR" })}
          </p>
        ) : null}

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {orderId ? (
            <ButtonLink href={`/account/orders/${orderId}`} variant="primary" size="md">
              View order
            </ButtonLink>
          ) : (
            <ButtonLink href="/account/orders" variant="primary" size="md">
              View orders
            </ButtonLink>
          )}
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
