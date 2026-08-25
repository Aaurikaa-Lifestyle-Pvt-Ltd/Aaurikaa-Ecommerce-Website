import { apiRequest } from "./client";

export type ShopperDashboardStats = {
  activeOrders?: number;
  wishlistCount?: number;
  totalSpent?: number;
};

/**
 * Soft-read shopper dashboard counters. Callers should treat failures as empty.
 * GET /api/shopper/dashboard/stats
 */
export async function fetchShopperDashboardStats(): Promise<ShopperDashboardStats | null> {
  try {
    const response = await apiRequest<ShopperDashboardStats>("/api/shopper/dashboard/stats", {
      auth: true,
    });
    if (!response || typeof response !== "object") return null;
    return {
      activeOrders:
        typeof response.activeOrders === "number" ? response.activeOrders : undefined,
      wishlistCount:
        typeof response.wishlistCount === "number" ? response.wishlistCount : undefined,
      totalSpent: typeof response.totalSpent === "number" ? response.totalSpent : undefined,
    };
  } catch {
    return null;
  }
}
