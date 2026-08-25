import { apiRequest, apiRequestBlob } from "./client";
import type { CreateOrderRequest } from "../mappers/order-payload";

/** Matches reviewEligibilityService / shopperOrderDetailService item + order aggregate. */
export type ReviewEligibility = {
  eligible?: boolean;
  alreadyReviewed?: boolean;
  delivered?: boolean;
  reason?: string;
  message?: string;
};

export type ShopperPaymentVisibility = {
  /** List DTO may use paymentMethod; detail DTO uses paymentType (COD / ONLINE). */
  paymentMethod?: string;
  paymentType?: string;
  paymentStatus?: string;
  gateway?: string;
  channel?: string;
  transactionId?: string | null;
  paidAt?: string | null;
};

export type ShopperCustomerAddress = {
  name?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  district?: string | null;
  pincode?: string | null;
  country?: string | null;
};

export type ShopperOrderListItem = {
  _id: string;
  orderId: string;
  createdAt: string | null;
  total: number;
  /** Combined coupon + bulk discount from server snapshot; 0 when none. */
  discountAmount?: number;
  couponCode?: string | null;
  orderStatus: string;
  paymentVisibility?: ShopperPaymentVisibility;
  invoiceAvailable?: boolean;
  trackingSummary?: {
    shipmentStatus?: string | null;
    awbAvailable?: boolean;
    trackingAvailable?: boolean;
  };
  afterSales?: {
    status?: string | null;
    resolution?: string | null;
    replacementOrderId?: string | null;
    returnRequestId?: string | null;
  } | null;
  itemsPreview?: Array<{
    productName?: string;
    productSlug?: string | null;
    image?: string | null;
    quantity?: number;
    variantSummary?: string | null;
  }>;
  cancelEligibility?: {
    eligible?: boolean;
    reason?: string;
    message?: string;
  };
  reviewEligibility?: ReviewEligibility;
};

export type ShopperOrderLineItem = {
  productId?: string | null;
  productName?: string;
  productSlug?: string | null;
  image?: string | null;
  quantity?: number;
  variantSummary?: string | null;
  /** Unit price from order DTO — display only; never recalculate totals from this. */
  itemPrice?: number | null;
  reviewEligibility?: ReviewEligibility;
};

export type ShopperOrderSummary = {
  subtotal?: number;
  subtotalLabel?: string;
  itemsGstAdded?: number;
  shippingCharge?: number;
  shippingGst?: number;
  discountAmount?: number;
  couponCode?: string | null;
  total?: number;
};

export type ShopperOrderDetail = ShopperOrderListItem & {
  pricingSummary?: {
    subtotal?: number;
    shippingCharge?: number;
    taxAmount?: number;
    discountAmount?: number;
    couponCode?: string | null;
    couponDiscount?: number;
    bulkDiscount?: number;
    total?: number;
    requiresShipping?: boolean;
    gst?: {
      cgst?: number;
      sgst?: number;
      ugst?: number;
      igst?: number;
      taxType?: string | null;
    };
    orderSummary?: ShopperOrderSummary;
  };
  invoiceSummary?: {
    invoiceAvailable?: boolean;
    invoiceUrl?: string | null;
  };
  items?: ShopperOrderLineItem[];
  shipmentSummary?: {
    shipmentStatus?: string | null;
    courierName?: string | null;
    awbNumber?: string | null;
    trackingUrl?: string | null;
    trackingAvailable?: boolean;
  };
  statusTimeline?: Array<{ status?: string; label?: string; timestamp?: string | null }>;
  /** Prefer deliveryAddress (backend ADAPT); shippingDetails kept for older payloads. */
  deliveryAddress?: ShopperCustomerAddress | null;
  billingAddress?: ShopperCustomerAddress | null;
  shippingDetails?: {
    name?: string;
    address?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    district?: string;
    pincode?: string;
    phone?: string;
    country?: string;
  };
  cancelEligibility?: {
    eligible?: boolean;
    reason?: string;
    message?: string;
  };
  returnEligibility?: {
    eligible?: boolean;
    reason?: string;
    message?: string;
  };
  reviewEligibility?: ReviewEligibility;
  returnRequest?: ShopperReturnRequest | null;
  fulfilmentKind?: string;
  afterSales?: {
    status?: string | null;
    resolution?: string | null;
    replacementOrderId?: string | null;
    returnRequestId?: string | null;
  } | null;
};

export type BuyAgainResult = {
  success: boolean;
  addedItems: unknown[];
  failedItems: Array<{ reason?: string; productName?: string; productId?: string }>;
  warnings?: unknown[];
};

export type ShopperReturnAppeal = {
  canAppeal?: boolean;
  appealCount?: number;
  windowEndsAt?: string | null;
  appealedAt?: string | null;
  reason?: string | null;
  adminDecision?: string | null;
  adminDecidedAt?: string | null;
};

export type ShopperReturnRequest = {
  _id: string;
  status: string;
  resolution?: string | null;
  reasonCode?: string | null;
  reasonText?: string | null;
  reverseLogistics?: {
    status?: string | null;
    awbCode?: string | null;
    trackingUrl?: string | null;
  } | null;
  replacementOrderId?: string | null;
  refundCompletedAt?: string | null;
  walletCreditProcessedAt?: string | null;
  walletCreditAmount?: number | null;
  manualFollowUpRequired?: boolean;
  appeal?: ShopperReturnAppeal | null;
};

export const CANCEL_REASON_CODES = [
  { value: "ORDERED_BY_MISTAKE", label: "Ordered by mistake" },
  { value: "FOUND_BETTER_PRICE", label: "Found a better price" },
  { value: "DELIVERY_TOO_SLOW", label: "Delivery is too slow" },
  { value: "PAYMENT_ISSUE", label: "Payment issue" },
  { value: "CHANGE_OF_MIND", label: "Changed my mind" },
  { value: "OTHER", label: "Other" },
] as const;

export const RETURN_REASON_CODES = [
  { value: "DEFECTIVE_DAMAGED", label: "Defective or damaged" },
  { value: "WRONG_ITEM", label: "Wrong item received" },
  { value: "NOT_AS_DESCRIBED", label: "Not as described" },
  { value: "CHANGE_OF_MIND", label: "Changed my mind" },
  { value: "QUALITY_NOT_SATISFACTORY", label: "Quality not satisfactory" },
  { value: "OTHER", label: "Other" },
] as const;

type CreateOrderResponse = {
  message?: string;
  order?: {
    _id?: string;
    invoiceNumber?: string;
    totalAmount?: number;
    status?: string;
    paymentStatus?: string;
    paymentMethod?: string;
  };
  invoiceNumber?: string;
};

type ListResponse = {
  orders?: ShopperOrderListItem[];
  pagination?: { page?: number; limit?: number; totalPages?: number; totalCount?: number };
};

export async function createShopperOrder(
  payload: CreateOrderRequest,
  idempotencyKey: string,
): Promise<{
  id: string;
  invoiceNumber: string;
  totalAmount?: number;
  status?: string;
  paymentStatus?: string;
}> {
  const response = await apiRequest<CreateOrderResponse>("/api/orders", {
    method: "POST",
    auth: true,
    body: payload,
    headers: { "Idempotency-Key": idempotencyKey },
  });
  const id = String(response.order?._id ?? "");
  const invoiceNumber = String(
    response.invoiceNumber ?? response.order?.invoiceNumber ?? id,
  );
  if (!id) {
    throw new Error("Order was created without an identifier.");
  }
  return {
    id,
    invoiceNumber,
    totalAmount: response.order?.totalAmount,
    status: response.order?.status,
    paymentStatus: response.order?.paymentStatus,
  };
}

export async function fetchShopperOrders(): Promise<ShopperOrderListItem[]> {
  const response = await apiRequest<ListResponse>("/api/shopper/orders", {
    auth: true,
  });
  return Array.isArray(response.orders) ? response.orders : [];
}

export async function fetchShopperOrder(id: string): Promise<ShopperOrderDetail> {
  const response = await apiRequest<{ order?: ShopperOrderDetail }>(
    `/api/shopper/orders/${encodeURIComponent(id)}`,
    { auth: true },
  );
  if (!response.order?._id) {
    throw new Error("Order was not found.");
  }
  return response.order;
}

async function fetchShopperInvoiceBlob(orderId: string): Promise<Blob> {
  return apiRequestBlob(`/api/orders/${encodeURIComponent(orderId)}/invoice`, {
    auth: true,
  });
}

export async function downloadShopperInvoice(orderId: string): Promise<void> {
  const blob = await fetchShopperInvoiceBlob(orderId);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `invoice-${orderId}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Open invoice PDF in a new tab and trigger print when the browser allows it. */
export async function printShopperInvoice(orderId: string): Promise<void> {
  const blob = await fetchShopperInvoiceBlob(orderId);
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (win) {
    const revoke = () => URL.revokeObjectURL(url);
    win.addEventListener("load", () => {
      try {
        win.focus();
        win.print();
      } catch {
        // Print may be blocked; tab still shows the PDF.
      }
      window.setTimeout(revoke, 60_000);
    });
    window.setTimeout(revoke, 120_000);
    return;
  }
  // Popup blocked — fall back to download.
  URL.revokeObjectURL(url);
  await downloadShopperInvoice(orderId);
}

/**
 * POST /api/shopper/orders/:id/buy-again — rehydrate cart with live stock/prices.
 */
export async function buyAgainFromOrder(orderId: string): Promise<BuyAgainResult> {
  const response = await apiRequest<{
    success?: boolean;
    addedItems?: unknown[];
    failedItems?: BuyAgainResult["failedItems"];
    warnings?: unknown[];
    message?: string;
  }>(`/api/shopper/orders/${encodeURIComponent(orderId)}/buy-again`, {
    method: "POST",
    auth: true,
    body: {},
  });
  return {
    success: Boolean(response.success),
    addedItems: Array.isArray(response.addedItems) ? response.addedItems : [],
    failedItems: Array.isArray(response.failedItems) ? response.failedItems : [],
    warnings: Array.isArray(response.warnings) ? response.warnings : [],
  };
}

export async function cancelShopperOrder(
  orderId: string,
  payload: { reasonCode: string; customReason?: string },
): Promise<void> {
  await apiRequest(`/api/orders/${encodeURIComponent(orderId)}/cancel`, {
    method: "PUT",
    auth: true,
    body: payload,
  });
}

export async function uploadReturnEvidence(
  orderId: string,
  files: FileList | File[],
): Promise<Array<{ url: string; mediaType?: string; fileName?: string | null }>> {
  const form = new FormData();
  Array.from(files).forEach((file) => form.append("evidence", file));
  const response = await apiRequest<{ evidence?: Array<{ url: string; mediaType?: string; fileName?: string | null }> }>(
    `/api/shopper/orders/${encodeURIComponent(orderId)}/return-evidence`,
    { method: "POST", auth: true, body: form },
  );
  return Array.isArray(response.evidence) ? response.evidence : [];
}

export async function submitReturnRequest(
  orderId: string,
  payload: {
    reasonCode: string;
    reasonText?: string;
    evidence: Array<{ url: string; mediaType?: string; fileName?: string | null }>;
  },
): Promise<ShopperReturnRequest> {
  const response = await apiRequest<{ returnRequest?: ShopperReturnRequest }>(
    `/api/shopper/orders/${encodeURIComponent(orderId)}/return-request`,
    { method: "POST", auth: true, body: payload },
  );
  if (!response.returnRequest?._id) {
    throw new Error("Return request was not created.");
  }
  return response.returnRequest;
}

/**
 * PhonePe retry when unpaid/failed — mirrors paymentController initiate gates
 * (pending / pending_verification, or cancelled + failed payment).
 * Uses paymentVisibility.gateway / paymentStatus from shopper order detail DTO.
 */
export function canRetryPhonePePayment(
  order: Pick<ShopperOrderDetail, "orderStatus" | "paymentVisibility">,
): boolean {
  const visibility = order.paymentVisibility;
  if (!visibility) return false;

  const gateway = String(visibility.gateway || "").toUpperCase();
  const methodHint = String(visibility.paymentMethod || "").toLowerCase();
  const isPhonePe = gateway === "PHONEPE" || methodHint === "phonepe";
  if (!isPhonePe) return false;

  const paymentStatus = String(visibility.paymentStatus || "").toUpperCase();
  if (paymentStatus === "PAID" || paymentStatus === "SUCCESS") return false;

  const orderStatus = String(order.orderStatus || "").toLowerCase();
  if (orderStatus === "pending" || orderStatus === "pending_verification") {
    return true;
  }
  if (orderStatus === "cancelled" && paymentStatus === "FAILED") {
    return true;
  }
  return false;
}

export function buildReturnAppealPayload(input: {
  reason: string;
  evidence?: Array<{ url: string; mediaType?: string; fileName?: string | null }>;
}): { reason: string; evidence?: Array<{ url: string; mediaType?: string; fileName?: string | null }> } {
  const payload: {
    reason: string;
    evidence?: Array<{ url: string; mediaType?: string; fileName?: string | null }>;
  } = {
    reason: input.reason.trim(),
  };
  if (input.evidence && input.evidence.length > 0) {
    payload.evidence = input.evidence;
  }
  return payload;
}

/** POST /api/shopper/orders/:id/return-appeal — one-time appeal after seller resolution. */
export async function submitReturnAppeal(
  orderId: string,
  payload: {
    reason: string;
    evidence?: Array<{ url: string; mediaType?: string; fileName?: string | null }>;
  },
): Promise<ShopperReturnRequest> {
  const body = buildReturnAppealPayload(payload);
  const response = await apiRequest<{
    returnRequest?: ShopperReturnRequest;
    message?: string;
  }>(`/api/shopper/orders/${encodeURIComponent(orderId)}/return-appeal`, {
    method: "POST",
    auth: true,
    body,
  });
  if (!response.returnRequest?._id) {
    throw new Error(response.message || "Appeal was not submitted.");
  }
  return response.returnRequest;
}
