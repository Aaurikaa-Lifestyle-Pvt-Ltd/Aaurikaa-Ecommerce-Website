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
} from "@/lib/api/orders";
import { createProductReview, fetchProductReviews } from "@/lib/api/reviews";
import { initiatePhonePePayment } from "@/lib/api/payments";
import { formatCommerceApiError } from "@/lib/commerce-errors";
import { formatMoney } from "@/lib/format";
import { resolveMediaUrl } from "@/lib/mappers/media";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { StarRatingInput } from "@/components/ui/star-rating";
import { useToast } from "@/components/ui/toast";
import { BuyAgainButton } from "@/components/orders/buy-again-button";
import { OrderPricingBreakdown } from "@/components/orders/order-pricing-breakdown";
import { OrderDeliveryAddress } from "@/components/orders/order-delivery-address";

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
  const [reviewSuccessByProduct, setReviewSuccessByProduct] = useState<
    Record<string, string>
  >({});

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
  const reviewableItems = (order.items ?? []).filter(
    (item): item is ShopperOrderLineItem & { productId: string } =>
      Boolean(item.productId) &&
      item.reviewEligibility?.eligible === true &&
      !reviewSuccessByProduct[item.productId!],
  );

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

  return (
    <div className="max-w-2xl">
      <p className="text-sm">
        <Link href="/account/orders" className="underline-offset-4 hover:underline">
          All orders
        </Link>
      </p>
      <h2 className="mt-4 font-serif text-2xl tracking-tight">{order.orderId}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Placed {formatOrderDate(order.createdAt)}
      </p>
      <p className="mt-1 text-sm uppercase tracking-wide text-muted-foreground">
        {order.orderStatus}
        {visibility?.paymentStatus ? ` · ${visibility.paymentStatus}` : ""}
      </p>
      {order.fulfilmentKind === "replacement" ? (
        <p className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">
          Replacement shipment
        </p>
      ) : null}

      {visibility ? (
        <div className="mt-6 space-y-1 border-t border-border pt-5 text-sm">
          <h3 className="font-medium">Payment</h3>
          <p className="text-muted-foreground">
            {[visibility.paymentType || visibility.paymentMethod, visibility.gateway]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
          {visibility.paymentStatus ? (
            <p className="text-muted-foreground">Status: {visibility.paymentStatus}</p>
          ) : null}
          {visibility.channel ? (
            <p className="text-muted-foreground">Channel: {visibility.channel}</p>
          ) : null}
          {visibility.transactionId ? (
            <p className="text-muted-foreground">Txn: {visibility.transactionId}</p>
          ) : null}
          {visibility.paidAt ? (
            <p className="text-muted-foreground">
              Paid at {formatTimestamp(visibility.paidAt)}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        {showPayAgain ? (
          <Button type="button" onClick={() => void payAgain()} disabled={payingAgain}>
            {payingAgain ? (
              <>
                <Spinner /> Redirecting…
              </>
            ) : (
              "Pay again"
            )}
          </Button>
        ) : null}
        <BuyAgainButton orderId={orderId} redirectToCart />
        {shipment?.trackingAvailable && shipment.trackingUrl ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              window.open(shipment.trackingUrl!, "_blank", "noreferrer")
            }
          >
            Track shipment
          </Button>
        ) : null}
      </div>
      {paymentRetryError ? (
        <p className="mt-2 text-sm text-sale" role="alert">
          {paymentRetryError}
        </p>
      ) : null}

      <ul className="mt-8 space-y-4">
        {lineItems.map((item, index) => {
          const src = resolveMediaUrl("image" in item ? item.image : null);
          const unit = Number(
            "itemPrice" in item ? (item as ShopperOrderLineItem).itemPrice : NaN,
          );
          const lineTotal = lineDisplayTotal(item as ShopperOrderLineItem);
          return (
            <li
              key={`${item.productSlug ?? "item"}-${index}`}
              className="flex gap-3 text-sm"
            >
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-control bg-muted">
                {src ? (
                  <Image
                    src={src}
                    alt={item.productName || "Product"}
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{item.productName}</p>
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
                <span className="shrink-0 font-medium">
                  {formatMoney({ amount: lineTotal, currency: "INR" })}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {pricing ? (
        <div className="mt-8 border-t border-border pt-5">
          <h3 className="mb-3 text-sm font-medium">Order total</h3>
          <OrderPricingBreakdown
            pricingSummary={pricing}
            fallbackTotal={order.total}
          />
        </div>
      ) : null}

      <OrderDeliveryAddress
        order={order}
        className="mt-8 border-t border-border pt-5"
      />

      {shipment ? (
        <div className="mt-8 space-y-2 border-t border-border pt-5 text-sm">
          <h3 className="font-medium">Shipment</h3>
          <p className="text-muted-foreground">
            {shipment.shipmentStatus || "Not shipped yet"}
          </p>
          {shipment.courierName ? <p>{shipment.courierName}</p> : null}
          {shipment.awbNumber ? <p>AWB {shipment.awbNumber}</p> : null}
          {shipment.trackingAvailable && shipment.trackingUrl ? (
            <a
              href={shipment.trackingUrl}
              className="underline-offset-4 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              Track shipment
            </a>
          ) : null}
        </div>
      ) : null}

      {invoiceAvailable ? (
        <div className="mt-8 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void downloadInvoice()}
            disabled={downloading}
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
          >
            {printing ? (
              <>
                <Spinner /> Opening…
              </>
            ) : (
              "Print invoice"
            )}
          </Button>
          {invoiceError ? (
            <p className="w-full text-sm text-sale" role="alert">
              {invoiceError}
            </p>
          ) : null}
        </div>
      ) : null}

      {order.statusTimeline && order.statusTimeline.length > 0 ? (
        <ol className="mt-8 space-y-3 border-t border-border pt-5 text-sm">
          <li className="list-none">
            <h3 className="font-medium">Order timeline</h3>
          </li>
          {order.statusTimeline.map((step, idx) => {
            const when = formatTimestamp(step.timestamp);
            return (
              <li
                key={`${step.status}-${step.timestamp ?? idx}`}
                className="flex flex-col gap-0.5"
              >
                <span>{step.label || step.status}</span>
                {when ? (
                  <span className="text-xs text-muted-foreground">{when}</span>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}

      {actionError ? (
        <p className="mt-6 text-sm text-sale" role="alert">
          {actionError}
        </p>
      ) : null}

      {order.cancelEligibility?.eligible ? (
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
      ) : order.cancelEligibility?.message ? (
        <p className="mt-8 text-sm text-muted-foreground">
          {order.cancelEligibility.message}
        </p>
      ) : null}

      {reviewableItems.length > 0 || Object.keys(reviewSuccessByProduct).length > 0 ? (
        <div className="mt-8 space-y-6 border-t border-border pt-5">
          <h3 className="text-sm font-medium">Write a review</h3>
          {Object.entries(reviewSuccessByProduct).map(([productId, message]) => (
            <p key={productId} className="text-sm text-muted-foreground" role="status">
              {message}
            </p>
          ))}
          {reviewableItems.map((item) => (
            <ReviewForm
              key={item.productId}
              productId={item.productId}
              productName={item.productName || "Product"}
              onError={setActionError}
              onSubmitted={(message) => {
                setActionError(null);
                setReviewSuccessByProduct((prev) => ({
                  ...prev,
                  [item.productId]: message,
                }));
              }}
            />
          ))}
        </div>
      ) : order.reviewEligibility?.alreadyReviewed ? (
        <p className="mt-8 text-sm text-muted-foreground">
          You have already reviewed the items in this order.
        </p>
      ) : null}

      {returnRequest ? (
        <div className="mt-8 space-y-2 border-t border-border pt-5 text-sm">
          <h3 className="font-medium">Need Help — return or replacement</h3>
          <p className="uppercase tracking-wide text-muted-foreground">
            {returnRequest.status}
          </p>
          {returnRequest.resolution ? (
            <p>Resolution: {returnRequest.resolution}</p>
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
                className="underline-offset-4 hover:underline"
              >
                is in fulfilment
              </Link>
            </p>
          ) : null}
          {returnRequest.reverseLogistics?.awbCode ? (
            <p>Return pickup AWB {returnRequest.reverseLogistics.awbCode}</p>
          ) : null}
          {returnRequest.reverseLogistics?.trackingUrl ? (
            <a
              href={returnRequest.reverseLogistics.trackingUrl}
              className="underline-offset-4 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              Track return pickup
            </a>
          ) : null}
          {returnRequest.refundCompletedAt ||
          returnRequest.walletCreditProcessedAt ? (
            <p className="text-muted-foreground">A refund record exists on this case.</p>
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
      ) : order.returnEligibility?.message ? (
        <p className="mt-8 text-sm text-muted-foreground">
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

function ReviewForm({
  productId,
  productName,
  onSubmitted,
  onError,
}: {
  productId: string;
  productName: string;
  onSubmitted: (message: string) => void;
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
        rating,
        comment: comment || undefined,
      });
      // Refetch authoritative product summary (no WebSockets / no client-side average).
      try {
        await fetchProductReviews(productId);
      } catch {
        /* POST product averages remain authoritative if list refetch fails */
      }
      const published =
        created.review?.status === "approved" ||
        created.review?.verifiedPurchase === true;
      const message = published
        ? "Your review was published."
        : "Your review was submitted.";
      toast.success(
        "Review submitted",
        published ? "It is now visible on the product page." : undefined,
      );
      onSubmitted(message);
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
    <div className="space-y-3">
      <p className="text-sm">{productName}</p>
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
