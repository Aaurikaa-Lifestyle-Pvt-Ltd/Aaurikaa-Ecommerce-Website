"use client";

import Link from "next/link";
import { Card, EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { fetchAdminEnquiries } from "@/lib/api/enquiries";
import { useAdminResource } from "@/lib/use-admin-resource";

export default function EnquiriesPage() {
  const query = useAdminResource(() => fetchAdminEnquiries(), []);
  const list = query.data ?? [];

  return (
    <div>
      <PageHeader
        title="Enquiries"
        description="Customer enquiries from the existing support engine."
      />

      {query.loading ? (
        <Card>
          <LoadingState message="Loading enquiries…" />
        </Card>
      ) : query.error ? (
        <Card>
          <ErrorState message={query.error} onRetry={() => void query.reload()} />
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState message="No enquiries yet." />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {list.map((item) => {
              const id = String(item._id ?? item.id ?? "");
              return (
                <li key={id}>
                  <Link
                    href={`/admin/enquiries/${id}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3.5 sm:px-5"
                  >
                    <span className="font-medium">
                      {item.enquiryNumber || item.subject || id}
                    </span>
                    <span className="text-sm text-muted-foreground">{item.status}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
