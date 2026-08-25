"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { Card, CardHeader, ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { fetchAdminCustomer } from "@/lib/api/customers";
import { fetchAdminOrders } from "@/lib/api/orders";
import { formatDate, formatMoney } from "@/lib/format";
import { useAdminResource } from "@/lib/use-admin-resource";

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const customerQuery = useAdminResource(() => fetchAdminCustomer(params.id), [params.id]);
  const ordersQuery = useAdminResource(() => fetchAdminOrders(), []);
  const customer = customerQuery.data;
  const history = useMemo(
    () => (ordersQuery.data ?? []).filter((order) => order.customerId === params.id),
    [ordersQuery.data, params.id],
  );

  if (customerQuery.loading) {
    return (
      <div>
        <PageHeader title="Customer" />
        <LoadingState message="Loading customer…" />
      </div>
    );
  }

  if (customerQuery.error) {
    return (
      <div>
        <PageHeader title="Customer" />
        <ErrorState message={customerQuery.error} onRetry={() => void customerQuery.reload()} />
      </div>
    );
  }

  if (!customer) {
    return (
      <div>
        <PageHeader title="Customer not found" />
        <Link href="/admin/customers" className="text-sm font-medium text-accent">
          Back to customers
        </Link>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={customer.name}
        description={customer.email}
        action={
          <Link
            href="/admin/customers"
            className="inline-flex h-11 items-center rounded-[var(--radius-sm)] border border-border bg-surface px-4 text-sm font-medium"
          >
            Back
          </Link>
        }
      />

      <div className="space-y-4">
        <Card>
          <CardHeader title="Customer information" />
          <dl className="grid gap-3 p-4 text-sm sm:grid-cols-2 sm:p-5">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Phone
              </dt>
              <dd className="mt-1 font-medium">{customer.phone || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Joined
              </dt>
              <dd className="mt-1 font-medium">{formatDate(customer.joinedAt)}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <CardHeader title="Order history" />
          <ul className="divide-y divide-border">
            {ordersQuery.loading ? (
              <li className="px-4 py-6 text-sm text-muted-foreground">Loading orders…</li>
            ) : history.length === 0 ? (
              <li className="px-4 py-6 text-sm text-muted-foreground">No orders yet.</li>
            ) : (
              history.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-muted/60 sm:px-5"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{order.number}</p>
                        <StatusBadge status={order.status} />
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(order.date)}</p>
                    </div>
                    <p className="text-sm font-semibold">{formatMoney(order.amount)}</p>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </Card>
      </div>
    </div>
  );
}
