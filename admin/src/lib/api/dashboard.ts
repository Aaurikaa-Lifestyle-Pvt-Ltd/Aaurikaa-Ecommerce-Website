import { apiRequest, unwrapData } from "./client";

export type DashboardStats = {
  lastUpdated?: string;
  overview?: {
    totalProducts?: number;
    totalShoppers?: number;
    totalOrders?: number;
    totalRevenue?: number;
  };
  today?: { orders?: number; revenue?: number };
  products?: { total?: number; lowStock?: number };
  orders?: { pending?: number; total?: number };
};

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const response = await apiRequest<{ data?: DashboardStats }>("/api/dashboard/stats");
  return unwrapData(response) ?? {};
}
