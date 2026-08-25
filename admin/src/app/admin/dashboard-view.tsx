"use client";

import Image from "next/image";
import Link from "next/link";
import { Card, ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { fetchDashboardStats } from "@/lib/api/dashboard";
import { fetchAdminOrders } from "@/lib/api/orders";
import { fetchAdminProducts } from "@/lib/api/products";
import { fetchAdminReturns } from "@/lib/api/returns";
import { formatDate, formatMoney } from "@/lib/format";
import { isRemoteSrc } from "@/lib/mappers/media";
import { useAdminResource } from "@/lib/use-admin-resource";

export function DashboardView() {
  const statsQuery = useAdminResource(() => fetchDashboardStats(), []);
  const ordersQuery = useAdminResource(() => fetchAdminOrders(), []);
  const productsQuery = useAdminResource(() => fetchAdminProducts(), []);
  const returnsQuery = useAdminResource(() => fetchAdminReturns(), []);

  const stats = statsQuery.data;
  const recentOrders = (ordersQuery.data ?? []).slice(0, 5);
  const topProducts = (productsQuery.data ?? []).slice(0, 4);
  const lowStockFromList = (productsQuery.data ?? []).filter((p) => p.stock > 0 && p.stock <= 5);
  const shipmentOpen = (ordersQuery.data ?? []).filter((order) =>
    (order.shipments ?? []).some((shipment) => shipment.trackingNumber || shipment.shiprocketShipmentId),
  ).length;

  const cards = [
    {
      label: "Today's Sales",
      value: formatMoney(Number(stats?.today?.revenue) || 0),
    },
    {
      label: "Pending orders",
      value: String(stats?.orders?.pending ?? 0),
    },
    {
      label: "Customers",
      value: String(stats?.overview?.totalShoppers ?? 0),
    },
    {
      label: "Low stock",
      value: String(stats?.products?.lowStock ?? lowStockFromList.length),
    },
    {
      label: "Shipments with AWB",
      value: String(shipmentOpen),
    },
    {
      label: "Returns / replacements",
      value: String((returnsQuery.data ?? []).length),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Operating snapshot from the AAURIKAA backend."
      />

      {statsQuery.loading ? (
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
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-5">
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

        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <div className="border-b border-border px-4 py-3.5">
              <h2 className="text-base font-semibold">Top Products</h2>
            </div>
            {productsQuery.loading ? (
              <LoadingState message="Loading products…" />
            ) : productsQuery.error ? (
              <ErrorState message={productsQuery.error} onRetry={() => void productsQuery.reload()} />
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
                        <p className="text-xs text-muted-foreground">{formatMoney(product.price)}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <div className="border-b border-border px-4 py-3.5">
              <h2 className="text-base font-semibold">Low Stock</h2>
            </div>
            <ul className="divide-y divide-border">
              {lowStockFromList.length === 0 ? (
                <li className="px-4 py-6 text-sm text-muted-foreground">No low-stock items.</li>
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
        </div>
      </div>
    </div>
  );
}
