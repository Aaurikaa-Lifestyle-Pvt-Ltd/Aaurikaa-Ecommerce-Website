"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ApiError } from "@/lib/api/errors";
import {
  CANCEL_REASON_CODES,
  RETURN_REASON_CODES,
  cancelShopperOrder,
  canRetryPhonePePayment,
  downloadShopperInvoice,
  printShopperInvoice,
  fetchShopperOrder,
  submitReturnAppeal,
  submitReturnRequest,
  uploadReturnEvidence,
  type ShopperOrderDetail,
  type ShopperOrderLineItem,
  type ReviewEligibility,
} from "@/lib/api/orders";
import { createProductReview, fetchProductReviews } from "@/lib/api/reviews";
import { initiatePhonePePayment } from "@/lib/api/payments";
import { formatCommerceApiError } from "@/lib/commerce-errors";
import { formatMoney } from "@/lib/format";
import { resolveMediaUrl } from "@/lib/mappers/media";
import {
  canWriteReview,
  getReviewEligibilityMessage,
  isAlreadyReviewed,
} from "@/lib/review-eligibility";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { StarRatingInput } from "@/components/ui/star-rating";
import { useToast } from "@/components/ui/toast";
import { BuyAgainButton } from "@/components/orders/buy-again-button";
import { OrderPricingBreakdown } from "@/components/orders/order-pricing-breakdown";
import { OrderDeliveryAddress } from "@/components/orders/order-delivery-address";
import { IconArrowRight } from "@/components/ui/icons";

function formatTimestamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

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

function lineDisplayTotal(item: ShopperOrderLineItem): number | null {
  const price = Number(item.itemPrice);
  const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
  if (!Number.isFinite(price)) return null;
  return price * qty;
}

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const toast = useToast();
  const [order, setOrder] = useState<ShopperOrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [paymentRetryError, setPaymentRetryError] = useState<string | null>(null);
  const [payingAgain, setPayingAgain] = useState(false);

  async function reload() {
    if (!params.id) return;
    const next = await fetchShopperOrder(params.id);
    setOrder(next);
  }

  useEffect(() => {
    if (!params.id) return;
    fetchShopperOrder(params.id)
      .then(setOrder)
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : "Unable to load this order.");
        toast.error(
          "Order unavailable",
          err instanceof ApiError ? err.message : "Unable to load this order.",
        );
      });
  }, [params.id, toast]);

  if (error) {
    return (
      <p className="text-sm text-sale" role="alert">
        {error}
      </p>
    );
  }

  if (!order) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Spinner /> Loading order…
      </p>
    );
  }

  const pricing = order.pricingSummary;
  const orderId = order._id;
  const shipment = order.shipmentSummary;
  const returnRequest = order.returnRequest;
  const showPayAgain = canRetryPhonePePayment(order);
  const visibility = order.paymentVisibility;
  const invoiceAvailable =
    order.invoiceSummary?.invoiceAvailable ?? order.invoiceAvailable ?? true;
  const lineItems = order.items ?? order.itemsPreview ?? [];
  const detailItems = order.items ?? [];

  async function downloadInvoice() {
    setInvoiceError(null);
    setDownloading(true);
    try {
      await downloadShopperInvoice(orderId);
      toast.success("Invoice downloaded");
    } catch (err: unknown) {
      const message =
        err instanceof ApiError ? err.message : "Unable to download this invoice.";
      setInvoiceError(message);
      toast.error("Invoice unavailable", message);
    } finally {
      setDownloading(false);
    }
  }

  async function printInvoice() {
    setInvoiceError(null);
    setPrinting(true);
    try {
      await printShopperInvoice(orderId);
    } catch (err: unknown) {
      const message =
        err instanceof ApiError ? err.message : "Unable to open this invoice.";
      setInvoiceError(message);
      toast.error("Invoice unavailable", message);
    } finally {
      setPrinting(false);
    }
  }

  async function payAgain() {
    setPaymentRetryError(null);
    setPayingAgain(true);
    try {
      const initiated = await initiatePhonePePayment(orderId);
      toast.info("Redirecting to PhonePe");
      window.location.assign(initiated.redirectUrl);
    } catch (err: unknown) {
      const message = formatCommerceApiError(
        err,
        "Unable to start PhonePe payment. Please try again later or contact support.",
      );
      setPaymentRetryError(message);
      toast.error("Payment could not start", message);
      setPayingAgain(false);
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

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href="/account/orders"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <span>← Back to all orders</span>
      </Link>

      <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs sm:p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b border-border/70 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
                Order Details
              </span>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${getStatusBadgeStyle(
                  order.orderStatus,
                )}`}
              >
                {order.orderStatus}
              </span>
            </div>
            <h2 className="mt-1 font-serif text-2xl font-normal tracking-tight text-foreground sm:text-3xl">
              #{order.orderId}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              Placed on {formatOrderDate(order.createdAt)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0">
            {showPayAgain ? (
              <Button type="button" onClick={() => void payAgain()} disabled={payingAgain} className="text-xs sm:text-sm">
                {payingAgain ? (
                  <>
                    <Spinner /> Redirecting…
                  </>
                ) : (
                  "Pay again"
                )}
              </Button>
            ) : null}
            <BuyAgainButton orderId={orderId} redirectToCart className="text-xs sm:text-sm" variant="secondary" />
            {shipment?.trackingAvailable && shipment.trackingUrl ? (
              <Button
                type="button"
                variant="secondary"
                className="text-xs sm:text-sm"
                onClick={() =>
                  window.open(shipment.trackingUrl!, "_blank", "noreferrer")
                }
              >
                Track shipment
              </Button>
            ) : null}
          </div>
        </div>

        {order.fulfilmentKind === "replacement" ? (
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-accent">
            Replacement shipment
          </p>
        ) : null}

        {visibility ? (
          <div className="mt-5 rounded-xl border border-border/70 bg-[#faf8f4]/60 p-4 text-xs sm:text-sm">
            <h3 className="font-semibold text-foreground">Payment Information</h3>
            <p className="mt-1 text-muted-foreground">
              {[visibility.paymentType || visibility.paymentMethod, visibility.gateway]
                .filter(Boolean)
                .join(" · ") || "—"}
            </p>
            {visibility.paymentStatus ? (
              <p className="mt-0.5 text-muted-foreground">Status: <span className="font-medium text-foreground">{visibility.paymentStatus}</span></p>
            ) : null}
            {visibility.channel ? (
              <p className="mt-0.5 text-muted-foreground">Channel: {visibility.channel}</p>
            ) : null}
            {visibility.transactionId ? (
              <p className="mt-0.5 text-muted-foreground">Txn: <span className="font-mono text-xs">{visibility.transactionId}</span></p>
            ) : null}
            {visibility.paidAt ? (
              <p className="mt-0.5 text-muted-foreground">
                Paid at {formatTimestamp(visibility.paidAt)}
              </p>
            ) : null}
          </div>
        ) : null}

        {paymentRetryError ? (
          <div className="mt-4 rounded-xl border border-[#ffcdd2] bg-[#fdeded] p-3 text-xs text-[#d32f2f]" role="alert">
            {paymentRetryError}
          </div>
        ) : null}
      </div>

      <ul
        className="space-y-4"
        {...(detailItems.some((item) => item.reviewEligibility) ||
        order.reviewEligibility
          ? { id: "reviews" }
          : {})}
      >
        {lineItems.map((item, index) => {
          const src = resolveMediaUrl("image" in item ? item.image : null);
          const unit = Number(
            "itemPrice" in item ? (item as ShopperOrderLineItem).itemPrice : NaN,
          );
          const lineTotal = lineDisplayTotal(item as ShopperOrderLineItem);
          const detailItem = detailItems[index];
          const lineItem = (detailItem ?? item) as ShopperOrderLineItem;
          const reviewEligibility = lineItem.reviewEligibility;
          const productId = lineItem.productId ? String(lineItem.productId) : undefined;
          return (
            <li
              key={`${item.productSlug ?? "item"}-${index}`}
              className="rounded-2xl border border-border bg-surface p-5 shadow-xs text-sm"
            >
              <div className="flex gap-4">
                <div className="relative h-18 w-18 shrink-0 overflow-hidden rounded-xl border border-border/60 bg-[#f4efe6]">
                  {src ? (
                    <Image
                      src={src}
                      alt={item.productName || "Product"}
                      fill
                      sizes="72px"
                      className="object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground text-base">{item.productName}</p>
                  {"variantSummary" in item && item.variantSummary ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {item.variantSummary}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Qty {item.quantity ?? 1}
                    {Number.isFinite(unit)
                      ? ` · ${formatMoney({ amount: unit, currency: "INR" })} each`
                      : ""}
                  </p>
                </div>
                {lineTotal != null ? (
                  <span className="shrink-0 font-serif font-semibold text-foreground text-base">
                    {formatMoney({ amount: lineTotal, currency: "INR" })}
                  </span>
                ) : null}
              </div>
              {productId && reviewEligibility ? (
                <OrderLineItemReview
                  productId={productId}
                  productName={item.productName || "Product"}
                  reviewEligibility={reviewEligibility}
                  orderId={orderId}
                  onReload={reload}
                  onError={setActionError}
                />
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="space-y-6">
        {pricing ? (
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs">
            <h3 className="mb-3 font-serif text-lg font-normal tracking-tight text-foreground">Order Total</h3>
            <OrderPricingBreakdown
              pricingSummary={pricing}
              fallbackTotal={order.total}
            />
          </div>
        ) : null}

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs">
          <OrderDeliveryAddress
            order={order}
          />
        </div>

        {shipment ? (
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs space-y-2 text-sm">
            <h3 className="font-serif text-lg font-normal tracking-tight text-foreground">Shipment Details</h3>
            <p className="text-muted-foreground">
              Status: <span className="font-medium text-foreground">{shipment.shipmentStatus || "Not shipped yet"}</span>
            </p>
            {shipment.courierName ? <p className="text-muted-foreground">Courier: <span className="font-medium text-foreground">{shipment.courierName}</span></p> : null}
            {shipment.awbNumber ? <p className="text-muted-foreground">AWB: <span className="font-mono">{shipment.awbNumber}</span></p> : null}
            {shipment.trackingAvailable && shipment.trackingUrl ? (
              <div className="pt-2">
                <a
                  href={shipment.trackingUrl}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent underline-offset-4 hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>Track shipment live</span>
                  <IconArrowRight className="h-3 w-3" />
                </a>
              </div>
            ) : null}
          </div>
        ) : null}

        {invoiceAvailable ? (
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs">
            <h3 className="mb-3 font-serif text-lg font-normal tracking-tight text-foreground">Invoice</h3>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => void downloadInvoice()}
                disabled={downloading}
                className="text-xs sm:text-sm"
              >
                {downloading ? (
                  <>
                    <Spinner /> Preparing…
                  </>
                ) : (
                  "Download invoice"
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void printInvoice()}
                disabled={printing}
                className="text-xs sm:text-sm"
              >
                {printing ? (
                  <>
                    <Spinner /> Opening…
                  </>
                ) : (
                  "Print invoice"
                )}
              </Button>
            </div>
            {invoiceError ? (
              <div className="mt-3 rounded-xl border border-[#ffcdd2] bg-[#fdeded] p-3 text-xs text-[#d32f2f]" role="alert">
                {invoiceError}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {order.statusTimeline && order.statusTimeline.length > 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs">
          <h3 className="font-serif text-lg font-normal tracking-tight text-foreground mb-4">Order Timeline</h3>
          <ol className="relative border-l border-border/80 ml-3 space-y-4">
            {order.statusTimeline.map((step, idx) => {
              const when = formatTimestamp(step.timestamp);
              return (
                <li
                  key={`${step.status}-${step.timestamp ?? idx}`}
                  className="ml-4"
                >
                  <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-border bg-accent" />
                  <span className="text-sm font-medium text-foreground">{step.label || step.status}</span>
                  {when ? (
                    <p className="text-xs text-muted-foreground mt-0.5">{when}</p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      {actionError ? (
        <div className="rounded-xl border border-[#ffcdd2] bg-[#fdeded] p-4 text-sm text-[#d32f2f]" role="alert">
          {actionError}
        </div>
      ) : null}

      {order.cancelEligibility?.eligible ? (
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs">
          <CancelForm
            orderId={orderId}
            onDone={async () => {
              setActionError(null);
              try {
                await reload();
                toast.success("Order cancelled");
              } catch (err: unknown) {
                setActionError(
                  err instanceof ApiError ? err.message : "Unable to refresh this order.",
                );
              }
            }}
            onError={setActionError}
          />
        </div>
      ) : order.cancelEligibility?.message ? (
        <p className="text-xs text-muted-foreground px-1">
          {order.cancelEligibility.message}
        </p>
      ) : null}

      {returnRequest ? (
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs space-y-3 text-sm">
          <h3 className="font-serif text-lg font-normal tracking-tight text-foreground">Need Help — Return or Replacement</h3>
          <p className="text-xs uppercase tracking-wider font-semibold text-accent">
            Status: {returnRequest.status}
          </p>
          {returnRequest.resolution ? (
            <p className="text-muted-foreground">Resolution: <span className="font-medium text-foreground">{returnRequest.resolution}</span></p>
          ) : null}
          {returnRequest.manualFollowUpRequired ? (
            <p className="text-muted-foreground">
              Our team will follow up with you on this case.
            </p>
          ) : null}
          {returnRequest.replacementOrderId ? (
            <p>
              Replacement order{" "}
              <Link
                href={`/account/orders/${returnRequest.replacementOrderId}`}
                className="font-medium text-accent underline-offset-4 hover:underline"
              >
                is in fulfilment
              </Link>
            </p>
          ) : null}
          {returnRequest.reverseLogistics?.awbCode ? (
            <p className="text-muted-foreground">Return pickup AWB <span className="font-mono">{returnRequest.reverseLogistics.awbCode}</span></p>
          ) : null}
          {returnRequest.reverseLogistics?.trackingUrl ? (
            <a
              href={returnRequest.reverseLogistics.trackingUrl}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent underline-offset-4 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              <span>Track return pickup</span>
              <IconArrowRight className="h-3 w-3" />
            </a>
          ) : null}
          {returnRequest.refundCompletedAt ||
          returnRequest.walletCreditProcessedAt ? (
            <p className="text-xs text-muted-foreground">A refund record exists on this case.</p>
          ) : null}
          {returnRequest.appeal?.canAppeal ? (
            <AppealForm
              orderId={orderId}
              onDone={async () => {
                setActionError(null);
                try {
                  await reload();
                } catch (err: unknown) {
                  setActionError(
                    err instanceof ApiError
                      ? err.message
                      : "Unable to refresh this order.",
                  );
                }
              }}
              onError={setActionError}
            />
          ) : returnRequest.appeal?.appealCount &&
            returnRequest.appeal.appealCount >= 1 ? (
            <p className="text-muted-foreground">
              Your appeal was submitted
              {returnRequest.appeal.adminDecision
                ? ` · admin decision: ${returnRequest.appeal.adminDecision}`
                : " and is under review"}
              .
            </p>
          ) : null}
        </div>
      ) : order.returnEligibility?.eligible ? (
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs">
          <ReturnForm
            orderId={orderId}
            onDone={async () => {
              setActionError(null);
              try {
                await reload();
              } catch (err: unknown) {
                setActionError(
                  err instanceof ApiError ? err.message : "Unable to refresh this order.",
                );
              }
            }}
            onError={setActionError}
          />
        </div>
      ) : order.returnEligibility?.message ? (
        <p className="text-xs text-muted-foreground px-1">
          {order.returnEligibility.message}
        </p>
      ) : null}
    </div>
  );
}

function CancelForm({
  orderId,
  onDone,
  onError,
}: {
  orderId: string;
  onDone: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [reasonCode, setReasonCode] = useState<string>(CANCEL_REASON_CODES[0].value);
  const [customReason, setCustomReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    onError("");
    try {
      await cancelShopperOrder(orderId, {
        reasonCode,
        customReason: reasonCode === "OTHER" ? customReason : undefined,
      });
      await onDone();
    } catch (err: unknown) {
      onError(err instanceof ApiError ? err.message : "Unable to cancel this order.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-8 space-y-3 border-t border-border pt-5">
      <h3 className="text-sm font-medium">Cancel order</h3>
      <label className="block text-sm">
        <span className="text-muted-foreground">Reason</span>
        <select
          className="mt-1 h-11 w-full rounded-control border border-border bg-background px-3 text-sm"
          value={reasonCode}
          onChange={(e) => setReasonCode(e.target.value)}
        >
          {CANCEL_REASON_CODES.map((reason) => (
            <option key={reason.value} value={reason.value}>
              {reason.label}
            </option>
          ))}
        </select>
      </label>
      {reasonCode === "OTHER" ? (
        <textarea
          className="min-h-24 w-full rounded-control border border-border bg-background px-3 py-2 text-sm"
          value={customReason}
          onChange={(e) => setCustomReason(e.target.value)}
          placeholder="Tell us why you are cancelling"
        />
      ) : null}
      <Button
        type="button"
        variant="outline"
        onClick={() => void submit()}
        disabled={submitting}
      >
        {submitting ? "Cancelling…" : "Cancel this order"}
      </Button>
    </div>
  );
}

function ReturnForm({
  orderId,
  onDone,
  onError,
}: {
  orderId: string;
  onDone: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const toast = useToast();
  const [reasonCode, setReasonCode] = useState<string>(RETURN_REASON_CODES[0].value);
  const [reasonText, setReasonText] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!files || files.length === 0) {
      onError("Please upload at least one photo or video.");
      return;
    }
    setSubmitting(true);
    onError("");
    try {
      const evidence = await uploadReturnEvidence(orderId, files);
      await submitReturnRequest(orderId, {
        reasonCode,
        reasonText: reasonText || undefined,
        evidence,
      });
      toast.success("Request submitted", "Our team will review your Need Help request.");
      await onDone();
    } catch (err: unknown) {
      const message =
        err instanceof ApiError ? err.message : "Unable to submit this request.";
      toast.error("Request failed", message);
      onError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-8 space-y-3 border-t border-border pt-5">
      <h3 className="text-sm font-medium">Need Help — return or replacement</h3>
      <label className="block text-sm">
        <span className="text-muted-foreground">Reason</span>
        <select
          className="mt-1 h-11 w-full rounded-control border border-border bg-background px-3 text-sm"
          value={reasonCode}
          onChange={(e) => setReasonCode(e.target.value)}
        >
          {RETURN_REASON_CODES.map((reason) => (
            <option key={reason.value} value={reason.value}>
              {reason.label}
            </option>
          ))}
        </select>
      </label>
      <textarea
        className="min-h-24 w-full rounded-control border border-border bg-background px-3 py-2 text-sm"
        value={reasonText}
        onChange={(e) => setReasonText(e.target.value)}
        placeholder="Describe the issue"
      />
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
        multiple
        onChange={(e) => setFiles(e.target.files)}
      />
      <Button type="button" onClick={() => void submit()} disabled={submitting}>
        {submitting ? "Submitting…" : "Submit request"}
      </Button>
    </div>
  );
}

function OrderLineItemReview({
  productId,
  productName,
  reviewEligibility,
  orderId,
  onReload,
  onError,
}: {
  productId: string;
  productName: string;
  reviewEligibility: ReviewEligibility;
  orderId: string;
  onReload: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const message = getReviewEligibilityMessage(reviewEligibility);

  if (canWriteReview(reviewEligibility)) {
    return (
      <div className="mt-4 border-t border-border pt-4">
        <p className="text-xs text-muted-foreground">{message}</p>
        <ReviewForm
          productId={productId}
          productName={productName}
          orderId={orderId}
          onError={onError}
          onReload={onReload}
        />
      </div>
    );
  }

  if (isAlreadyReviewed(reviewEligibility)) {
    return (
      <div className="mt-4 border-t border-border pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Already reviewed
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{message}</p>
      </div>
    );
  }

  if (reviewEligibility.reason === "ORDER_NOT_DELIVERED") {
    return (
      <div className="mt-4 border-t border-border pt-4">
        <Button type="button" variant="secondary" disabled className="opacity-60">
          Write review
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">{message}</p>
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

function ReviewForm({
  productId,
  productName,
  orderId,
  onReload,
  onError,
}: {
  productId: string;
  productName: string;
  orderId: string;
  onReload: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const toast = useToast();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (rating < 1 || rating > 5) {
      onError("Please select a star rating.");
      return;
    }
    setSubmitting(true);
    onError("");
    try {
      const created = await createProductReview({
        productId,
        orderId,
        rating,
        comment: comment || undefined,
      });
      try {
        await fetchProductReviews(productId);
      } catch {
        /* POST product averages remain authoritative if list refetch fails */
      }
      const published =
        created.review?.status === "approved" ||
        created.review?.verifiedPurchase === true;
      toast.success(
        "Review submitted",
        published ? "It is now visible on the product page." : undefined,
      );
      onError("");
      await onReload();
    } catch (err: unknown) {
      const message =
        err instanceof ApiError ? err.message : "Unable to submit this review.";
      toast.error("Review failed", message);
      onError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      <p className="text-sm font-medium">{productName}</p>
      <div className="text-sm">
        <span className="text-muted-foreground">Rating</span>
        <div className="mt-1">
          <StarRatingInput
            value={rating}
            onChange={setRating}
            disabled={submitting}
          />
        </div>
      </div>
      <textarea
        className="min-h-24 w-full rounded-control border border-border bg-background px-3 py-2 text-sm"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Optional comment"
        disabled={submitting}
      />
      <Button
        type="button"
        onClick={() => void submit()}
        disabled={submitting || rating < 1}
      >
        {submitting ? "Submitting…" : "Submit review"}
      </Button>
    </div>
  );
}

function AppealForm({
  orderId,
  onDone,
  onError,
}: {
  orderId: string;
  onDone: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!reason.trim()) {
      onError("Please explain why you are appealing this decision.");
      return;
    }
    setSubmitting(true);
    onError("");
    try {
      await submitReturnAppeal(orderId, { reason });
      await onDone();
    } catch (err: unknown) {
      onError(err instanceof ApiError ? err.message : "Unable to submit this appeal.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-4 space-y-3 border-t border-border pt-4">
      <h4 className="text-sm font-medium">Appeal this decision</h4>
      <p className="text-xs text-muted-foreground">
        You can submit one appeal for admin review. This does not change refund policy.
      </p>
      <textarea
        className="min-h-24 w-full rounded-control border border-border bg-background px-3 py-2 text-sm"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why should this decision be reviewed?"
      />
      <Button
        type="button"
        variant="outline"
        onClick={() => void submit()}
        disabled={submitting}
      >
        {submitting ? "Submitting appeal…" : "Submit appeal"}
      </Button>
    </div>
  );
}
