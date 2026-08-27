"use client";

import Image from "next/image";
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
import { CategoryTaxonomyFields } from "@/components/category-taxonomy-fields";
import { formatMoney } from "@/lib/format";
import { useAdminResource } from "@/lib/use-admin-resource";
import {
  deleteAdminProduct,
  fetchAdminProductsPage,
  restoreAdminProduct,
  trashAdminProduct,
  type AdminProductListResult,
} from "@/lib/api/products";
import { fetchAdminCategories } from "@/lib/api/categories";
import { isRemoteSrc } from "@/lib/mappers/media";
import { cn } from "@/lib/cn";
import { toast, toastMessageFromUnknown } from "@/lib/toast";
import type { AdminProduct } from "@/types/admin";

const TABS = [
  { value: "all", label: "All" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Drafts" },
  { value: "trash", label: "Trash" },
] as const;

const SORT_OPTIONS = [
  { value: "createdAt:desc", label: "Newest" },
  { value: "createdAt:asc", label: "Oldest" },
  { value: "name:asc", label: "Name A–Z" },
  { value: "name:desc", label: "Name Z–A" },
  { value: "regularPrice:asc", label: "Price ↑" },
  { value: "regularPrice:desc", label: "Price ↓" },
  { value: "stock:desc", label: "Stock ↓" },
  { value: "sku:asc", label: "SKU" },
] as const;

type FilterDraft = {
  search: string;
  sku: string;
  categoryId: string;
  subcategoryId: string;
  childCategoryId: string;
  sort: string;
};

const EMPTY_FILTERS: FilterDraft = {
  search: "",
  sku: "",
  categoryId: "",
  subcategoryId: "",
  childCategoryId: "",
  sort: "createdAt:desc",
};

export default function ProductsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("all");
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<FilterDraft>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<FilterDraft>(EMPTY_FILTERS);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [sortBy, sortOrder] = applied.sort.split(":") as [string, "asc" | "desc"];

  const productsQuery = useAdminResource(
    () =>
      fetchAdminProductsPage({
        page,
        limit: 20,
        tab,
        search: applied.search.trim().length >= 2 ? applied.search.trim() : undefined,
        sku: applied.sku.trim() || undefined,
        category: applied.categoryId || undefined,
        subcategory: applied.subcategoryId || undefined,
        childCategory: applied.childCategoryId || undefined,
        sortBy,
        sortOrder,
      }),
    [
      page,
      tab,
      applied.search,
      applied.sku,
      applied.categoryId,
      applied.subcategoryId,
      applied.childCategoryId,
      sortBy,
      sortOrder,
    ],
  );
  const categoriesQuery = useAdminResource(() => fetchAdminCategories(), []);

  const list: AdminProductListResult | null = productsQuery.data;
  const products = list?.products ?? [];
  const pagination = list?.pagination;
  const counts = list?.tabCounts;

  function applyFilters() {
    setApplied({ ...draft });
    setPage(1);
  }

  function clearFilters() {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
  }

  function switchTab(next: (typeof TABS)[number]["value"]) {
    setTab(next);
    setPage(1);
  }

  async function runRowAction(
    id: string,
    action: "trash" | "restore" | "delete",
  ) {
    setBusyId(id);
    try {
      if (action === "trash") await trashAdminProduct(id);
      else if (action === "restore") await restoreAdminProduct(id);
      else await deleteAdminProduct(id);
      toast.success(
        action === "trash"
          ? "Product moved to trash"
          : action === "restore"
            ? "Product restored"
            : "Product deleted permanently",
      );
      await productsQuery.reload();
    } catch (err) {
      toast.error(toastMessageFromUnknown(err, "Unable to update product."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Products"
        description="Manage the jewellery catalogue. Search, filter, and edit products. Stock is edited on each product and its variants."
        action={
          <Link
            href="/admin/products/new"
            className="inline-flex h-11 items-center rounded-[var(--radius-sm)] bg-accent px-4 text-sm font-medium text-accent-foreground hover:opacity-90"
          >
            Add Product
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2 border-b border-border pb-3">
        {TABS.map((item) => {
          const count =
            item.value === "all"
              ? counts?.all
              : item.value === "published"
                ? counts?.published
                : item.value === "draft"
                  ? counts?.draft
                  : counts?.trash;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => switchTab(item.value)}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-[var(--radius-sm)] px-3 text-sm font-medium touch-manipulation",
                tab === item.value
                  ? "bg-foreground text-background"
                  : "border border-border bg-surface hover:bg-muted",
              )}
            >
              {item.label}
              {typeof count === "number" ? (
                <span className="tabular-nums opacity-80">{count}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <Card className="mb-4 p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Search" htmlFor="product-search">
            <Input
              id="product-search"
              placeholder="Name (min 2 characters)"
              value={draft.search}
              onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
            />
          </Field>
          <Field label="SKU" htmlFor="product-sku">
            <Input
              id="product-sku"
              placeholder="Exact or prefix"
              value={draft.sku}
              onChange={(e) => setDraft((d) => ({ ...d, sku: e.target.value }))}
            />
          </Field>
          <Field label="Sort" htmlFor="product-sort" className="sm:col-span-2 lg:col-span-1">
            <Select
              id="product-sort"
              value={draft.sort}
              onChange={(e) => setDraft((d) => ({ ...d, sort: e.target.value }))}
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="mt-3">
          <CategoryTaxonomyFields
            categories={categoriesQuery.data ?? []}
            categoryId={draft.categoryId}
            subcategoryId={draft.subcategoryId}
            childCategoryId={draft.childCategoryId}
            onCategoryChange={(id) =>
              setDraft((d) => ({
                ...d,
                categoryId: id,
                subcategoryId: "",
                childCategoryId: "",
              }))
            }
            onSubcategoryChange={(id) =>
              setDraft((d) => ({ ...d, subcategoryId: id, childCategoryId: "" }))
            }
            onChildCategoryChange={(id) =>
              setDraft((d) => ({ ...d, childCategoryId: id }))
            }
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" onClick={applyFilters}>
            Apply
          </Button>
          <Button type="button" variant="secondary" onClick={clearFilters}>
            Clear
          </Button>
        </div>
      </Card>

      {productsQuery.loading ? (
        <Card>
          <LoadingState message="Loading products…" />
        </Card>
      ) : productsQuery.error ? (
        <Card>
          <ErrorState message={productsQuery.error} onRetry={() => void productsQuery.reload()} />
        </Card>
      ) : products.length === 0 ? (
        <Card>
          <EmptyState message="No products match your filters." />
        </Card>
      ) : (
        <div className="space-y-3">
          {products.map((product) => (
            <ProductRow
              key={product.id}
              product={product}
              isTrashTab={tab === "trash"}
              busy={busyId === product.id}
              onTrash={() => void runRowAction(product.id, "trash")}
              onRestore={() => void runRowAction(product.id, "restore")}
              onDelete={() => {
                if (
                  window.confirm(
                    `Permanently delete “${product.name}”? This cannot be undone.`,
                  )
                ) {
                  void runRowAction(product.id, "delete");
                }
              }}
            />
          ))}
        </div>
      )}

      {pagination && pagination.pages > 1 ? (
        <div className="mt-4 flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.pages} · {pagination.total} products
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

function ProductRow({
  product,
  isTrashTab,
  busy,
  onTrash,
  onRestore,
  onDelete,
}: {
  product: AdminProduct;
  isTrashTab: boolean;
  busy: boolean;
  onTrash: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="p-3 sm:p-4">
      <div className="flex gap-3">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted sm:h-20 sm:w-20">
          <Image
            src={product.image}
            alt={product.imageAlt}
            fill
            className="object-cover"
            sizes="80px"
            unoptimized={isRemoteSrc(product.image)}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-semibold text-foreground">{product.name}</p>
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">{product.sku}</p>
            </div>
            <StatusBadge status={product.status} kind="product" />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="font-semibold">{formatMoney(product.price)}</span>
            <span className="text-muted-foreground">
              Stock: <span className="font-medium text-foreground">{product.stock}</span>
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {isTrashTab ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={onRestore}
                >
                  Restore
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={onDelete}
                >
                  Permanent Delete
                </Button>
              </>
            ) : (
              <>
                <Link
                  href={`/admin/products/${product.id}`}
                  className="inline-flex h-10 items-center rounded-[var(--radius-sm)] border border-border bg-surface px-3 text-sm font-medium hover:bg-muted touch-manipulation"
                >
                  Edit
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={onTrash}
                >
                  Move to Trash
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
