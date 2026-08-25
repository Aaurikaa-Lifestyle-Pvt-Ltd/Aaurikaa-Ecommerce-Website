"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Card, EmptyState, ErrorState, Input, LoadingState, PageHeader } from "@/components/ui";
import { fetchAdminCustomers } from "@/lib/api/customers";
import { formatMoney } from "@/lib/format";
import { useAdminResource } from "@/lib/use-admin-resource";

export default function CustomersPage() {
  const [query, setQuery] = useState("");
  const customersQuery = useAdminResource(() => fetchAdminCustomers(), []);

  const filtered = useMemo(() => {
    const list = customersQuery.data ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q),
    );
  }, [customersQuery.data, query]);

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Shopper accounts from the backend. Password hashes are never shown."
      />

      <Card className="mb-4 p-3 sm:p-4">
        <Input
          placeholder="Search name or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search customers"
        />
      </Card>

      {customersQuery.loading ? (
        <Card>
          <LoadingState message="Loading customers…" />
        </Card>
      ) : customersQuery.error ? (
        <Card>
          <ErrorState message={customersQuery.error} onRetry={() => void customersQuery.reload()} />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState message="No customers found." />
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((customer) => (
            <Card key={customer.id} className="p-3 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{customer.name}</p>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">{customer.email}</p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold">{formatMoney(customer.totalSpent)}</p>
                  <p className="text-muted-foreground">{customer.ordersCount} orders</p>
                </div>
              </div>
              <div className="mt-3">
                <Link
                  href={`/admin/customers/${customer.id}`}
                  className="inline-flex h-10 items-center rounded-[var(--radius-sm)] border border-border px-3 text-sm font-medium hover:bg-muted touch-manipulation"
                >
                  View
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
