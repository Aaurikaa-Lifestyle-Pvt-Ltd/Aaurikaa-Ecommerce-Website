import type { AdminOrder, OrderLine, OrderStatus } from "@/types/admin";
import { idString, resolveMediaUrl } from "./media";
import { FULFILMENT_STATUSES, mapOrderStatusLabel } from "./helpers";

export { FULFILMENT_STATUSES };

export function mapOrderStatus(status?: string): OrderStatus {
  return mapOrderStatusLabel(status) as OrderStatus;
}

function formatAddress(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function mapLine(raw: {
  product?: { _id?: unknown; name?: string; sku?: string; images?: string[]; mainImage?: string };
  quantity?: number;
  price?: number;
  variantPriceSnapshot?: number;
  image?: string;
  variantSku?: string;
}): OrderLine {
  const productId = idString(raw.product?._id);
  const unit = Number(raw.variantPriceSnapshot ?? raw.price) || 0;
  return {
    productId,
    name: String(raw.product?.name ?? "Item"),
    sku: String(raw.variantSku ?? raw.product?.sku ?? ""),
    image: resolveMediaUrl(raw.image || raw.product?.mainImage || raw.product?.images?.[0]),
    quantity: Number(raw.quantity) || 1,
    unitPrice: unit,
  };
}

export type MappedAdminOrder = AdminOrder & {
  backendStatus: string;
  paymentStatus?: string;
};

export function mapAdminOrder(raw: Record<string, unknown> | null | undefined): MappedAdminOrder | null {
  if (!raw) return null;
  const id = idString(raw._id);
  if (!id) return null;
  const buyer = (raw.buyer ?? {}) as {
    _id?: unknown;
    firstName?: string;
    lastName?: string;
    email?: string;
  };
  const shipping = (raw.shippingDetails ?? {}) as Record<string, unknown>;
  const billing = (raw.billingDetails ?? {}) as Record<string, unknown>;
  const items = Array.isArray(raw.items) ? raw.items : [];
  const name =
    String(shipping.name || billing.name || `${buyer.firstName ?? ""} ${buyer.lastName ?? ""}`).trim() ||
    "Customer";
  const paymentMethod = String(raw.paymentMethod ?? "");
  const paymentStatus = String(raw.paymentStatus ?? "");

  return {
    id,
    number: String(raw.invoiceNumber ?? id),
    customerId: idString(buyer._id),
    customerName: name,
    customerEmail: String(buyer.email || billing.email || shipping.email || ""),
    amount: Number(raw.totalAmount) || 0,
    date: String(raw.createdAt ?? new Date().toISOString()),
    status: mapOrderStatus(String(raw.status ?? "")),
    payment: [paymentMethod, paymentStatus].filter(Boolean).join(" · ") || "—",
    shipping: {
      name,
      address: formatAddress(shipping.address),
      city: String(shipping.city ?? ""),
      pincode: String(shipping.pincode ?? ""),
      phone: String(shipping.phone ?? ""),
    },
    lines: items.map((item) => mapLine(item as Parameters<typeof mapLine>[0])),
    backendStatus: String(raw.status ?? "pending"),
    paymentStatus,
    fulfilmentKind: String(raw.fulfilmentKind || "sale"),
    sourceOrderId: idString(raw.sourceOrder) || null,
    afterSales: (() => {
      const summary = raw.afterSales as MappedAdminOrder["afterSales"] | null | undefined;
      if (!summary) return null;
      const returnRequestId =
        summary.returnRequestId != null && String(summary.returnRequestId).trim()
          ? String(summary.returnRequestId)
          : null;
      return { ...summary, returnRequestId };
    })(),
    trackingNumber: raw.trackingNumber ? String(raw.trackingNumber) : null,
    shiprocketLabelUrl: raw.shiprocketLabelUrl ? String(raw.shiprocketLabelUrl) : null,
    shipments: Array.isArray(raw.shiprocketShipments)
      ? raw.shiprocketShipments.map((shipment) => {
          const row = shipment as {
            status?: string;
            trackingNumber?: string;
            shiprocketOrderId?: string;
            shiprocketShipmentId?: string;
            shiprocketLabelUrl?: string;
          };
          return {
            status: row.status || null,
            trackingNumber: row.trackingNumber || null,
            shiprocketOrderId: row.shiprocketOrderId || null,
            shiprocketShipmentId: row.shiprocketShipmentId || null,
            shiprocketLabelUrl: row.shiprocketLabelUrl || null,
          };
        })
      : [],
  };
}

export function mapAdminOrders(raw: unknown): MappedAdminOrder[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => mapAdminOrder(item as Record<string, unknown>))
    .filter((item): item is MappedAdminOrder => Boolean(item));
}
