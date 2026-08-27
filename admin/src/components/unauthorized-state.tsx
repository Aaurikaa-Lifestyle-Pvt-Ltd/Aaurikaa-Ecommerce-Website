"use client";

import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";

export function UnauthorizedState({
  title = "Access denied",
  description = "You do not have permission to view this page. Ask a Super Admin to grant access, or return to the dashboard.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div>
      <PageHeader title={title} description={description} />
      <Card className="px-4 py-8 text-center sm:px-6">
        <p className="text-sm text-muted-foreground">
          This area is restricted by your staff role permissions.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/admin"
            className="inline-flex h-10 items-center justify-center rounded-[var(--radius-sm)] bg-accent px-4 text-sm font-medium text-white transition hover:opacity-90"
          >
            Go to dashboard
          </Link>
          <Link
            href="/admin/settings"
            className="inline-flex h-10 items-center justify-center rounded-[var(--radius-sm)] border border-border bg-surface px-4 text-sm font-medium text-foreground transition hover:bg-muted"
          >
            Account settings
          </Link>
        </div>
      </Card>
    </div>
  );
}
