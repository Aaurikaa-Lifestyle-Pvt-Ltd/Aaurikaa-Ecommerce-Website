"use client";

import { useState } from "react";
import { Button, Card, CardHeader, Field, Input, Select } from "@/components/ui";
import { ApiError } from "@/lib/api/errors";
import {
  downloadCategoryImportTemplate,
  exportAdminCategories,
  importAdminCategories,
  summaryFromCategoryPayload,
  validateAdminCategoryImport,
  type ImportSummary,
  type ImportTemplateSpec,
  type SpreadsheetFormat,
} from "@/lib/api/catalogue-import";
import { issuesFromUnknown, type ImportIssue } from "@/lib/catalogue-import-errors";
import { toast } from "@/lib/toast";
import { IssueTable, StepList, SummaryGrid, TemplateNotes } from "./import-review";

const STEPS = ["Template", "Upload", "Review", "Confirm", "Result"];

export function CategoryImportExportPanel({ spec }: { spec: ImportTemplateSpec | null }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [issues, setIssues] = useState<ImportIssue[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [exportKind, setExportKind] = useState<"catalogue-csv" | "catalogue-xlsx" | "full-csv">(
    "catalogue-csv",
  );

  const blocking = Boolean(
    summary && (summary.invalid > 0 || issues.length > 0 || summary.valid === 0),
  );
  const currentStep = result ? 4 : summary ? 2 : file ? 1 : 0;
  const accept = spec?.xlsxImportEnabled
    ? ".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    : ".csv,text/csv";

  function resetReview() {
    setSummary(null);
    setIssues([]);
    setResult(null);
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
          title="Import categories"
          description="Each row is one level: Category, then Subcategory, then Child Category. Parents must exist or appear first in the file."
        />
        <div className="space-y-4 p-4 sm:p-5">
          <StepList steps={STEPS} current={currentStep} />
          {spec ? (
            <TemplateNotes
              notes={spec.notes ?? []}
              required={spec.required}
              xlsxImportEnabled={Boolean(spec.xlsxImportEnabled)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Loading template guidance…</p>
          )}

          <div className="overflow-x-auto rounded-[var(--radius-sm)] border border-border">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">→ Subcategory</th>
                  <th className="px-3 py-2">→ Child category</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-3 py-2">level = category</td>
                  <td className="px-3 py-2">level = subcategory + parentCategory</td>
                  <td className="px-3 py-2">level = childCategory + both parents</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={busy === "template-csv"}
              onClick={() => void run("template-csv", () => downloadCategoryImportTemplate("csv"))}
            >
              {busy === "template-csv" ? "Downloading…" : "Download CSV template"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy === "template-xlsx"}
              onClick={() => void run("template-xlsx", () => downloadCategoryImportTemplate("xlsx"))}
            >
              {busy === "template-xlsx" ? "Downloading…" : "Download Excel template"}
            </Button>
          </div>

          <Field label="Category spreadsheet" htmlFor="category-import-file">
            <Input
              id="category-import-file"
              type="file"
              accept={accept}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                resetReview();
              }}
            />
          </Field>

          <Button
            type="button"
            variant="secondary"
            disabled={!file || Boolean(busy)}
            onClick={() =>
              void run("validate", async () => {
                if (!file) throw new Error("Choose a file first.");
                toast.info("Validating category spreadsheet…");
                const payload = await validateAdminCategoryImport(file);
                const nextSummary = summaryFromCategoryPayload(payload);
                const nextIssues = issuesFromUnknown(payload.errors);
                setSummary(nextSummary);
                setIssues(nextIssues);
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
                    `Validation passed for ${nextSummary.valid} categor${nextSummary.valid === 1 ? "y" : "ies"}.`,
                  );
                }
              })
            }
          >
            {busy === "validate" ? "Validating…" : "Validate"}
          </Button>
        </div>
      </Card>

      {summary ? (
        <Card>
          <CardHeader
            title="Import summary"
            description={
              blocking
                ? "Hierarchy or slug problems must be fixed first."
                : "Matching names/slugs will be updated. New names will be created."
            }
          />
          <div className="space-y-4 p-4 sm:p-5">
            <SummaryGrid summary={summary} />
            <IssueTable issues={issues} reportName="category_import_errors.csv" />
            {!blocking ? (
              <div className="rounded-[var(--radius-sm)] border border-border bg-muted/30 p-4">
                <p className="text-sm font-medium">
                  You&apos;re about to import {summary.valid} category row
                  {summary.valid === 1 ? "" : "s"}.
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  New: {summary.newRecords} · Updates: {summary.updates} · Errors: {summary.invalid}
                </p>
                <Button
                  className="mt-3"
                  disabled={!file || Boolean(busy)}
                  onClick={() =>
                    void run("import", async () => {
                      if (!file) throw new Error("Choose a file first.");
                      toast.info("Category import started");
                      const payload = await importAdminCategories(file);
                      const failed = payload.failed ?? 0;
                      const message = failed
                        ? `Imported ${payload.imported ?? 0} rows with ${failed} row-level error${failed === 1 ? "" : "s"}.`
                        : `Imported ${payload.imported ?? summary.valid} category rows.`;
                      setResult(message);
                      if (payload.errors?.length) {
                        setIssues(issuesFromUnknown(payload.errors));
                      }
                      if (failed) {
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
                Fix missing parents, duplicate slugs, and invalid values, then validate again.
              </p>
            )}
          </div>
        </Card>
      ) : null}

      {result ? (
        <Card>
          <CardHeader title="Import result" />
          <p className="p-4 text-sm sm:p-5">{result}</p>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Export categories"
          description="Catalogue export is for everyday editing and re-import. Full Technical Backup keeps SEO, FAQ, mega menu, and compatibility columns."
        />
        <div className="space-y-3 p-4 sm:p-5">
          <Field label="Export file" htmlFor="category-export-kind">
            <Select
              id="category-export-kind"
              value={exportKind}
              onChange={(e) => setExportKind(e.target.value as typeof exportKind)}
            >
              <option value="catalogue-csv">Catalogue CSV</option>
              <option value="catalogue-xlsx">Catalogue Excel</option>
              <option value="full-csv">Full Technical Backup</option>
            </Select>
          </Field>
          <Button
            disabled={Boolean(busy)}
            onClick={() =>
              void run("export", () =>
                exportAdminCategories({
                  format: exportKind === "catalogue-xlsx" ? "xlsx" : "csv",
                  profile: exportKind === "full-csv" ? "full" : "operator",
                }),
              )
            }
          >
            {busy === "export" ? "Exporting…" : "Download export"}
          </Button>
        </div>
      </Card>

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
