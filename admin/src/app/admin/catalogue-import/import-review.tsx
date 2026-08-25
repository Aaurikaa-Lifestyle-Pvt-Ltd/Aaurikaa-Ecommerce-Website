import { Button, EmptyState } from "@/components/ui";
import type { ImportSummary } from "@/lib/api/catalogue-import";
import { downloadTextFile } from "@/lib/api/catalogue-import";
import { errorReportCsv, type ImportIssue } from "@/lib/catalogue-import-errors";
import { cn } from "@/lib/cn";

export function StepList({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <ol className="mb-4 flex flex-wrap gap-2 text-xs sm:text-sm">
      {steps.map((label, index) => {
        const active = index === current;
        const done = index < current;
        return (
          <li
            key={label}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1",
              active
                ? "border-foreground bg-foreground text-background"
                : done
                  ? "border-accent/30 bg-accent/10 text-foreground"
                  : "border-border bg-surface text-muted-foreground",
            )}
          >
            <span className="tabular-nums">{index + 1}</span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}

export function SummaryGrid({ summary }: { summary: ImportSummary }) {
  const items = [
    { label: "Rows", value: summary.total },
    { label: "Valid", value: summary.valid },
    { label: "Warnings", value: summary.warnings },
    { label: "Errors", value: summary.invalid },
    { label: "New", value: summary.newRecords },
    { label: "Updates", value: summary.updates },
  ];
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((item) => (
        <div key={item.label} className="rounded-[var(--radius-sm)] border border-border bg-muted/40 px-3 py-2">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {item.label}
          </dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function IssueTable({
  issues,
  reportName,
}: {
  issues: ImportIssue[];
  reportName: string;
}) {
  if (!issues.length) {
    return <EmptyState message="No row errors. You can confirm the import." />;
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {issues.length} problem{issues.length === 1 ? "" : "s"} to fix before import.
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => downloadTextFile(reportName, errorReportCsv(issues))}
        >
          Download error report
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-semibold">Row</th>
              <th className="px-3 py-2 font-semibold">Field</th>
              <th className="px-3 py-2 font-semibold">Problem</th>
              <th className="px-3 py-2 font-semibold">Suggested fix</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((issue, index) => (
              <tr key={`${issue.row}-${issue.field}-${index}`} className="border-b border-border/70 align-top">
                <td className="px-3 py-2 tabular-nums">{issue.row || "—"}</td>
                <td className="px-3 py-2 font-mono text-xs">{issue.field}</td>
                <td className="px-3 py-2">{issue.problem}</td>
                <td className="px-3 py-2 text-muted-foreground">{issue.suggestedFix}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TemplateNotes({
  notes,
  required,
  xlsxImportEnabled,
}: {
  notes: string[];
  required: string[];
  xlsxImportEnabled: boolean;
}) {
  return (
    <div className="space-y-2 text-sm text-muted-foreground">
      <p>
        Required columns:{" "}
        <span className="font-medium text-foreground">{required.join(", ") || "see template"}</span>
      </p>
      {!xlsxImportEnabled ? (
        <p>Excel templates are for filling in. Upload the CSV unless Excel import is enabled on the server.</p>
      ) : null}
      <ul className="list-disc space-y-1 pl-5">
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  );
}
