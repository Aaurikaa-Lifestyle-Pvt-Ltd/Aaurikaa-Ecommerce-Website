"use client";

import { useState } from "react";
import { ErrorState, PageHeader } from "@/components/ui";
import {
  fetchCategoryImportTemplateSpec,
  fetchProductImportTemplateSpec,
  type ImportTemplateSpec,
} from "@/lib/api/catalogue-import";
import { cn } from "@/lib/cn";
import { useAdminResource } from "@/lib/use-admin-resource";
import { CategoryImportExportPanel } from "./category-panel";
import { ImportHistoryPanel } from "./history-panel";
import { ProductImportExportPanel } from "./product-panel";

const TABS = [
  { id: "products", label: "Products" },
  { id: "categories", label: "Categories" },
  { id: "history", label: "History" },
] as const;

export default function CatalogueImportPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("products");
  const productSpec = useAdminResource(() => fetchProductImportTemplateSpec(), []);
  const categorySpec = useAdminResource(() => fetchCategoryImportTemplateSpec(), []);

  return (
    <div>
      <PageHeader
        title="Import / Export"
        description="Download a template, fill in catalogue data, validate, then import. Exports are spreadsheets you can edit and upload again."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "inline-flex h-10 items-center rounded-[var(--radius-sm)] px-3 text-sm font-medium touch-manipulation",
              tab === item.id
                ? "bg-foreground text-background"
                : "border border-border bg-surface hover:bg-muted",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "products" ? (
        <>
          {productSpec.error ? (
            <ErrorState message={productSpec.error} onRetry={() => void productSpec.reload()} />
          ) : null}
          <ProductImportExportPanel spec={productSpec.data as ImportTemplateSpec | null} />
        </>
      ) : null}

      {tab === "categories" ? (
        <>
          {categorySpec.error ? (
            <ErrorState message={categorySpec.error} onRetry={() => void categorySpec.reload()} />
          ) : null}
          <CategoryImportExportPanel spec={categorySpec.data as ImportTemplateSpec | null} />
        </>
      ) : null}

      {tab === "history" ? <ImportHistoryPanel /> : null}
    </div>
  );
}
