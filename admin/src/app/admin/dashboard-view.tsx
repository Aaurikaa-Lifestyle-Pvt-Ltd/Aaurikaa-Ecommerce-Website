"use client";

import Image from "next/image";
import Link from "next/link";
import { Card, ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { useAuth } from "@/lib/auth";
import {
  ADMIN_DASHBOARD_SECTIONS,
  ADMIN_DASHBOARD_WIDGETS,
  authorizedModuleLinks,
  canViewAnyDashboardContent,
  filterDashboardGates,
  hasAssignedAdminPermissions,
} from "@/lib/admin-dashboard";
import { fetchDashboardStats, type DashboardStats } from "@/lib/api/dashboard";
import { fetchAdminOrders } from "@/lib/api/orders";
import { fetchAdminProducts } from "@/lib/api/products";
import { fetchAdminReturns } from "@/lib/api/returns";
import { formatDate, formatMoney } from "@/lib/format";
import { isRemoteSrc } from "@/lib/mappers/media";
import { adminNav, filterAdminNav } from "@/lib/nav";
import { useAdminResource } from "@/lib/use-admin-resource";

function NoPermissionsState({ name }: { name?: string }) {
  return (
    <div>
      <PageHeader
        title={name ? `Welcome, ${name}` : "Welcome"}
        description="Your account does not have module permissions yet."
      />
      <Card className="px-4 py-8 text-center sm:px-6">
        <p className="text-sm text-muted-foreground">
          Ask a Super Admin to assign permissions for the areas you need to work in.
        </p>
        <div className="mt-5">
          <Link
            href="/admin/settings"
            className="inline-flex h-10 items-center justify-center rounded-[var(--radius-sm)] border border-border bg-surface px-4 text-sm font-medium text-foreground transition hover:bg-muted"
          >
            Go to Account
          </Link>
        </div>
      </Card>
    </div>
  );
}

function RestrictedDashboard({
  modules,
}: {
  modules: Array<{ href: string; label: string }>;
}) {
  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="No summary widgets are available for your current permissions."
      />
      <Card className="px-4 py-6 sm:px-5">
        <p className="text-sm text-muted-foreground">
          You can still open the modules you are allowed to use:
        </p>
        {modules.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No modules are available. Contact a Super Admin if this looks wrong.
          </p>
        ) : (
          <ul className="mt-4 flex flex-wrap gap-2">
            {modules.map((mod) => (
              <li key={mod.href}>
                <Link
                  href={mod.href}
                  className="inline-flex rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
                >
                  {mod.label}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export function DashboardView() {
  const { user, hasPermission, isSuperAdmin } = useAuth();
  const hasPermissions = hasAssignedAdminPermissions(user);
  const canViewDashboard = canViewAnyDashboardContent(hasPermission, isSuperAdmin);
  const visibleWidgets = filterDashboardGates(
    ADMIN_DASHBOARD_WIDGETS,
    hasPermission,
    isSuperAdmin,
  );
  const visibleSections = filterDashboardGates(
    ADMIN_DASHBOARD_SECTIONS,
    hasPermission,
    isSuperAdmin,
  );
  const widgetIds = new Set(visibleWidgets.map((w) => w.id));
  const sectionIds = new Set(visibleSections.map((s) => s.id));

  const canOrders = hasPermission("orders", "view");
  const canCatalog = hasPermission("catalog", "view");
  const canReturns = hasPermission("order_returns", "view");

  const filteredNav = filterAdminNav(adminNav, { hasPermission, isSuperAdmin });
  const moduleLinks = authorizedModuleLinks(filteredNav);

  const statsQuery = useAdminResource(
    () =>
      canViewDashboard
        ? fetchDashboardStats()
        : Promise.resolve({} as DashboardStats),
    [canViewDashboard],
  );
  const ordersQuery = useAdminResource(
    () => (canOrders ? fetchAdminOrders() : Promise.resolve([])),
    [canOrders],
  );
  const productsQuery = useAdminResource(
    () => (canCatalog ? fetchAdminProducts() : Promise.resolve([])),
    [canCatalog],
  );
  const returnsQuery = useAdminResource(
    () => (canReturns ? fetchAdminReturns() : Promise.resolve([])),
    [canReturns],
  );

  if (!hasPermissions) {
    return <NoPermissionsState name={user?.name} />;
  }

  if (!canViewDashboard) {
    return <RestrictedDashboard modules={moduleLinks} />;
  }

  const stats = statsQuery.data;
  const recentOrders = (ordersQuery.data ?? []).slice(0, 5);
  const topProducts = (productsQuery.data ?? []).slice(0, 4);
  const lowStockFromList = (productsQuery.data ?? []).filter((p) => p.stock > 0 && p.stock <= 5);
  const shipmentOpen = (ordersQuery.data ?? []).filter((order) =>
    (order.shipments ?? []).some((shipment) => shipment.trackingNumber || shipment.shiprocketShipmentId),
  ).length;

  const cards = [
    widgetIds.has("todays_sales")
      ? {
          label: "Today's Sales",
          value: formatMoney(Number(stats?.today?.revenue) || 0),
        }
      : null,
    widgetIds.has("pending_orders")
      ? {
          label: "Pending orders",
          value: String(stats?.orders?.pending ?? 0),
        }
      : null,
    widgetIds.has("customers")
      ? {
          label: "Customers",
          value: String(stats?.overview?.totalShoppers ?? 0),
        }
      : null,
    widgetIds.has("low_stock")
      ? {
          label: "Low stock",
          value: String(stats?.products?.lowStock ?? lowStockFromList.length),
        }
      : null,
    widgetIds.has("shipments")
      ? {
          label: "Shipments with AWB",
          value: String(shipmentOpen),
        }
      : null,
    widgetIds.has("returns")
      ? {
          label: "Returns / replacements",
          value: String((returnsQuery.data ?? []).length),
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  const showStats = cards.length > 0;
  const showRecentOrders = sectionIds.has("recent_orders");
  const showTopProducts = sectionIds.has("top_products");
  const showLowStockList = sectionIds.has("low_stock_list");

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Operating snapshot from the AAURIKAA backend."
      />

      {showStats ? (
        statsQuery.loading ? (
          <Card>
            <LoadingState message="Loading dashboard…" />
          </Card>
        ) : statsQuery.error ? (
          <Card>
            <ErrorState message={statsQuery.error} onRetry={() => void statsQuery.reload()} />
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {cards.map((stat) => (
              <Card key={stat.label} className="px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {stat.label}
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                  {stat.value}
                </p>
              </Card>
            ))}
          </div>
        )
      ) : null}

      {showRecentOrders || showTopProducts || showLowStockList ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-5">
          {showRecentOrders ? (
            <Card className="lg:col-span-3">
              <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
                <h2 className="text-base font-semibold">Recent Orders</h2>
                <Link href="/admin/orders" className="text-sm font-medium text-accent">
                  View all
                </Link>
              </div>
              {ordersQuery.loading ? (
                <LoadingState message="Loading orders…" />
              ) : ordersQuery.error ? (
                <ErrorState message={ordersQuery.error} onRetry={() => void ordersQuery.reload()} />
              ) : recentOrders.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">No orders yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {recentOrders.map((order) => (
                    <li key={order.id}>
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-muted/60 active:bg-muted"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-foreground">{order.number}</p>
                            <StatusBadge status={order.status} />
                          </div>
                          <p className="mt-0.5 truncate text-sm text-muted-foreground">
                            {order.customerName} · {formatDate(order.date)}
                          </p>
                        </div>
                        <p className="shrink-0 text-sm font-semibold">{formatMoney(order.amount)}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}

          {showTopProducts || showLowStockList ? (
            <div
              className={`flex flex-col gap-4 ${showRecentOrders ? "lg:col-span-2" : "lg:col-span-5"}`}
            >
              {showTopProducts ? (
                <Card>
                  <div className="border-b border-border px-4 py-3.5">
                    <h2 className="text-base font-semibold">Top Products</h2>
                  </div>
                  {productsQuery.loading ? (
                    <LoadingState message="Loading products…" />
                  ) : productsQuery.error ? (
                    <ErrorState
                      message={productsQuery.error}
                      onRetry={() => void productsQuery.reload()}
                    />
                  ) : (
                    <ul className="divide-y divide-border">
                      {topProducts.map((product) => (
                        <li key={product.id}>
                          <Link
                            href={`/admin/products/${product.id}`}
                            className="flex items-center gap-3 px-4 py-3 transition hover:bg-muted/60"
                          >
                            <div className="relative h-11 w-11 overflow-hidden rounded-md bg-muted">
                              <Image
                                src={product.image}
                                alt={product.imageAlt}
                                fill
                                className="object-cover"
                                sizes="44px"
                                unoptimized={isRemoteSrc(product.image)}
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{product.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatMoney(product.price)}
                              </p>
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              ) : null}

              {showLowStockList ? (
                <Card>
                  <div className="border-b border-border px-4 py-3.5">
                    <h2 className="text-base font-semibold">Low Stock</h2>
                  </div>
                  <ul className="divide-y divide-border">
                    {lowStockFromList.length === 0 ? (
                      <li className="px-4 py-6 text-sm text-muted-foreground">
                        No low-stock items.
                      </li>
                    ) : (
                      lowStockFromList.map((product) => (
                        <li
                          key={product.id}
                          className="flex items-center justify-between gap-3 px-4 py-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{product.name}</p>
                            <p className="text-xs text-muted-foreground">{product.sku}</p>
                          </div>
                          <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                            {product.stock} left
                          </span>
                        </li>
                      ))
                    )}
                  </ul>
                </Card>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
