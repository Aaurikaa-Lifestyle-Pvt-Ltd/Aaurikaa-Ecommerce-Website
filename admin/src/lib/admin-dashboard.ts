import type { AdminNavItem } from "@/lib/nav";
import { hasAssignedAdminPermissions } from "@/lib/admin-permissions";

export type DashboardWidgetId =
  | "todays_sales"
  | "pending_orders"
  | "customers"
  | "low_stock"
  | "shipments"
  | "returns";

export type DashboardSectionId = "recent_orders" | "top_products" | "low_stock_list";

export type DashboardGate = {
  id: string;
  permission: { domain: string; action: string };
};

/** Primary summary cards — gated by module view permissions (no finance for AAURIKAA). */
export const ADMIN_DASHBOARD_WIDGETS: Array<DashboardGate & { id: DashboardWidgetId }> = [
  { id: "todays_sales", permission: { domain: "orders", action: "view" } },
  { id: "pending_orders", permission: { domain: "orders", action: "view" } },
  { id: "customers", permission: { domain: "shoppers", action: "view" } },
  { id: "low_stock", permission: { domain: "catalog", action: "view" } },
  { id: "shipments", permission: { domain: "orders", action: "view" } },
  { id: "returns", permission: { domain: "order_returns", action: "view" } },
];

export const ADMIN_DASHBOARD_SECTIONS: Array<DashboardGate & { id: DashboardSectionId }> = [
  { id: "recent_orders", permission: { domain: "orders", action: "view" } },
  { id: "top_products", permission: { domain: "catalog", action: "view" } },
  { id: "low_stock_list", permission: { domain: "catalog", action: "view" } },
];

export function filterDashboardGates<T extends DashboardGate>(
  gates: T[],
  checkPermission: (domain: string, action: string) => boolean,
  isSuperAdmin: boolean,
): T[] {
  if (isSuperAdmin) return gates;
  return gates.filter(({ permission }) =>
    checkPermission(permission.domain, permission.action),
  );
}

export function canViewAnyDashboardContent(
  checkPermission: (domain: string, action: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  if (isSuperAdmin) return true;
  return [...ADMIN_DASHBOARD_WIDGETS, ...ADMIN_DASHBOARD_SECTIONS].some(({ permission }) =>
    checkPermission(permission.domain, permission.action),
  );
}

export { hasAssignedAdminPermissions };

/** Nav links useful as shortcuts when dashboard widgets are empty but staff has other modules. */
export function authorizedModuleLinks(
  navItems: AdminNavItem[],
  limit = 6,
): Array<{ href: string; label: string }> {
  return navItems
    .filter(
      (item) =>
        !item.alwaysAccessible &&
        item.href !== "/admin" &&
        item.href !== "/admin/settings",
    )
    .slice(0, limit)
    .map((item) => ({ href: item.href, label: item.label }));
}
