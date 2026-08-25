"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Card, EmptyState, ErrorState, Input, LoadingState, PageHeader, Select } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { fetchAdminOrders } from "@/lib/api/orders";
import { formatDate, formatMoney } from "@/lib/format";
import { useAdminResource } from "@/lib/use-admin-resource";
import type { OrderStatus } from "@/types/admin";

export default function OrdersPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const ordersQuery = useAdminResource(() => fetchAdminOrders(), []);

  const filtered = useMemo(() => {
    const list = ordersQuery.data ?? [];
    const q = query.trim().toLowerCase();
    return list.filter((o) => {
      const matchesQuery =
        !q ||
        o.number.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q);
      const matchesStatus = status === "all" || o.status === status;
      return matchesQuery && matchesStatus;
    });
  }, [ordersQuery.data, query, status]);

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Fulfilment queue from the AAURIKAA order engine. Payment confirmation is not a status action."
      />

      <Card className="mb-4 p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
          <Input
            placeholder="Search order or customer"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search orders"
          />
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            {(
              [
                "Pending",
                "Shipped",
                "Completed",
                "Cancel",
                "Incompleted",
              ] as OrderStatus[]
            ).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {ordersQuery.loading ? (
        <Card>
          <LoadingState message="Loading orders…" />
        </Card>
      ) : ordersQuery.error ? (
        <Card>
          <ErrorState message={ordersQuery.error} onRetry={() => void ordersQuery.reload()} />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState message="No orders match your filters." />
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((order) => (
            <Card key={order.id} className="p-3 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{order.number}</p>
                    <StatusBadge status={order.status} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{order.customerName}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatMoney(order.amount)}</p>
                  {order.pricing && order.pricing.discountAmount > 0 ? (
                    <p className="text-xs text-danger">
                      {order.pricing.couponCode
                        ? `Discount (${order.pricing.couponCode}) −${formatMoney(order.pricing.discountAmount)}`
                        : `Discount −${formatMoney(order.pricing.discountAmount)}`}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">{formatDate(order.date)}</p>
                </div>
              </div>
              <div className="mt-3">
                <Link
                  href={`/admin/orders/${order.id}`}
                  className="inline-flex h-10 items-center rounded-[var(--radius-sm)] border border-border px-3 text-sm font-medium hover:bg-muted touch-manipulation"
                >
                  View order
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
