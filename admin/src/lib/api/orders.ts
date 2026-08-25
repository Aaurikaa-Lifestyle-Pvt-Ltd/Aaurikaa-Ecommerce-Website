import { apiRequest, apiRequestBlob, unwrapData } from "./client";
import { mapAdminOrder, mapAdminOrders, type MappedAdminOrder } from "../mappers/order";

export async function fetchAdminOrders(): Promise<MappedAdminOrder[]> {
  const response = await apiRequest<{ orders?: unknown[] }>("/api/admin/orders");
  return mapAdminOrders(response.orders);
}

export async function fetchAdminOrder(id: string): Promise<MappedAdminOrder | null> {
  const response = await apiRequest<{ order?: Record<string, unknown> }>(
    `/api/admin/orders/${encodeURIComponent(id)}`,
  );
  return mapAdminOrder(response.order);
}

export async function syncAdminShiprocket(orderId: string): Promise<void> {
  await apiRequest(`/api/admin/shiprocket-fulfillment/${encodeURIComponent(orderId)}/sync`, {
    method: "POST",
  });
}

export async function generateAdminAwb(orderId: string): Promise<void> {
  await apiRequest(
    `/api/admin/shiprocket-fulfillment/${encodeURIComponent(orderId)}/generate-awb`,
    { method: "POST" },
  );
}

/** Prefer existing mapped label URL; otherwise fetch from Shiprocket label endpoint. */
export async function downloadAdminShiprocketLabel(
  orderId: string,
  existingUrl?: string | null,
): Promise<void> {
  let labelUrl = existingUrl?.trim() || "";
  if (!labelUrl) {
    const response = await apiRequest<{ data?: { url?: string }; url?: string }>(
      `/api/admin/shiprocket-fulfillment/${encodeURIComponent(orderId)}/label`,
    );
    const data = unwrapData(response) as { url?: string } | null;
    labelUrl = String(data?.url || response.url || "").trim();
  }
  if (!labelUrl) {
    throw new Error("Shipping label URL was not available.");
  }
  const link = document.createElement("a");
  link.href = labelUrl;
  link.target = "_blank";
  link.rel = "noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function updateAdminOrderStatus(
  id: string,
  status: string,
): Promise<MappedAdminOrder | null> {
  const response = await apiRequest<{ order?: Record<string, unknown> }>(
    `/api/admin/orders/${id}/status`,
    { method: "PUT", body: { status } },
  );
  return mapAdminOrder(response.order);
}

export async function downloadAdminInvoice(orderId: string): Promise<void> {
  const blob = await apiRequestBlob(`/api/admin/orders/${encodeURIComponent(orderId)}/invoice`);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `invoice-${orderId}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
