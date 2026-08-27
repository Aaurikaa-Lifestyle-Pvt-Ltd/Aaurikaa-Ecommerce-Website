"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  Button,
  Card,
  CardHeader,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  Select,
} from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import {
  fetchAdminOrder,
  updateAdminOrderStatus,
  downloadAdminInvoice,
  downloadAdminShiprocketLabel,
  syncAdminShiprocket,
  generateAdminAwb,
} from "@/lib/api/orders";
import { ApiError } from "@/lib/api/errors";
import { formatDateTime, formatMoney } from "@/lib/format";
import { FULFILMENT_STATUSES, type MappedAdminOrder } from "@/lib/mappers/order";
import { isRemoteSrc } from "@/lib/mappers/media";
import { toast, toastMessageFromUnknown } from "@/lib/toast";
import { useAdminResource } from "@/lib/use-admin-resource";

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderQuery = useAdminResource(() => fetchAdminOrder(params.id), [params.id]);
  const seed = orderQuery.data;

  if (orderQuery.loading) {
    return (
      <div>
        <PageHeader title="Order" />
        <LoadingState message="Loading order…" />
      </div>
    );
  }

  if (orderQuery.error) {
    return (
      <div>
        <PageHeader title="Order" />
        <ErrorState message={orderQuery.error} onRetry={() => void orderQuery.reload()} />
      </div>
    );
  }

  if (!seed) {
    return (
      <div>
        <PageHeader title="Order not found" />
        <Link href="/admin/orders" className="text-sm font-medium text-accent">
          Back to orders
        </Link>
      </div>
    );
  }

  return <OrderDetailView seed={seed} onReload={() => orderQuery.reload()} />;
}

function OrderDetailView({
  seed,
  onReload,
}: {
  seed: MappedAdminOrder;
  onReload: () => Promise<void>;
}) {
  const [status, setStatus] = useState(seed.backendStatus || "pending");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [shippingBusy, setShippingBusy] = useState(false);

  async function saveStatus() {
    setSaving(true);
    setSaveError(null);
    try {
      await updateAdminOrderStatus(seed.id, status);
      toast.success("Order status updated");
      await onReload();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Unable to update order status.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={seed.number}
        description={formatDateTime(seed.date)}
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => {
                setSaveError(null);
                downloadAdminInvoice(seed.id).catch((err: unknown) => {
                  setSaveError(
                    err instanceof ApiError ? err.message : "Unable to download this invoice.",
                  );
                });
              }}
            >
              Download invoice
            </Button>
            <Link
              href="/admin/orders"
              className="inline-flex h-11 items-center rounded-[var(--radius-sm)] border border-border bg-surface px-4 text-sm font-medium"
            >
              Back
            </Link>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={seed.status} />
        <span className="text-sm text-muted-foreground">{seed.payment}</span>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader
            title="Status"
            description="Fulfilment transitions only. Paid confirmation stays on the payment APIs."
          />
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:p-5">
            <Field label="Order status" htmlFor="order-status" className="flex-1">
              <Select
                id="order-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {FULFILMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
            <Button onClick={() => void saveStatus()} disabled={saving}>
              {saving ? "Updating…" : "Update status"}
            </Button>
          </div>
          {saveError ? (
            <p className="px-4 pb-4 text-sm text-danger" role="alert">
              {saveError}
            </p>
          ) : null}
        </Card>

        <Card>
          <CardHeader
            title="Shipment"
            description="Shiprocket sync uses existing credentials. Missing configuration fails closed."
          />
          <div className="space-y-3 p-4 text-sm sm:p-5">
            {seed.fulfilmentKind === "replacement" ? (
              <p className="text-muted-foreground">This is a replacement fulfilment order.</p>
            ) : null}
            {seed.trackingNumber ? <p>Legacy AWB {seed.trackingNumber}</p> : null}
            {(seed.shipments ?? []).length === 0 ? (
              <p className="text-muted-foreground">No Shiprocket shipment recorded yet.</p>
            ) : (
              <ul className="space-y-2">
                {seed.shipments?.map((shipment, index) => (
                  <li key={`${shipment.shiprocketShipmentId || "s"}-${index}`}>
                    <p>{shipment.status || "pending"}</p>
                    {shipment.trackingNumber ? <p>AWB {shipment.trackingNumber}</p> : null}
                    {shipment.shiprocketOrderId ? (
                      <p className="text-muted-foreground">SR order {shipment.shiprocketOrderId}</p>
                    ) : null}
                    {shipment.trackingNumber ? (
                      <a
                        href={`https://shiprocket.co/tracking/${encodeURIComponent(shipment.trackingNumber)}`}
                        className="font-medium text-accent"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Track
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                disabled={shippingBusy}
                onClick={() => {
                  setShippingBusy(true);
                  syncAdminShiprocket(seed.id)
                    .then(async () => {
                      toast.success("Shiprocket synced");
                      await onReload();
                    })
                    .catch((err: unknown) => {
                      toast.error(
                        toastMessageFromUnknown(err, "Unable to sync Shiprocket."),
                      );
                    })
                    .finally(() => setShippingBusy(false));
                }}
              >
                Sync Shiprocket
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={shippingBusy}
                onClick={() => {
                  setShippingBusy(true);
                  generateAdminAwb(seed.id)
                    .then(async () => {
                      toast.success("AWB generated");
                      await onReload();
                    })
                    .catch((err: unknown) => {
                      toast.error(
                        toastMessageFromUnknown(err, "Unable to generate AWB."),
                      );
                    })
                    .finally(() => setShippingBusy(false));
                }}
              >
                Generate AWB
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={shippingBusy}
                onClick={() => {
                  setShippingBusy(true);
                  const existingLabel =
                    seed.shiprocketLabelUrl ||
                    seed.shipments?.find((s) => s.shiprocketLabelUrl)?.shiprocketLabelUrl ||
                    null;
                  downloadAdminShiprocketLabel(seed.id, existingLabel)
                    .then(() => {
                      toast.success("Shipping label downloaded");
                    })
                    .catch((err: unknown) => {
                      toast.error(
                        toastMessageFromUnknown(err, "Unable to download shipping label."),
                      );
                    })
                    .finally(() => setShippingBusy(false));
                }}
              >
                Download label
              </Button>
            </div>
          </div>
        </Card>

        {seed.afterSales ? (
          <Card>
            <CardHeader title="After-sales" />
            <div className="space-y-1 p-4 text-sm sm:p-5">
              <p>{seed.afterSales.status}</p>
              {seed.afterSales.resolution ? <p>Resolution {seed.afterSales.resolution}</p> : null}
              <Link
                href={
                  seed.afterSales.returnRequestId
                    ? `/admin/returns/${seed.afterSales.returnRequestId}`
                    : "/admin/returns"
                }
                className="inline-block pt-2 font-medium text-accent"
              >
                {seed.afterSales.returnRequestId ? "Open return case" : "Open returns queue"}
              </Link>
            </div>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="Customer" />
          <div className="space-y-1 p-4 text-sm sm:p-5">
            <p className="font-semibold">{seed.customerName}</p>
            <p className="text-muted-foreground">{seed.customerEmail}</p>
            {seed.customerId ? (
              <Link
                href={`/admin/customers/${seed.customerId}`}
                className="inline-block pt-2 font-medium text-accent"
              >
                View customer
              </Link>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="Products" />
          <ul className="divide-y divide-border">
            {seed.lines.map((line, index) => (
              <li key={`${line.productId}-${line.sku}-${index}`} className="flex gap-3 px-4 py-3.5 sm:px-5">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                  <Image
                    src={line.image}
                    alt={line.name}
                    fill
                    className="object-cover"
                    sizes="56px"
                    unoptimized={isRemoteSrc(line.image)}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{line.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {line.sku} · Qty {line.quantity}
                  </p>
                </div>
                <p className="text-sm font-semibold">
                  {formatMoney(line.unitPrice * line.quantity)}
                </p>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Payment" />
          <div className="p-4 text-sm sm:p-5">
            <p className="font-medium">{seed.payment}</p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Shipping" />
          <div className="space-y-1 p-4 text-sm sm:p-5">
            <p className="font-medium">{seed.shipping.name}</p>
            <p className="text-muted-foreground">{seed.shipping.address}</p>
            <p className="text-muted-foreground">
              {seed.shipping.city} {seed.shipping.pincode}
            </p>
            <p className="text-muted-foreground">{seed.shipping.phone}</p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Order totals" />
          <div className="space-y-2 p-4 text-sm sm:p-5">
            {seed.pricing ? (
              <>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{seed.pricing.subtotalLabel}</span>
                  <span className="font-medium">{formatMoney(seed.pricing.subtotal)}</span>
                </div>
                {seed.pricing.couponDiscount > 0 ? (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">
                      {seed.pricing.couponCode
                        ? `Coupon (${seed.pricing.couponCode})`
                        : "Coupon discount"}
                    </span>
                    <span className="font-medium text-danger">
                      −{formatMoney(seed.pricing.couponDiscount)}
                    </span>
                  </div>
                ) : null}
                {seed.pricing.bulkDiscount > 0 ? (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Bulk discount</span>
                    <span className="font-medium text-danger">
                      −{formatMoney(seed.pricing.bulkDiscount)}
                    </span>
                  </div>
                ) : null}
                {seed.pricing.discountAmount > 0 &&
                seed.pricing.couponDiscount <= 0 &&
                seed.pricing.bulkDiscount <= 0 ? (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">
                      {seed.pricing.couponCode
                        ? `Discount (${seed.pricing.couponCode})`
                        : "Discount"}
                    </span>
                    <span className="font-medium text-danger">
                      −{formatMoney(seed.pricing.discountAmount)}
                    </span>
                  </div>
                ) : null}
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Shipping</span>
                  <span className="font-medium">
                    {seed.pricing.shippingCharge === 0
                      ? "Complimentary"
                      : formatMoney(seed.pricing.shippingCharge)}
                  </span>
                </div>
                {seed.pricing.taxAmount > 0 ? (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">GST / tax</span>
                    <span className="font-medium">{formatMoney(seed.pricing.taxAmount)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between gap-4 border-t border-border pt-3 text-base">
                  <span className="font-medium">Order total</span>
                  <span className="font-semibold">{formatMoney(seed.pricing.total || seed.amount)}</span>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Order total</span>
                <span className="text-xl font-semibold">{formatMoney(seed.amount)}</span>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
