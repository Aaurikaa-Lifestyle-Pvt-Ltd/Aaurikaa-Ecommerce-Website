"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
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
import {
  deleteAdminMedia,
  fetchAdminMedia,
  updateAdminMedia,
  uploadAdminMedia,
} from "@/lib/api/media";
import { ApiError } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/format";
import { isRemoteSrc } from "@/lib/mappers/media";
import { toast, toastMessageFromUnknown } from "@/lib/toast";
import { useAdminResource } from "@/lib/use-admin-resource";
import type { AdminMediaAsset, MediaType } from "@/types/admin";

function formatBytes(size: number) {
  if (!size) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function GalleryPage() {
  const mediaQuery = useAdminResource(() => fetchAdminMedia(), []);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<MediaType | "all">("all");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [preview, setPreview] = useState<AdminMediaAsset | null>(null);
  const [editName, setEditName] = useState("");
  const [editAlt, setEditAlt] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 24;

  const filtered = useMemo(() => {
    const list = mediaQuery.data ?? [];
    const q = query.trim().toLowerCase();
    return list.filter((asset) => {
      const matchesType = typeFilter === "all" || asset.mediaType === typeFilter;
      const matchesQuery =
        !q ||
        asset.displayName.toLowerCase().includes(q) ||
        asset.originalFilename.toLowerCase().includes(q) ||
        asset.altText.toLowerCase().includes(q);
      return matchesType && matchesQuery;
    });
  }, [mediaQuery.data, query, typeFilter]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setUploadError(null);
    try {
      for (const file of Array.from(files)) {
        await uploadAdminMedia({ file, displayName: file.name });
      }
      setPage(1);
      toast.success(files.length === 1 ? "Media uploaded" : `${files.length} files uploaded`);
      await mediaQuery.reload();
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function openPreview(asset: AdminMediaAsset) {
    setPreview(asset);
    setEditName(asset.displayName);
    setEditAlt(asset.altText);
  }

  async function saveMeta() {
    if (!preview) return;
    setSavingMeta(true);
    try {
      const updated = await updateAdminMedia(preview.id, {
        displayName: editName,
        altText: editAlt,
      });
      if (updated) setPreview(updated);
      toast.success("Media details saved");
      await mediaQuery.reload();
    } catch (err) {
      toast.error(toastMessageFromUnknown(err, "Unable to update media."));
    } finally {
      setSavingMeta(false);
    }
  }

  async function removeMedia() {
    if (!preview) return;
    if (!window.confirm("Delete this media asset? Products referencing it may block deletion.")) {
      return;
    }
    setSavingMeta(true);
    try {
      await deleteAdminMedia(preview.id);
      setPreview(null);
      toast.success("Media deleted");
      await mediaQuery.reload();
    } catch (err) {
      toast.error(toastMessageFromUnknown(err, "Unable to delete media."));
    } finally {
      setSavingMeta(false);
    }
  }

  async function copyUrl() {
    if (!preview?.url) return;
    try {
      await navigator.clipboard.writeText(preview.url);
      toast.success("URL copied");
    } catch {
      toast.error("Unable to copy URL.");
    }
  }

  return (
    <div>
      <PageHeader
        title="Gallery"
        description="Reusable media library backed by the existing Media APIs. Upload once, reuse across products."
        action={
          <label className="inline-flex h-11 cursor-pointer items-center rounded-[var(--radius-sm)] bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-slate-800">
            {uploading ? "Uploading…" : "Upload media"}
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                void handleUpload(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        }
      />

      {uploadError ? (
        <p className="mb-3 text-sm text-danger" role="alert">
          {uploadError}
        </p>
      ) : null}

      <Card className="mb-4 p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
          <Input
            placeholder="Search name, filename, or alt text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            aria-label="Search gallery"
          />
          <Select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value as MediaType | "all");
              setPage(1);
            }}
            aria-label="Filter by type"
          >
            <option value="all">All types</option>
            <option value="image">Images</option>
            <option value="video">Videos</option>
          </Select>
        </div>
      </Card>

      {mediaQuery.loading ? (
        <Card>
          <LoadingState message="Loading gallery…" />
        </Card>
      ) : mediaQuery.error ? (
        <Card>
          <ErrorState message={mediaQuery.error} onRetry={() => void mediaQuery.reload()} />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState message="No media yet. Upload an image or video to start the library." />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {pageItems.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => openPreview(asset)}
                className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface text-left transition hover:border-accent/50"
              >
                <div className="relative aspect-square bg-muted">
                  {asset.mediaType === "video" ? (
                    <video
                      src={asset.url}
                      className="h-full w-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <Image
                      src={asset.url}
                      alt={asset.altText || asset.displayName}
                      fill
                      className="object-cover"
                      sizes="220px"
                      unoptimized={isRemoteSrc(asset.url)}
                    />
                  )}
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-semibold">{asset.displayName}</p>
                  <p className="mt-0.5 text-xs uppercase tracking-wide text-muted-foreground">
                    {asset.mediaType} · {formatBytes(asset.size)}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {pages > 1 ? (
            <div className="mt-4 flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Page {page} of {pages} · {filtered.length} assets
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= pages}
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}

      {preview ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close preview"
            onClick={() => setPreview(null)}
          />
          <Card className="relative z-[71] max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-[var(--radius-md)] sm:rounded-[var(--radius-md)]">
            <div className="border-b border-border px-4 py-3 sm:px-5">
              <p className="text-sm font-semibold">Media preview</p>
              <p className="text-xs text-muted-foreground">
                {preview.createdAt ? formatDateTime(preview.createdAt) : "—"}
              </p>
            </div>
            <div className="space-y-4 p-4 sm:p-5">
              <div className="relative aspect-video overflow-hidden rounded-[var(--radius-sm)] bg-muted">
                {preview.mediaType === "video" ? (
                  <video src={preview.url} className="h-full w-full object-contain" controls />
                ) : (
                  <Image
                    src={preview.url}
                    alt={preview.altText || preview.displayName}
                    fill
                    className="object-contain"
                    sizes="640px"
                    unoptimized={isRemoteSrc(preview.url)}
                  />
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Display name" htmlFor="media-name">
                  <Input
                    id="media-name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </Field>
                <Field label="Type" htmlFor="media-type">
                  <Input id="media-type" value={preview.mediaType} readOnly />
                </Field>
                <Field label="Alt text" htmlFor="media-alt" className="sm:col-span-2">
                  <Textarea
                    id="media-alt"
                    value={editAlt}
                    onChange={(e) => setEditAlt(e.target.value)}
                    rows={2}
                  />
                </Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void saveMeta()} disabled={savingMeta}>
                  {savingMeta ? "Saving…" : "Save details"}
                </Button>
                <Button variant="secondary" onClick={() => void copyUrl()}>
                  Copy URL
                </Button>
                <Button variant="danger" onClick={() => void removeMedia()} disabled={savingMeta}>
                  Delete
                </Button>
                <Button variant="ghost" onClick={() => setPreview(null)}>
                  Close
                </Button>
              </div>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
