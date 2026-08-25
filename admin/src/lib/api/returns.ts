import { apiRequest } from "./client";

export type AdminReturnRequest = {
  _id: string;
  status: string;
  caseFlow?: string;
  resolution?: string | null;
  reasonCode?: string | null;
  reasonText?: string | null;
  returnRequired?: boolean | null;
  replacementOrderId?: string | null;
  manualFollowUpRequired?: boolean;
  slaReminderSentAt?: string | null;
  slaEscalatedAt?: string | null;
  reverseLogistics?: {
    status?: string | null;
    awbCode?: string | null;
    trackingUrl?: string | null;
    lastError?: string | null;
    canRetry?: boolean;
  } | null;
  evidence?: Array<{ url?: string; mediaType?: string; fileName?: string | null }>;
  order?: {
    _id?: string;
    invoiceNumber?: string | null;
    status?: string;
    totalAmount?: number | null;
  } | null;
  actions?: {
    isSellerOwned?: boolean;
    canReviewReturn?: boolean;
    canAccept?: boolean;
    canReject?: boolean;
    canConfirmReceipt?: boolean;
    canSelectResolution?: boolean;
    canRetryPickup?: boolean;
    canAdminOverrideResolution?: boolean;
    isTerminal?: boolean;
  };
};

export async function fetchAdminReturns(): Promise<AdminReturnRequest[]> {
  const response = await apiRequest<{ requests?: AdminReturnRequest[] }>("/api/admin/returns");
  return Array.isArray(response.requests) ? response.requests : [];
}

export async function fetchAdminReturn(id: string): Promise<AdminReturnRequest | null> {
  const response = await apiRequest<{ request?: AdminReturnRequest }>(
    `/api/admin/returns/${encodeURIComponent(id)}`,
  );
  return response.request ?? null;
}

export async function reviewAfterSales(
  id: string,
  body: { action: "accept" | "reject"; returnRequired?: boolean; note?: string },
): Promise<AdminReturnRequest | null> {
  const response = await apiRequest<{ request?: AdminReturnRequest }>(
    `/api/admin/returns/${encodeURIComponent(id)}/after-sales/review`,
    { method: "PATCH", body },
  );
  return response.request ?? null;
}

export async function confirmAfterSalesReceipt(id: string, note?: string): Promise<AdminReturnRequest | null> {
  const response = await apiRequest<{ request?: AdminReturnRequest }>(
    `/api/admin/returns/${encodeURIComponent(id)}/after-sales/confirm-receipt`,
    { method: "PATCH", body: { note } },
  );
  return response.request ?? null;
}

export async function resolveAfterSales(
  id: string,
  body: { resolution: "replacement" | "repair" | "rejected"; reasonCode: string; note?: string },
): Promise<AdminReturnRequest | null> {
  const response = await apiRequest<{ request?: AdminReturnRequest }>(
    `/api/admin/returns/${encodeURIComponent(id)}/after-sales/resolution`,
    { method: "PATCH", body },
  );
  return response.request ?? null;
}

export async function retryAfterSalesPickup(id: string): Promise<AdminReturnRequest | null> {
  const response = await apiRequest<{ request?: AdminReturnRequest }>(
    `/api/admin/returns/${encodeURIComponent(id)}/after-sales/retry-pickup`,
    { method: "POST" },
  );
  return response.request ?? null;
}
