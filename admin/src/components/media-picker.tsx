"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Button, EmptyState, ErrorState, Input, LoadingState, Select } from "@/components/ui";
import { fetchAdminMedia } from "@/lib/api/media";
import { ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { isRemoteSrc } from "@/lib/mappers/media";
import type { AdminMediaAsset, MediaType } from "@/types/admin";

type MediaPickerProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (assets: AdminMediaAsset[]) => void;
  mediaType?: MediaType | "all";
  multiple?: boolean;
  title?: string;
};

export function MediaPicker({
  open,
  onClose,
  onSelect,
  mediaType = "all",
  multiple = false,
  title = "Select from Gallery",
}: MediaPickerProps) {
  const [assets, setAssets] = useState<AdminMediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<MediaType | "all">(mediaType);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setQuery("");
    setTypeFilter(mediaType);
    setLoading(true);
    setError(null);
    void fetchAdminMedia()
      .then(setAssets)
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Unable to load gallery.");
      })
      .finally(() => setLoading(false));
  }, [open, mediaType]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((asset) => {
      const matchesType = typeFilter === "all" || asset.mediaType === typeFilter;
      const matchesQuery =
        !q ||
        asset.displayName.toLowerCase().includes(q) ||
        asset.originalFilename.toLowerCase().includes(q) ||
        asset.altText.toLowerCase().includes(q);
      return matchesType && matchesQuery;
    });
  }, [assets, query, typeFilter]);

  function toggle(id: string) {
    setSelected((prev) => {
      if (!multiple) return new Set([id]);
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirm() {
    const chosen = assets.filter((a) => selected.has(a.id));
    onSelect(chosen);
    onClose();
  }

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close gallery picker"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-[81] flex max-h-[90vh] w-full max-w-3xl flex-col rounded-t-[var(--radius-md)] border border-border bg-surface shadow-xl sm:rounded-[var(--radius-md)]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold">{title}</p>
            <p className="text-xs text-muted-foreground">
              Reuses the existing Media library. {multiple ? "Select one or more." : "Select one."}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="grid gap-2 border-b border-border p-3 sm:grid-cols-[1fr_140px]">
          <Input
            placeholder="Search name or filename"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search media"
          />
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as MediaType | "all")}
            aria-label="Filter media type"
            disabled={mediaType !== "all"}
          >
            <option value="all">All types</option>
            <option value="image">Images</option>
            <option value="video">Videos</option>
          </Select>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading ? (
            <LoadingState message="Loading gallery…" />
          ) : error ? (
            <ErrorState message={error} />
          ) : filtered.length === 0 ? (
            <EmptyState message="No media matches your filters." />
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {filtered.map((asset) => {
                const isSelected = selected.has(asset.id);
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => toggle(asset.id)}
                    className={cn(
                      "overflow-hidden rounded-[var(--radius-sm)] border text-left transition",
                      isSelected
                        ? "border-accent ring-2 ring-accent/30"
                        : "border-border hover:border-accent/50",
                    )}
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
                          sizes="160px"
                          unoptimized={isRemoteSrc(asset.url)}
                        />
                      )}
                    </div>
                    <div className="p-2">
                      <p className="truncate text-xs font-medium">{asset.displayName}</p>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {asset.mediaType}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {selected.size} selected
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={confirm} disabled={selected.size === 0}>
              Use selected
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
