"use client";

import { useState } from "react";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { ApiError } from "@/lib/api/errors";
import {
  approveImportBatch,
  fetchImportBatch,
  fetchImportBatches,
  rejectImportBatch,
  type ImportBatchDetail,
  type ImportBatchListItem,
} from "@/lib/api/catalogue-import";
import { formatDateTime } from "@/lib/format";
import { useAdminResource } from "@/lib/use-admin-resource";

function statusLabel(status?: string) {
  if (!status) return "Unknown";
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function ImportHistoryPanel() {
  const query = useAdminResource(() => fetchImportBatches(), []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ImportBatchDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  async function openBatch(id: string) {
    setSelectedId(id);
    setDetailLoading(true);
    setDetailError(null);
    try {
      setDetail(await fetchImportBatch(id));
    } catch (err) {
      setDetail(null);
      setDetailError(err instanceof ApiError ? err.message : "Unable to load this batch.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function runBatchAction(action: "approve" | "reject") {
    if (!selectedId) return;
    setBusy(true);
    setDetailError(null);
    try {
      if (action === "approve") await approveImportBatch(selectedId);
      else await rejectImportBatch(selectedId);
      await openBatch(selectedId);
      await query.reload();
    } catch (err) {
      setDetailError(err instanceof ApiError ? err.message : "Unable to update this batch.");
    } finally {
      setBusy(false);
    }
  }

  const batches = query.data ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Product import history"
          description="Each product spreadsheet import creates a batch. Approve to publish, or reject to leave products as drafts. Category imports apply immediately and are not listed here."
        />
        {query.loading ? <LoadingState message="Loading import history…" /> : null}
        {query.error ? <ErrorState message={query.error} onRetry={() => void query.reload()} /> : null}
        {!query.loading && !query.error && batches.length === 0 ? (
          <EmptyState message="No product import batches yet." />
        ) : null}
        {!query.loading && batches.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-semibold">Date</th>
                  <th className="px-4 py-2 font-semibold">Type</th>
                  <th className="px-4 py-2 font-semibold">File</th>
                  <th className="px-4 py-2 font-semibold">Records</th>
                  <th className="px-4 py-2 font-semibold">Successful</th>
                  <th className="px-4 py-2 font-semibold">Failed</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch: ImportBatchListItem) => {
                  const id = String(batch._id);
                  const approved = batch.breakdown?.approved ?? 0;
                  const rejected = batch.breakdown?.rejected ?? 0;
                  return (
                    <tr
                      key={id}
                      className={
                        selectedId === id
                          ? "bg-muted/60"
                          : "border-b border-border/70 hover:bg-muted/40"
                      }
                    >
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          className="text-left font-medium text-accent underline-offset-2 hover:underline"
                          onClick={() => void openBatch(id)}
                        >
                          {batch.createdAt ? formatDateTime(batch.createdAt) : "—"}
                        </button>
                      </td>
                      <td className="px-4 py-2">Products</td>
                      <td className="px-4 py-2">{batch.fileName || "—"}</td>
                      <td className="px-4 py-2 tabular-nums">{batch.breakdown?.total ?? batch.productCount ?? 0}</td>
                      <td className="px-4 py-2 tabular-nums">{approved}</td>
                      <td className="px-4 py-2 tabular-nums">{rejected}</td>
                      <td className="px-4 py-2">
                        <StatusBadge kind="entity" status={statusLabel(batch.status)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      {selectedId ? (
        <Card>
          <CardHeader
            title="Batch detail"
            action={
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={busy || detailLoading}
                  onClick={() => void runBatchAction("approve")}
                >
                  Approve batch
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy || detailLoading}
                  onClick={() => void runBatchAction("reject")}
                >
                  Reject batch
                </Button>
              </div>
            }
          />
          {detailLoading ? <LoadingState message="Loading batch…" /> : null}
          {detailError ? <p className="px-4 py-3 text-sm text-danger">{detailError}</p> : null}
          {detail && !detailLoading ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Product</th>
                    <th className="px-4 py-2 font-semibold">SKU</th>
                    <th className="px-4 py-2 font-semibold">Category</th>
                    <th className="px-4 py-2 font-semibold">Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.products.map((product) => (
                    <tr key={product._id} className="border-b border-border/70">
                      <td className="px-4 py-2">{product.name || "Untitled"}</td>
                      <td className="px-4 py-2 font-mono text-xs">{product.sku || "—"}</td>
                      <td className="px-4 py-2">{product.category?.name || "—"}</td>
                      <td className="px-4 py-2">{product.importDecision || product.status || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {detail.products.length === 0 ? (
                <EmptyState message="No products attached to this batch." />
              ) : null}
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
