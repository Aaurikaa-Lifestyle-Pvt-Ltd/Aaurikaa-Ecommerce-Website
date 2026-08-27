"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  Button,
  Card,
  CardHeader,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";
import { fetchAdminEnquiry, patchAdminEnquiry } from "@/lib/api/enquiries";
import { ApiError } from "@/lib/api/errors";
import { toast } from "@/lib/toast";
import { useAdminResource } from "@/lib/use-admin-resource";

export default function EnquiryDetailPage() {
  const params = useParams<{ id: string }>();
  const query = useAdminResource(() => fetchAdminEnquiry(params.id), [params.id]);
  const enquiry = query.data;
  const [status, setStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const currentStatus = status || enquiry?.status || "submitted";

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      await patchAdminEnquiry(params.id, { status: currentStatus, adminNotes: notes });
      toast.success("Enquiry updated");
      await query.reload();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Unable to update enquiry.");
    } finally {
      setSaving(false);
    }
  }

  if (query.loading) {
    return (
      <div>
        <PageHeader title="Enquiry" />
        <LoadingState message="Loading enquiry…" />
      </div>
    );
  }

  if (query.error || !enquiry) {
    return (
      <div>
        <PageHeader title="Enquiry" />
        <ErrorState message={query.error || "Enquiry not found"} onRetry={() => void query.reload()} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={enquiry.enquiryNumber || "Enquiry"}
        description={enquiry.subject || enquiry.category || ""}
        action={
          <Link
            href="/admin/enquiries"
            className="inline-flex h-11 items-center rounded-[var(--radius-sm)] border border-border bg-surface px-4 text-sm font-medium"
          >
            Back
          </Link>
        }
      />

      <Card className="mb-4">
        <CardHeader title="Customer" />
        <div className="space-y-1 p-4 text-sm sm:p-5">
          <p>{enquiry.submitter?.name}</p>
          <p className="text-muted-foreground">{enquiry.submitter?.email}</p>
          <p className="whitespace-pre-wrap pt-3">{enquiry.message}</p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Handling" />
        <div className="grid gap-4 p-4 sm:p-5">
          <Field label="Status" htmlFor="status">
            <Select id="status" value={currentStatus} onChange={(e) => setStatus(e.target.value)}>
              <option value="submitted">submitted</option>
              <option value="in_review">in_review</option>
              <option value="resolved">resolved</option>
              <option value="closed">closed</option>
            </Select>
          </Field>
          <Field label="Admin notes" htmlFor="notes">
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
          </Field>
          {saveError ? (
            <p className="text-sm text-danger" role="alert">
              {saveError}
            </p>
          ) : null}
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Update enquiry"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
