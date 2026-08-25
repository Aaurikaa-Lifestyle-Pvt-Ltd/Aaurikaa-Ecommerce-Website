"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  PageHeader,
  Select,
} from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { fetchAdminInventory, type AdminInventoryQuery } from "@/lib/api/inventory";
import { useAdminResource } from "@/lib/use-admin-resource";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "inactive", label: "Inactive" },
] as const;

const STOCK_OPTIONS = [
  { value: "all", label: "All stock levels" },
  { value: "in_stock", label: "In stock" },
  { value: "low", label: "Low (1–5)" },
  { value: "out", label: "Out of stock" },
] as const;

export default function InventoryPage() {
  const [page, setPage] = useState(1);
  const [draftSearch, setDraftSearch] = useState("");
  const [draftStatus, setDraftStatus] = useState("all");
  const [draftStock, setDraftStock] = useState<AdminInventoryQuery["stock"]>("all");
  const [applied, setApplied] = useState({
    search: "",
    status: "all",
    stock: "all" as AdminInventoryQuery["stock"],
  });

  const query = useAdminResource(
    () =>
      fetchAdminInventory({
        page,
        limit: 25,
        search: applied.search,
        status: applied.status,
        stock: applied.stock,
      }),
    [page, applied.search, applied.status, applied.stock],
  );

  const data = query.data;
  const items = data?.items ?? [];
  const pagination = data?.pagination;

  function applyFilters() {
    setApplied({
      search: draftSearch.trim(),
      status: draftStatus,
      stock: draftStock,
    });
    setPage(1);
  }

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Current product stock levels. Back-in-stock customer alerts remain under Stock alerts."
      />

      <Card className="mb-4 p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Search" htmlFor="inv-search">
            <Input
              id="inv-search"
              placeholder="Name or SKU"
              value={draftSearch}
              onChange={(e) => setDraftSearch(e.target.value)}
            />
          </Field>
          <Field label="Status" htmlFor="inv-status">
            <Select
              id="inv-status"
              value={draftStatus}
              onChange={(e) => setDraftStatus(e.target.value)}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Stock" htmlFor="inv-stock">
            <Select
              id="inv-stock"
              value={draftStock}
              onChange={(e) =>
                setDraftStock(e.target.value as AdminInventoryQuery["stock"])
              }
            >
              {STOCK_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end">
            <Button type="button" onClick={applyFilters}>
              Apply
            </Button>
          </div>
        </div>
      </Card>

      {query.loading ? (
        <Card>
          <LoadingState message="Loading inventory…" />
        </Card>
      ) : query.error ? (
        <Card>
          <ErrorState message={query.error} onRetry={() => void query.reload()} />
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState message="No inventory rows match your filters." />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {items.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5"
              >
                <div>
                  <Link
                    href={`/admin/products/${row.id}`}
                    className="font-medium text-accent hover:underline"
                  >
                    {row.name}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {row.sku ? `SKU ${row.sku}` : "No SKU"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm tabular-nums">
                    Stock <span className="font-semibold">{row.stock}</span>
                  </p>
                  <StatusBadge status={row.status} kind="product" />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {pagination && pagination.pages > 1 ? (
        <div className="mt-4 flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.pages} · {pagination.total} items
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={pagination.page >= pagination.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
