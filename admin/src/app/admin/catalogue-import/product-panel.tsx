"use client";

import { useMemo, useState } from "react";
import { CategoryTaxonomyFields } from "@/components/category-taxonomy-fields";
import {
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { ApiError } from "@/lib/api/errors";
import {
  downloadProductImportTemplate,
  exportAdminProductsCsv,
  exportAdminProductsJson,
  importAdminProductsJson,
  readJsonFile,
  summaryFromProductPayload,
  uploadAdminProductBulk,
  validateAdminProductBulkUpload,
  type ImportMode,
  type ImportSummary,
  type ImportTemplateSpec,
} from "@/lib/api/catalogue-import";
import { fetchAdminCategories } from "@/lib/api/categories";
import { issuesFromUnknown, type ImportIssue } from "@/lib/catalogue-import-errors";
import { toast } from "@/lib/toast";
import { useAdminResource } from "@/lib/use-admin-resource";
import { IssueTable, StepList, SummaryGrid, TemplateNotes } from "./import-review";

const STEPS = ["Template", "Upload", "Review", "Confirm", "Result"];

export function ProductImportExportPanel({ spec }: { spec: ImportTemplateSpec | null }) {
  const categoriesQuery = useAdminResource(() => fetchAdminCategories(), []);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<ImportMode>("create");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [issues, setIssues] = useState<ImportIssue[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const [exportScope, setExportScope] = useState<"all" | "filtered" | "selected">("all");
  const [exportKind, setExportKind] = useState<"catalogue-csv" | "catalogue-xlsx" | "full-csv">("catalogue-csv");
  const [selectedSkus, setSelectedSkus] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSearch, setFilterSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [childCategoryId, setChildCategoryId] = useState("");
  const [jsonFile, setJsonFile] = useState<File | null>(null);

  const blocking = Boolean(
    summary && (summary.invalid > 0 || issues.length > 0 || summary.valid === 0),
  );
  const currentStep = result ? 4 : confirmed ? 3 : summary ? 2 : file ? 1 : 0;
  const accept = spec?.xlsxImportEnabled
    ? ".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    : ".csv,text/csv";

  const required = spec?.required ?? ["productName", "listPrice", "stock", "category"];

  const warningLines = useMemo(
    () => warnings.map((item) => (typeof item === "string" ? item : JSON.stringify(item))),
    [warnings],
  );

  function resetReview() {
    setSummary(null);
    setIssues([]);
    setWarnings([]);
    setResult(null);
    setBatchId(null);
    setConfirmed(false);
    setError(null);
  }

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Request failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Import products"
          description="Download the template, fill it in, then validate before anything is saved."
        />
        <div className="space-y-4 p-4 sm:p-5">
          <StepList steps={STEPS} current={currentStep} />
          {spec ? (
            <TemplateNotes
              notes={spec.notes ?? []}
              required={required}
              xlsxImportEnabled={Boolean(spec.xlsxImportEnabled)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Loading template guidance…</p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={busy === "template-csv"}
              onClick={() => void run("template-csv", () => downloadProductImportTemplate("csv"))}
            >
              {busy === "template-csv" ? "Downloading…" : "Download CSV template"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy === "template-xlsx"}
              onClick={() => void run("template-xlsx", () => downloadProductImportTemplate("xlsx"))}
            >
              {busy === "template-xlsx" ? "Downloading…" : "Download Excel template"}
            </Button>
          </div>

          <Field label="Product spreadsheet" htmlFor="product-import-file">
            <Input
              id="product-import-file"
              type="file"
              accept={accept}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                resetReview();
              }}
            />
          </Field>

          <Field label="If a SKU already exists" htmlFor="product-import-mode">
            <Select
              id="product-import-mode"
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as ImportMode);
                resetReview();
              }}
            >
              <option value="create">Add new products only (existing SKUs are errors)</option>
              <option value="upsert">Add new and update matching SKUs</option>
            </Select>
          </Field>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={!file || Boolean(busy)}
              onClick={() =>
                void run("validate", async () => {
                  if (!file) throw new Error("Choose a file first.");
                  toast.info("Validating product spreadsheet…");
                  const payload = await validateAdminProductBulkUpload(file, mode);
                  const nextSummary = summaryFromProductPayload(payload);
                  const nextIssues = issuesFromUnknown(payload.errors);
                  setSummary(nextSummary);
                  setIssues(nextIssues);
                  setWarnings(
                    (payload.warnings ?? payload.validationReport?.warnings ?? []).map((item) =>
                      typeof item === "string" ? item : JSON.stringify(item),
                    ),
                  );
                  setConfirmed(false);
                  setResult(null);
                  const hasBlockers =
                    nextSummary.invalid > 0 || nextIssues.length > 0 || nextSummary.valid === 0;
                  if (hasBlockers) {
                    toast.warning(
                      `Validation found ${nextSummary.invalid || nextIssues.length} issue${
                        (nextSummary.invalid || nextIssues.length) === 1 ? "" : "s"
                      }. Fix before importing.`,
                    );
                  } else {
                    toast.success(
                      `Validation passed for ${nextSummary.valid} product${nextSummary.valid === 1 ? "" : "s"}.`,
                    );
                  }
                })
              }
            >
              {busy === "validate" ? "Validating…" : "Validate"}
            </Button>
          </div>
        </div>
      </Card>

      {summary ? (
        <Card>
          <CardHeader
            title="Import summary"
            description={
              blocking
                ? "Errors must be fixed in the spreadsheet. Invalid rows are not imported."
                : "Nothing has been saved yet. Confirm to import."
            }
          />
          <div className="space-y-4 p-4 sm:p-5">
            <SummaryGrid summary={summary} />
            {warningLines.length ? (
              <div className="rounded-[var(--radius-sm)] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <p className="font-medium">Warnings</p>
                <ul className="mt-1 list-disc pl-5">
                  {warningLines.slice(0, 8).map((line) => (
                    <li key={line}>{line.replace(/^Row\s+\d+:\s*/i, "")}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <IssueTable issues={issues} reportName="product_import_errors.csv" />
            {!blocking ? (
              <div className="rounded-[var(--radius-sm)] border border-border bg-muted/30 p-4">
                <p className="text-sm font-medium">
                  You&apos;re about to import {summary.valid} product{summary.valid === 1 ? "" : "s"}.
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  New: {summary.newRecords} · Updates: {summary.updates} · Warnings: {summary.warnings} ·
                  Errors: {summary.invalid}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Imported products stay in the import batch as drafts until you approve them in History.
                </p>
                <Button
                  className="mt-3"
                  disabled={!file || Boolean(busy)}
                  onClick={() =>
                    void run("import", async () => {
                      if (!file) throw new Error("Choose a file first.");
                      toast.info("Product import started");
                      const payload = await uploadAdminProductBulk(file, mode);
                      setConfirmed(true);
                      setBatchId(payload.batchId ? String(payload.batchId) : null);
                      const upsert = payload.upsert;
                      const message = upsert
                        ? `Imported. Inserted ${upsert.inserted ?? 0}, updated ${upsert.updated ?? 0}, skipped ${upsert.skipped ?? 0}.`
                        : `Imported ${payload.count ?? summary.valid} products${payload.batchId ? ` (batch ${payload.batchId})` : ""}.`;
                      setResult(message);
                      const skipped = upsert?.skipped ?? 0;
                      if (skipped > 0) {
                        toast.warning(message);
                      } else {
                        toast.success(message);
                      }
                    })
                  }
                >
                  {busy === "import" ? "Importing…" : "Confirm import"}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-danger" role="alert">
                Fix the errors in your file and validate again. Invalid records are not skipped.
              </p>
            )}
          </div>
        </Card>
      ) : null}

      {result ? (
        <Card>
          <CardHeader title="Import result" />
          <div className="space-y-2 p-4 sm:p-5">
            <p className="text-sm">{result}</p>
            {batchId ? (
              <p className="text-sm text-muted-foreground">
                Open the History tab to inspect batch {batchId} and approve products.
              </p>
            ) : null}
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Export products"
          description="Catalogue export is for everyday editing and re-import. Full Technical Backup keeps every internal column for migration and variant round-trips."
        />
        <div className="space-y-4 p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Scope" htmlFor="product-export-scope">
              <Select
                id="product-export-scope"
                value={exportScope}
                onChange={(e) => setExportScope(e.target.value as typeof exportScope)}
              >
                <option value="all">All products</option>
                <option value="filtered">Filtered products</option>
                <option value="selected">Selected SKUs</option>
              </Select>
            </Field>
            <Field label="Export file" htmlFor="product-export-kind">
              <Select
                id="product-export-kind"
                value={exportKind}
                onChange={(e) => setExportKind(e.target.value as typeof exportKind)}
              >
                <option value="catalogue-csv">Catalogue CSV</option>
                <option value="catalogue-xlsx">Catalogue Excel</option>
                <option value="full-csv">Full Technical Backup</option>
              </Select>
            </Field>
          </div>

          {exportScope === "filtered" ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name contains" htmlFor="export-search">
                  <Input
                    id="export-search"
                    value={filterSearch}
                    onChange={(e) => setFilterSearch(e.target.value)}
                    placeholder="Min 2 characters"
                  />
                </Field>
                <Field label="Status" htmlFor="export-status">
                  <Select id="export-status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                    <option value="all">All (except trash)</option>
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                    <option value="inactive">Inactive</option>
                  </Select>
                </Field>
              </div>
              <CategoryTaxonomyFields
                categories={categoriesQuery.data ?? []}
                categoryId={categoryId}
                subcategoryId={subcategoryId}
                childCategoryId={childCategoryId}
                onCategoryChange={(id) => {
                  setCategoryId(id);
                  setSubcategoryId("");
                  setChildCategoryId("");
                }}
                onSubcategoryChange={(id) => {
                  setSubcategoryId(id);
                  setChildCategoryId("");
                }}
                onChildCategoryChange={setChildCategoryId}
              />
            </div>
          ) : null}

          {exportScope === "selected" ? (
            <Field label="SKUs to export" htmlFor="export-skus">
              <Textarea
                id="export-skus"
                value={selectedSkus}
                onChange={(e) => setSelectedSkus(e.target.value)}
                placeholder="One SKU per line, or comma-separated"
              />
            </Field>
          ) : null}

          <Button
            disabled={Boolean(busy)}
            onClick={() =>
              void run("export", async () => {
                const skus =
                  exportScope === "selected"
                    ? selectedSkus
                        .split(/[\s,]+/)
                        .map((item) => item.trim())
                        .filter(Boolean)
                        .join(",")
                    : undefined;
                if (exportScope === "selected" && !skus) {
                  throw new Error("Enter at least one SKU.");
                }
                await exportAdminProductsCsv({
                  format: exportKind === "catalogue-xlsx" ? "xlsx" : "csv",
                  profile: exportKind === "full-csv" ? "full" : "operator",
                  skus,
                  search: exportScope === "filtered" ? filterSearch : undefined,
                  status: exportScope === "filtered" ? filterStatus : undefined,
                  tab: exportScope === "filtered" && filterStatus === "all" ? "all" : undefined,
                  category: exportScope === "filtered" ? categoryId : undefined,
                  subcategory: exportScope === "filtered" ? subcategoryId : undefined,
                  childCategory: exportScope === "filtered" ? childCategoryId : undefined,
                });
              })
            }
          >
            {busy === "export" ? "Exporting…" : "Download export"}
          </Button>
        </div>
      </Card>

      <details className="rounded-[var(--radius-md)] border border-border bg-surface">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
          Technical JSON backup
        </summary>
        <div className="space-y-3 border-t border-border p-4 sm:p-5">
          <p className="text-sm text-muted-foreground">
            Full product snapshot for restoration. This is not the everyday catalogue spreadsheet.
          </p>
          <Button
            type="button"
            variant="secondary"
            disabled={busy === "json-export"}
            onClick={() => void run("json-export", () => exportAdminProductsJson())}
          >
            {busy === "json-export" ? "Exporting…" : "Export JSON backup"}
          </Button>
          <Field label="JSON backup file" htmlFor="product-json">
            <Input
              id="product-json"
              type="file"
              accept="application/json,.json"
              onChange={(e) => setJsonFile(e.target.files?.[0] ?? null)}
            />
          </Field>
          <Button
            disabled={!jsonFile || Boolean(busy)}
            onClick={() =>
              void run("json-import", async () => {
                if (!jsonFile) throw new Error("Choose a JSON file first.");
                toast.info("JSON backup import started");
                const payload = await readJsonFile(jsonFile);
                const imported = await importAdminProductsJson(payload);
                const message = `JSON backup restored: inserted ${imported.inserted ?? 0}, skipped ${imported.skipped ?? 0}, failed ${imported.failed ?? 0}.`;
                setResult(message);
                if ((imported.failed ?? 0) > 0) {
                  toast.warning(message);
                } else {
                  toast.success(message);
                }
              })
            }
          >
            {busy === "json-import" ? "Importing…" : "Import JSON backup"}
          </Button>
        </div>
      </details>

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
