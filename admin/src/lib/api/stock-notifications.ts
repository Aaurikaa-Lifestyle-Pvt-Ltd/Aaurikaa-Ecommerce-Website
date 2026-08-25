import { apiRequest } from "./client";

export type StockNotificationRequest = {
  _id: string;
  status?: string;
  variantCombination?: string;
  createdAt?: string;
  shopper?: { firstName?: string; lastName?: string; email?: string };
  product?: { name?: string; sku?: string; stock?: number };
};

export async function fetchStockNotifications(
  status = "pending",
): Promise<StockNotificationRequest[]> {
  const response = await apiRequest<{ requests?: StockNotificationRequest[] }>(
    `/api/admin/stock-notifications?status=${encodeURIComponent(status)}`,
  );
  return Array.isArray(response.requests) ? response.requests : [];
}
