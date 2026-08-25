"use client";

import { Card, EmptyState, ErrorState, LoadingState, PageHeader, Select } from "@/components/ui";
import { fetchStockNotifications } from "@/lib/api/stock-notifications";
import { useAdminResource } from "@/lib/use-admin-resource";
import { useState } from "react";

export default function StockNotificationsPage() {
  const [status, setStatus] = useState("pending");
  const query = useAdminResource(() => fetchStockNotifications(status), [status]);
  const list = query.data ?? [];

  return (
    <div>
      <PageHeader
        title="Stock alerts"
        description="Back-in-stock notification requests. Emails fire when product stock is restocked."
      />

      <Card className="mb-4 p-4">
        <Select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="pending">pending</option>
          <option value="notified">notified</option>
        </Select>
      </Card>

      {query.loading ? (
        <Card>
          <LoadingState message="Loading requests…" />
        </Card>
      ) : query.error ? (
        <Card>
          <ErrorState message={query.error} onRetry={() => void query.reload()} />
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState message="No notification requests." />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {list.map((item) => (
              <li key={item._id} className="px-4 py-3.5 text-sm">
                <p className="font-medium">{item.product?.name || "Product"}</p>
                <p className="text-muted-foreground">
                  {item.shopper?.email || "Customer"} · {item.status}
                  {item.variantCombination ? ` · ${item.variantCombination}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
