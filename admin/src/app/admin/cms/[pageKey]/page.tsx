"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Button,
  Card,
  CardHeader,
  ErrorState,
  Field,
  Input,
  LoadingState,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";
import { pruneOrderedSections, type OrderedSection } from "@/lib/cms-ordered-sections";
import { StructuredEditor } from "@/components/structured-editor";
import { fetchStaticPage, saveStaticPage } from "@/lib/api/cms";
import { isMarketplaceCmsPageKey } from "@/lib/cms-pages";
import { storefrontPreviewPath } from "@/lib/cms-preview";
import { ApiError } from "@/lib/api/errors";
import { toast } from "@/lib/toast";
import { useAdminResource } from "@/lib/use-admin-resource";

type PageStatus = "draft" | "published" | "trashed";

function zoneValue(zones: Record<string, unknown>, id: string, fallback: unknown) {
  return zones[id] !== undefined ? zones[id] : fallback;
}

function prepareZonesForSave(
  zones: Record<string, unknown>,
  manifestZones: Array<{ id: string; type: string }>,
): Record<string, unknown> {
  const next = { ...zones };
  for (const zone of manifestZones) {
    if (zone.type !== "orderedSections") continue;
    const current = next[zone.id];
    if (!Array.isArray(current)) continue;
    next[zone.id] = pruneOrderedSections(current as OrderedSection[]);
  }
  return next;
}

export default function CmsEditorPage() {
  const params = useParams<{ pageKey: string }>();
  const pageKey = params.pageKey;
  const query = useAdminResource(() => fetchStaticPage(pageKey), [pageKey]);

  if (isMarketplaceCmsPageKey(pageKey)) {
    return (
      <div>
        <PageHeader title="Pages" description="This marketplace page is not part of AAURIKAA Admin." />
        <Link href="/admin/cms" className="text-sm font-medium text-accent">
          Back to pages
        </Link>
      </div>
    );
  }

  if (query.loading) {
    return (
      <div>
        <PageHeader title="Pages" />
        <LoadingState message="Loading page…" />
      </div>
    );
  }

  if (query.error) {
    return (
      <div>
        <PageHeader title="Pages" />
        <ErrorState message={query.error} onRetry={() => void query.reload()} />
      </div>
    );
  }

  if (!query.data?.manifest) {
    return (
      <div>
        <PageHeader
          title="Pages"
          description="This page is not set up for editing yet."
        />
        <Link href="/admin/cms" className="text-sm font-medium text-accent">
          Back to pages
        </Link>
      </div>
    );
  }

  return <CmsEditor pageKey={pageKey} initial={query.data} onReload={() => query.reload()} />;
}

function CmsEditor({
  pageKey,
  initial,
  onReload,
}: {
  pageKey: string;
  initial: Awaited<ReturnType<typeof fetchStaticPage>>;
  onReload: () => Promise<void>;
}) {
  const startingZones = useMemo(
    () => ({ ...(initial.emptyZones || {}), ...(initial.page?.zones || {}) }),
    [initial],
  );
  const [status, setStatus] = useState<PageStatus>(
    (initial.page?.status as PageStatus) || "draft",
  );
  const [seoTitle, setSeoTitle] = useState(initial.page?.seo?.title ?? "");
  const [seoDescription, setSeoDescription] = useState(initial.page?.seo?.metaDescription ?? "");
  const [zones, setZones] = useState<Record<string, unknown>>(startingZones);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const preview = storefrontPreviewPath(pageKey, initial.page?.slug);

  function setZone(id: string, value: unknown) {
    setZones((current) => ({ ...current, [id]: value }));
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const prepared = prepareZonesForSave(zones, initial.manifest?.zones ?? []);
      await saveStaticPage(pageKey, {
        status,
        seo: { title: seoTitle, metaDescription: seoDescription },
        zones: prepared,
      });
      setZones(prepared);
      toast.success("Page saved");
      await onReload();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Unable to save this page.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={initial.manifest?.label || pageKey}
        description="Edit storefront page content. Leave unpublished until approved copy is ready. Refund policy text stays on hold."
        action={
          <>
            <Link
              href="/admin/cms"
              className="inline-flex h-11 items-center rounded-[var(--radius-sm)] border border-border bg-surface px-4 text-sm font-medium"
            >
              Back
            </Link>
            {preview.href ? (
              <a
                href={preview.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center rounded-[var(--radius-sm)] border border-border bg-surface px-4 text-sm font-medium"
              >
                Preview
              </a>
            ) : null}
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </>
        }
      />

      {saveError ? (
        <p className="mb-4 text-sm text-danger" role="alert">
          {saveError}
        </p>
      ) : null}

      {preview.path ? (
        <p className="mb-4 text-sm text-muted-foreground">
          Storefront path: <span className="font-medium text-foreground">{preview.path}</span>
          {preview.note ? ` — ${preview.note}` : null}
        </p>
      ) : null}

      <div className="space-y-4">
        <Card>
          <CardHeader title="Status and search listing" />
          <div className="grid gap-4 p-4 sm:p-5">
            <Field label="Status" htmlFor="cms-status">
              <Select
                id="cms-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as PageStatus)}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="trashed">Trashed</option>
              </Select>
            </Field>
            <Field label="Search title" htmlFor="cms-seo-title">
              <Input id="cms-seo-title" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} />
            </Field>
            <Field label="Search description" htmlFor="cms-seo-desc">
              <Textarea
                id="cms-seo-desc"
                value={seoDescription}
                onChange={(e) => setSeoDescription(e.target.value)}
                rows={3}
              />
            </Field>
          </div>
        </Card>

        {(initial.manifest?.zones ?? []).map((zone) => (
          <StructuredEditor
            key={zone.id}
            zone={zone}
            value={zoneValue(zones, zone.id, initial.emptyZones[zone.id])}
            onChange={(value) => setZone(zone.id, value)}
          />
        ))}
      </div>
    </div>
  );
}
