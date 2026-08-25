"use client";

import Link from "next/link";
import { Card, EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { fetchAdminReturns } from "@/lib/api/returns";
import { useAdminResource } from "@/lib/use-admin-resource";

export default function ReturnsPage() {
  const returnsQuery = useAdminResource(() => fetchAdminReturns(), []);
  const list = returnsQuery.data ?? [];

  return (
    <div>
      <PageHeader
        title="Returns"
        description="After-sales cases from the existing return engine. Refund processing stays on hold until policy is approved."
      />

      {returnsQuery.loading ? (
        <Card>
          <LoadingState message="Loading returns…" />
        </Card>
      ) : returnsQuery.error ? (
        <Card>
          <ErrorState message={returnsQuery.error} onRetry={() => void returnsQuery.reload()} />
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState message="No return requests yet." />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {list.map((item) => (
              <li key={item._id}>
                <Link
                  href={`/admin/returns/${item._id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3.5 sm:px-5"
                >
                  <span className="font-medium">{item.order?.invoiceNumber || item._id}</span>
                  <span className="text-sm text-muted-foreground">
                    {item.status}
                    {item.resolution ? ` · ${item.resolution}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
