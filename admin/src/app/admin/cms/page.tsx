"use client";

import Link from "next/link";
import { Card, EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { fetchStaticPageRegistry } from "@/lib/api/cms";
import { useAdminResource } from "@/lib/use-admin-resource";

export default function CmsListPage() {
  const query = useAdminResource(() => fetchStaticPageRegistry(), []);
  const pages = query.data ?? [];

  return (
    <div>
      <PageHeader
        title="Pages"
        description="AAURIKAA storefront pages — About, Care, FAQ, Shipping, Legal, Contact, and related info pages. Marketplace seller pages stay hidden. Leave legal and refund copy empty until supplied."
      />

      {query.loading ? (
        <Card>
          <LoadingState message="Loading pages…" />
        </Card>
      ) : query.error ? (
        <Card>
          <ErrorState message={query.error} onRetry={() => void query.reload()} />
        </Card>
      ) : pages.length === 0 ? (
        <Card>
          <EmptyState message="No editable pages available." />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {pages.map((page) => (
              <li key={page.pageKey}>
                <Link
                  href={`/admin/cms/${page.pageKey}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3.5 sm:px-5"
                >
                  <span>
                    <span className="font-medium">{page.title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{page.slug}</span>
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {page.cmsEnabled ? page.cmsStatus : "not enabled"}
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
