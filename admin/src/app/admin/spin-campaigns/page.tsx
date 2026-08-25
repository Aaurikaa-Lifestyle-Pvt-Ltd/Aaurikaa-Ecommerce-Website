"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@/components/ui";
import { fetchSpinCampaigns, type SpinCampaignSummary } from "@/lib/api/spin-campaigns";
import { useAdminResource } from "@/lib/use-admin-resource";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

const statusStyles: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  active: "bg-emerald-50 text-emerald-800 border-emerald-200",
  ended: "bg-amber-50 text-amber-800 border-amber-200",
  disabled: "bg-red-50 text-red-800 border-red-200",
};

function CampaignStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold capitalize",
        statusStyles[status] ?? "bg-muted text-muted-foreground border-border",
      )}
    >
      {status}
    </span>
  );
}

function CampaignRow({ campaign }: { campaign: SpinCampaignSummary }) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-3 pr-4">
        <Link
          href={`/admin/spin-campaigns/${campaign.id}`}
          className="font-medium text-foreground hover:underline"
        >
          {campaign.name}
        </Link>
        <p className="text-xs text-muted-foreground">{campaign.slug}</p>
      </td>
      <td className="py-3 pr-4">
        <CampaignStatusBadge status={campaign.status} />
      </td>
      <td className="py-3 pr-4 text-sm text-muted-foreground">
        {campaign.startDate ? formatDate(campaign.startDate) : "—"}
        {" → "}
        {campaign.endDate ? formatDate(campaign.endDate) : "—"}
      </td>
      <td className="py-3 pr-4 text-sm text-muted-foreground">
        {campaign.updatedAt ? formatDate(campaign.updatedAt) : "—"}
      </td>
      <td className="py-3 text-right">
        <Link
          href={`/admin/spin-campaigns/${campaign.id}`}
          className="text-sm font-medium text-accent hover:underline"
        >
          Manage
        </Link>
      </td>
    </tr>
  );
}

export default function SpinCampaignsPage() {
  const router = useRouter();
  const query = useAdminResource(() => fetchSpinCampaigns(), []);

  return (
    <div>
      <PageHeader
        title="Spin to Win"
        description="Configure spin-wheel campaigns, segment weights, and coupon templates. Requires promotions permission."
        action={
          <Button onClick={() => router.push("/admin/spin-campaigns/new")}>
            New campaign
          </Button>
        }
      />

      {query.loading ? <LoadingState message="Loading campaigns…" /> : null}
      {query.error ? <ErrorState message={query.error} onRetry={() => void query.reload()} /> : null}

      {!query.loading && !query.error ? (
        query.data && query.data.length > 0 ? (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4 font-semibold">Campaign</th>
                  <th className="py-2 pr-4 font-semibold">Status</th>
                  <th className="py-2 pr-4 font-semibold">Window</th>
                  <th className="py-2 pr-4 font-semibold">Updated</th>
                  <th className="py-2 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {query.data.map((campaign) => (
                  <CampaignRow key={campaign.id} campaign={campaign} />
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <div className="text-center">
            <EmptyState message="No spin campaigns yet. Create one with weighted segments and coupon templates." />
            <div className="pb-8">
              <Button onClick={() => router.push("/admin/spin-campaigns/new")}>
                Create campaign
              </Button>
            </div>
          </div>
        )
      ) : null}
    </div>
  );
}
