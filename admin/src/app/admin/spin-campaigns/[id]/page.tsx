"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";
import { ApiError } from "@/lib/api/errors";
import {
  createSpinCampaign,
  deleteSpinCampaign,
  emptySegment,
  fetchSpinAttempts,
  fetchSpinCampaign,
  updateSpinCampaign,
  updateSpinCampaignStatus,
  type SpinCampaignPayload,
  type SpinCampaignStatus,
  type SpinSegmentInput,
  type SpinSegmentType,
} from "@/lib/api/spin-campaigns";
import { formatDateTime } from "@/lib/format";
import { toast } from "@/lib/toast";

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function buildPayload(form: {
  name: string;
  slug: string;
  startDate: string;
  endDate: string;
  headline: string;
  description: string;
  couponCodePrefix: string;
  segments: SpinSegmentInput[];
}): SpinCampaignPayload {
  return {
    name: form.name,
    slug: form.slug,
    startDate: form.startDate || null,
    endDate: form.endDate || null,
    headline: form.headline,
    description: form.description,
    couponCodePrefix: form.couponCodePrefix,
    segments: form.segments,
    status: "draft",
  };
}

function SegmentEditor({
  segment,
  index,
  onChange,
  onRemove,
  canRemove,
}: {
  segment: SpinSegmentInput;
  index: number;
  onChange: (next: SpinSegmentInput) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const template = segment.couponTemplate;

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Segment {index + 1}</p>
        {canRemove ? (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            Remove
          </Button>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Label" htmlFor={`seg-label-${index}`}>
          <Input
            id={`seg-label-${index}`}
            value={segment.label}
            onChange={(e) => onChange({ ...segment, label: e.target.value })}
            placeholder="e.g. 10% Off"
          />
        </Field>
        <Field label="Type" htmlFor={`seg-type-${index}`}>
          <Select
            id={`seg-type-${index}`}
            value={segment.type}
            onChange={(e) => {
              const type = e.target.value as SpinSegmentType;
              onChange({
                ...segment,
                type,
                couponTemplate:
                  type === "coupon"
                    ? segment.couponTemplate ?? {
                        discountType: "percentage",
                        discountValue: 0,
                        minOrder: 0,
                        freeShipping: false,
                        validityDays: 7,
                      }
                    : null,
              });
            }}
          >
            <option value="coupon">Coupon (win)</option>
            <option value="lose">Lose</option>
            <option value="no_reward">No reward</option>
          </Select>
        </Field>
        <Field label="Weight" htmlFor={`seg-weight-${index}`}>
          <Input
            id={`seg-weight-${index}`}
            type="number"
            min={0}
            value={segment.weight}
            onChange={(e) =>
              onChange({ ...segment, weight: Number(e.target.value) || 0 })
            }
          />
        </Field>
        <Field label="Display message" htmlFor={`seg-msg-${index}`}>
          <Input
            id={`seg-msg-${index}`}
            value={segment.displayMessage}
            onChange={(e) => onChange({ ...segment, displayMessage: e.target.value })}
            placeholder="Shown after the spin"
          />
        </Field>
      </div>
      {segment.type === "coupon" && template ? (
        <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
          <p className="sm:col-span-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Coupon template
          </p>
          <Field label="Discount type" htmlFor={`seg-disc-type-${index}`}>
            <Select
              id={`seg-disc-type-${index}`}
              value={template.discountType}
              onChange={(e) =>
                onChange({
                  ...segment,
                  couponTemplate: {
                    ...template,
                    discountType: e.target.value === "fixed" ? "fixed" : "percentage",
                  },
                })
              }
            >
              <option value="percentage">Percentage</option>
              <option value="fixed">Fixed amount</option>
            </Select>
          </Field>
          <Field label="Discount value" htmlFor={`seg-disc-val-${index}`}>
            <Input
              id={`seg-disc-val-${index}`}
              type="number"
              min={0}
              value={template.discountValue}
              onChange={(e) =>
                onChange({
                  ...segment,
                  couponTemplate: {
                    ...template,
                    discountValue: Number(e.target.value) || 0,
                  },
                })
              }
            />
          </Field>
          <Field label="Min order (₹)" htmlFor={`seg-min-${index}`}>
            <Input
              id={`seg-min-${index}`}
              type="number"
              min={0}
              value={template.minOrder}
              onChange={(e) =>
                onChange({
                  ...segment,
                  couponTemplate: {
                    ...template,
                    minOrder: Number(e.target.value) || 0,
                  },
                })
              }
            />
          </Field>
          <Field label="Validity (days)" htmlFor={`seg-valid-${index}`}>
            <Input
              id={`seg-valid-${index}`}
              type="number"
              min={1}
              value={template.validityDays}
              onChange={(e) =>
                onChange({
                  ...segment,
                  couponTemplate: {
                    ...template,
                    validityDays: Math.max(1, Number(e.target.value) || 1),
                  },
                })
              }
            />
          </Field>
          <Field label="Free shipping" htmlFor={`seg-ship-${index}`}>
            <Select
              id={`seg-ship-${index}`}
              value={template.freeShipping ? "yes" : "no"}
              onChange={(e) =>
                onChange({
                  ...segment,
                  couponTemplate: {
                    ...template,
                    freeShipping: e.target.value === "yes",
                  },
                })
              }
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Select>
          </Field>
        </div>
      ) : null}
    </Card>
  );
}

export default function SpinCampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const campaignId = String(params.id ?? "");
  const isNew = campaignId === "new";

  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<SpinCampaignStatus>("draft");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  const [couponCodePrefix, setCouponCodePrefix] = useState("");
  const [segments, setSegments] = useState<SpinSegmentInput[]>([emptySegment()]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [attemptsPage, setAttemptsPage] = useState(1);
  const [attemptsLoading, setAttemptsLoading] = useState(false);
  const [attemptsError, setAttemptsError] = useState<string | null>(null);
  const [attemptsData, setAttemptsData] = useState<
    Awaited<ReturnType<typeof fetchSpinAttempts>> | null
  >(null);

  const loadCampaign = useCallback(async () => {
    if (isNew) return;
    setLoading(true);
    setLoadError(null);
    try {
      const campaign = await fetchSpinCampaign(campaignId);
      if (!campaign) {
        setLoadError("Campaign not found.");
        return;
      }
      setStatus(campaign.status);
      setName(campaign.name);
      setSlug(campaign.slug);
      setStartDate(toDateInputValue(campaign.startDate));
      setEndDate(toDateInputValue(campaign.endDate));
      setHeadline(campaign.headline);
      setDescription(campaign.description);
      setCouponCodePrefix(campaign.couponCodePrefix);
      setSegments(
        campaign.segments.length > 0
          ? campaign.segments.map(({ id: _id, ...rest }) => rest)
          : [emptySegment()],
      );
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Unable to load campaign.");
    } finally {
      setLoading(false);
    }
  }, [campaignId, isNew]);

  const loadAttempts = useCallback(async () => {
    if (isNew) return;
    setAttemptsLoading(true);
    setAttemptsError(null);
    try {
      const data = await fetchSpinAttempts(campaignId, attemptsPage, 20);
      setAttemptsData(data);
    } catch (err) {
      setAttemptsError(
        err instanceof ApiError ? err.message : "Unable to load spin attempts.",
      );
    } finally {
      setAttemptsLoading(false);
    }
  }, [campaignId, attemptsPage, isNew]);

  useEffect(() => {
    void loadCampaign();
  }, [loadCampaign]);

  useEffect(() => {
    void loadAttempts();
  }, [loadAttempts]);

  const totalWeight = useMemo(
    () => segments.reduce((sum, segment) => sum + (Number(segment.weight) || 0), 0),
    [segments],
  );

  async function saveCampaign() {
    if (!name.trim()) {
      setFormError("Campaign name is required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    const payload = buildPayload({
      name,
      slug,
      startDate,
      endDate,
      headline,
      description,
      couponCodePrefix,
      segments,
    });
    try {
      if (isNew) {
        const created = await createSpinCampaign(payload);
        if (!created) {
          setFormError("Campaign was not created.");
          return;
        }
        toast.success("Campaign created");
        router.replace(`/admin/spin-campaigns/${created.id}`);
        return;
      }
      await updateSpinCampaign(campaignId, { ...payload, status });
      toast.success("Campaign saved");
      await loadCampaign();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Unable to save campaign.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(next: SpinCampaignStatus) {
    if (isNew) return;
    setStatusBusy(true);
    setFormError(null);
    try {
      await updateSpinCampaignStatus(campaignId, next);
      setStatus(next);
      toast.success(
        next === "active"
          ? "Campaign activated"
          : next === "ended"
            ? "Campaign ended"
            : next === "disabled"
              ? "Campaign disabled"
              : "Campaign set to draft",
      );
      await loadCampaign();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Unable to update status.");
    } finally {
      setStatusBusy(false);
    }
  }

  async function removeCampaign() {
    if (isNew) return;
    if (!window.confirm("Delete this campaign? This cannot be undone if attempts exist.")) {
      return;
    }
    setDeleteBusy(true);
    setFormError(null);
    try {
      await deleteSpinCampaign(campaignId);
      toast.success("Campaign deleted");
      router.push("/admin/spin-campaigns");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Unable to delete campaign.");
    } finally {
      setDeleteBusy(false);
    }
  }

  if (loading) return <LoadingState message="Loading campaign…" />;
  if (loadError) {
    return (
      <div>
        <ErrorState message={loadError} onRetry={() => void loadCampaign()} />
        <div className="px-4 pb-8 text-center">
          <Link href="/admin/spin-campaigns" className="text-sm font-medium text-accent hover:underline">
            Back to list
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={isNew ? "New spin campaign" : name || "Spin campaign"}
        description={
          isNew
            ? "Define segments, weights, and coupon templates before activating."
            : "Edit campaign settings, lifecycle status, and review shopper attempts."
        }
        action={
          <Link
            href="/admin/spin-campaigns"
            className="inline-flex h-11 items-center rounded-[var(--radius-sm)] border border-border bg-surface px-4 text-sm font-medium hover:bg-muted"
          >
            All campaigns
          </Link>
        }
      />

      {!isNew ? (
        <Card className="mb-4 flex flex-wrap items-center gap-2 p-4">
          <span className="text-sm text-muted-foreground">
            Status: <strong className="capitalize text-foreground">{status}</strong>
          </span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={statusBusy || status === "draft"}
            onClick={() => void changeStatus("draft")}
          >
            Draft
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={statusBusy || status === "active"}
            onClick={() => void changeStatus("active")}
          >
            Activate
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={statusBusy || status === "ended"}
            onClick={() => void changeStatus("ended")}
          >
            End
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={statusBusy || status === "disabled"}
            onClick={() => void changeStatus("disabled")}
          >
            Disable
          </Button>
          <Button
            type="button"
            size="sm"
            variant="danger"
            disabled={deleteBusy}
            onClick={() => void removeCampaign()}
          >
            Delete
          </Button>
        </Card>
      ) : null}

      <Card className="mb-4 p-4">
        <p className="text-sm font-semibold">Campaign details</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Name" htmlFor="name">
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Slug" htmlFor="slug">
            <Input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="auto-from-name if empty"
            />
          </Field>
          <Field label="Start date" htmlFor="startDate">
            <Input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </Field>
          <Field label="End date" htmlFor="endDate">
            <Input
              id="endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </Field>
          <Field label="Headline" htmlFor="headline">
            <Input id="headline" value={headline} onChange={(e) => setHeadline(e.target.value)} />
          </Field>
          <Field label="Coupon code prefix" htmlFor="prefix">
            <Input
              id="prefix"
              value={couponCodePrefix}
              onChange={(e) => setCouponCodePrefix(e.target.value)}
              placeholder="e.g. SPIN"
            />
          </Field>
          <div className="sm:col-span-2">
          <Field label="Description" htmlFor="description">
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </Field>
          </div>
        </div>
      </Card>

      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          Segments{" "}
          <span className="font-normal text-muted-foreground">
            (total weight: {totalWeight})
          </span>
        </p>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => setSegments((prev) => [...prev, emptySegment()])}
        >
          Add segment
        </Button>
      </div>

      <div className="space-y-3">
        {segments.map((segment, index) => (
          <SegmentEditor
            key={index}
            segment={segment}
            index={index}
            canRemove={segments.length > 1}
            onChange={(next) =>
              setSegments((prev) => prev.map((item, i) => (i === index ? next : item)))
            }
            onRemove={() => setSegments((prev) => prev.filter((_, i) => i !== index))}
          />
        ))}
      </div>

      {formError ? (
        <p className="mt-4 text-sm text-danger" role="alert">
          {formError}
        </p>
      ) : null}

      <div className="mt-4 flex gap-2">
        <Button type="button" onClick={() => void saveCampaign()} disabled={saving}>
          {saving ? "Saving…" : isNew ? "Create campaign" : "Save changes"}
        </Button>
      </div>

      {!isNew ? (
        <div className="mt-10">
          <PageHeader
            title="Spin attempts"
            description="Audit trail of shopper spins for this campaign."
          />
          {attemptsLoading ? <LoadingState message="Loading attempts…" /> : null}
          {attemptsError ? (
            <ErrorState message={attemptsError} onRetry={() => void loadAttempts()} />
          ) : null}
          {!attemptsLoading && !attemptsError ? (
            attemptsData && attemptsData.items.length > 0 ? (
              <>
                <Card className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-4 font-semibold">When</th>
                        <th className="py-2 pr-4 font-semibold">Shopper</th>
                        <th className="py-2 pr-4 font-semibold">Segment</th>
                        <th className="py-2 pr-4 font-semibold">Outcome</th>
                        <th className="py-2 font-semibold">Coupon</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attemptsData.items.map((attempt) => (
                        <tr key={attempt.id} className="border-b border-border last:border-0">
                          <td className="py-3 pr-4 text-muted-foreground">
                            {attempt.createdAt ? formatDateTime(attempt.createdAt) : "—"}
                          </td>
                          <td className="py-3 pr-4">
                            {attempt.shopper?.email ||
                              attempt.shopper?.username ||
                              "—"}
                          </td>
                          <td className="py-3 pr-4">{attempt.segmentLabel || "—"}</td>
                          <td className="py-3 pr-4 capitalize">{attempt.outcome}</td>
                          <td className="py-3 font-mono text-xs">
                            {attempt.couponCode || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
                {attemptsData.pagination.pages > 1 ? (
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={attemptsPage <= 1}
                      onClick={() => setAttemptsPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {attemptsData.pagination.page} of {attemptsData.pagination.pages}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={attemptsPage >= attemptsData.pagination.pages}
                      onClick={() => setAttemptsPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                ) : null}
              </>
            ) : (
              <EmptyState message="No spins yet. Attempts appear here after shoppers spin while this campaign is active." />
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
