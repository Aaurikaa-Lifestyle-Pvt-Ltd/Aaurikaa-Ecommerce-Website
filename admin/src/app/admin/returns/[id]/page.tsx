"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Button, Card, CardHeader, ErrorState, LoadingState, PageHeader, Select, Textarea } from "@/components/ui";
import {
  confirmAfterSalesReceipt,
  fetchAdminReturn,
  resolveAfterSales,
  retryAfterSalesPickup,
  reviewAfterSales,
  type AdminReturnRequest,
} from "@/lib/api/returns";
import { formatDateTime } from "@/lib/format";
import {
  resolutionReasonLabel,
  resolveReturnActionVisibility,
} from "@/lib/returns-actions";
import { toast, toastMessageFromUnknown } from "@/lib/toast";
import { useAdminResource } from "@/lib/use-admin-resource";

const RESOLUTION_CODES = [
  "MANUFACTURING_DEFECT",
  "WRONG_ITEM",
  "TRANSIT_DAMAGE",
  "SELLER_GOODWILL",
  "OTHER",
] as const;

export default function ReturnDetailPage() {
  const params = useParams<{ id: string }>();
  const query = useAdminResource(() => fetchAdminReturn(params.id), [params.id]);

  if (query.loading) {
    return (
      <div>
        <PageHeader title="Return" />
        <LoadingState message="Loading return…" />
      </div>
    );
  }

  if (query.error) {
    return (
      <div>
        <PageHeader title="Return" />
        <ErrorState message={query.error} onRetry={() => void query.reload()} />
      </div>
    );
  }

  if (!query.data) {
    return (
      <div>
        <PageHeader title="Return not found" />
        <Link href="/admin/returns" className="text-sm font-medium text-accent">
          Back to returns
        </Link>
      </div>
    );
  }

  return <ReturnDetailView seed={query.data} onReload={() => query.reload()} />;
}

function ReturnDetailView({
  seed,
  onReload,
}: {
  seed: AdminReturnRequest;
  onReload: () => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [resolution, setResolution] = useState<"replacement" | "repair" | "rejected">("replacement");
  const [reasonCode, setReasonCode] = useState<string>(RESOLUTION_CODES[0]);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>, successMessage: string) {
    setBusy(true);
    try {
      await action();
      toast.success(successMessage);
      await onReload();
    } catch (err) {
      toast.error(toastMessageFromUnknown(err, "Unable to update this case."));
    } finally {
      setBusy(false);
    }
  }

  const reverse = seed.reverseLogistics;
  const visibility = resolveReturnActionVisibility(seed);

  return (
    <div>
      <PageHeader
        title={seed.order?.invoiceNumber || seed._id}
        description="Existing after-sales workflow. Refund is not available until AAURIKAA policy is approved."
        action={
          <Link
            href="/admin/returns"
            className="inline-flex h-11 items-center rounded-[var(--radius-sm)] border border-border bg-surface px-4 text-sm font-medium"
          >
            Back
          </Link>
        }
      />

      <div className="space-y-4">
        <Card>
          <CardHeader title="Case" />
          <div className="space-y-1 p-4 text-sm sm:p-5">
            <p>Status {seed.status}</p>
            {seed.resolution ? <p>Resolution {seed.resolution}</p> : null}
            <p>{seed.reasonCode}</p>
            {seed.reasonText ? <p className="text-muted-foreground">{seed.reasonText}</p> : null}
            {seed.manualFollowUpRequired ? (
              <p className="text-muted-foreground">Manual follow-up required</p>
            ) : null}
            {seed.slaReminderSentAt ? (
              <p className="text-muted-foreground">
                SLA reminder {formatDateTime(seed.slaReminderSentAt)}
              </p>
            ) : null}
            {seed.slaEscalatedAt ? (
              <p className="text-muted-foreground">
                SLA escalated {formatDateTime(seed.slaEscalatedAt)}
              </p>
            ) : null}
            {seed.order?._id ? (
              <Link href={`/admin/orders/${seed.order._id}`} className="inline-block pt-2 font-medium text-accent">
                View order
              </Link>
            ) : null}
            {seed.replacementOrderId ? (
              <Link
                href={`/admin/orders/${seed.replacementOrderId}`}
                className="block font-medium text-accent"
              >
                View replacement order
              </Link>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="Evidence" />
          <ul className="space-y-2 p-4 text-sm sm:p-5">
            {(seed.evidence || []).length === 0 ? (
              <li className="text-muted-foreground">No evidence files.</li>
            ) : (
              seed.evidence?.map((item, index) => (
                <li key={`${item.url}-${index}`}>
                  {item.url ? (
                    <a href={item.url} className="text-accent" target="_blank" rel="noreferrer">
                      {item.fileName || item.mediaType || "File"}
                    </a>
                  ) : (
                    item.fileName || "File"
                  )}
                </li>
              ))
            )}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Reverse pickup" />
          <div className="space-y-2 p-4 text-sm sm:p-5">
            <p>{reverse?.status || "Not scheduled"}</p>
            {reverse?.awbCode ? <p>AWB {reverse.awbCode}</p> : null}
            {reverse?.trackingUrl ? (
              <a href={reverse.trackingUrl} className="text-accent" target="_blank" rel="noreferrer">
                Track pickup
              </a>
            ) : null}
            {reverse?.lastError ? <p className="text-danger">{reverse.lastError}</p> : null}
            {visibility.showRetryPickup ? (
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void run(() => retryAfterSalesPickup(seed._id), "Pickup retry requested")
                }
              >
                Retry pickup
              </Button>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="Actions" />
          <div className="space-y-3 p-4 sm:p-5">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Internal note"
            />
            {(visibility.showAcceptReject || visibility.showConfirmReceipt) ? (
              <div className="flex flex-wrap gap-2">
                {visibility.showAcceptReject ? (
                  <>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () =>
                            reviewAfterSales(seed._id, {
                              action: "accept",
                              returnRequired: true,
                              note,
                            }),
                          "Return accepted; reverse pickup requested",
                        )
                      }
                    >
                      Accept + reverse pickup
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => reviewAfterSales(seed._id, { action: "reject", note }),
                          "Return request rejected",
                        )
                      }
                    >
                      Reject
                    </Button>
                  </>
                ) : null}
                {visibility.showConfirmReceipt ? (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => confirmAfterSalesReceipt(seed._id, note),
                        "Receipt confirmed",
                      )
                    }
                  >
                    Confirm receipt
                  </Button>
                ) : null}
              </div>
            ) : null}
            {visibility.showResolution ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select value={resolution} onChange={(e) => setResolution(e.target.value as typeof resolution)}>
                    <option value="replacement">Replacement</option>
                    <option value="repair">Repair (manual follow-up)</option>
                    <option value="rejected">Rejected</option>
                  </Select>
                  <Select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
                    {RESOLUTION_CODES.map((code) => (
                      <option key={code} value={code}>
                        {resolutionReasonLabel(code)}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => resolveAfterSales(seed._id, { resolution, reasonCode, note }),
                      resolution === "replacement"
                        ? "Resolution recorded: replacement"
                        : resolution === "repair"
                          ? "Resolution recorded: repair"
                          : "Resolution recorded: rejected",
                    )
                  }
                >
                  Record resolution
                </Button>
              </>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
