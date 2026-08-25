"use client";

import Image from "next/image";
import { useEffect, useId, useState } from "react";
import { Button, Field } from "@/components/ui";
import { MediaPicker } from "@/components/media-picker";
import { isRemoteSrc } from "@/lib/mappers/media";
import type { AdminMediaAsset, MediaType } from "@/types/admin";
import type { ProductMediaSlot } from "@/lib/mappers/product-write";

function useObjectUrl(file?: File | null): string {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!file) {
      setUrl("");
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

function slotPreview(slot: ProductMediaSlot | undefined, objectUrl: string): string {
  if (!slot) return "";
  if (slot.file) return objectUrl;
  return slot.url ?? "";
}

export function ProductSingleMediaField({
  label,
  slot,
  onChange,
  accept,
  mediaType,
  htmlFor,
}: {
  label: string;
  slot?: ProductMediaSlot;
  onChange: (slot: ProductMediaSlot | undefined) => void;
  accept: string;
  mediaType: MediaType;
  htmlFor: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const objectUrl = useObjectUrl(slot?.file);
  const src = slotPreview(slot, objectUrl);

  return (
    <Field label={label} htmlFor={htmlFor}>
      <div className="space-y-2">
        {src ? (
          <div className="relative h-36 w-full overflow-hidden rounded-[var(--radius-sm)] bg-muted sm:w-48">
            {mediaType === "video" || slot?.file?.type.startsWith("video/") ? (
              <video src={src} className="h-full w-full object-cover" controls preload="metadata" />
            ) : (
              <Image
                src={src}
                alt={label}
                fill
                className="object-cover"
                sizes="192px"
                unoptimized={isRemoteSrc(src) || Boolean(slot?.file)}
              />
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No media selected.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex h-10 cursor-pointer items-center rounded-[var(--radius-sm)] border border-border bg-surface px-3 text-sm font-medium hover:bg-muted">
            Upload
            <input
              id={htmlFor}
              type="file"
              accept={accept}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onChange({ file, url: undefined, mediaId: undefined });
                e.target.value = "";
              }}
            />
          </label>
          <Button type="button" variant="secondary" size="sm" onClick={() => setPickerOpen(true)}>
            From Gallery
          </Button>
          {slot ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(undefined)}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        mediaType={mediaType}
        title={`Select ${label.toLowerCase()}`}
        onSelect={(assets) => {
          const asset = assets[0];
          if (!asset) return;
          onChange({ url: asset.url, mediaId: asset.id, file: null });
        }}
      />
    </Field>
  );
}

function GalleryThumb({
  slot,
  index,
  total,
  onRemove,
  onMove,
}: {
  slot: ProductMediaSlot;
  index: number;
  total: number;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const objectUrl = useObjectUrl(slot.file);
  const src = slotPreview(slot, objectUrl);
  return (
    <div className="relative aspect-square overflow-hidden rounded-[var(--radius-sm)] bg-muted">
      {src ? (
        <Image
          src={src}
          alt={`Gallery ${index + 1}`}
          fill
          className="object-cover"
          sizes="120px"
          unoptimized={isRemoteSrc(src) || Boolean(slot.file)}
        />
      ) : null}
      <div className="absolute inset-x-1 top-1 flex justify-between gap-1">
        <button
          type="button"
          className="rounded bg-black/60 px-1.5 text-[10px] font-medium text-white disabled:opacity-40"
          disabled={index === 0}
          onClick={() => onMove(-1)}
          aria-label={`Move gallery image ${index + 1} earlier`}
        >
          ←
        </button>
        <button
          type="button"
          className="rounded bg-black/60 px-1.5 text-[10px] font-medium text-white disabled:opacity-40"
          disabled={index === total - 1}
          onClick={() => onMove(1)}
          aria-label={`Move gallery image ${index + 1} later`}
        >
          →
        </button>
      </div>
      <button
        type="button"
        className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 text-[10px] font-medium text-white"
        onClick={onRemove}
      >
        Remove
      </button>
    </div>
  );
}

export function ProductGalleryMediaField({
  slots,
  onChange,
}: {
  slots: ProductMediaSlot[];
  onChange: (slots: ProductMediaSlot[]) => void;
}) {
  const inputId = useId();
  const [pickerOpen, setPickerOpen] = useState(false);

  function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const next = [...slots];
    for (const file of Array.from(files)) {
      next.push({ file });
    }
    onChange(next);
  }

  function addFromGallery(assets: AdminMediaAsset[]) {
    const existingIds = new Set(slots.map((s) => s.mediaId).filter(Boolean));
    const next = [...slots];
    for (const asset of assets) {
      if (existingIds.has(asset.id)) continue;
      next.push({ url: asset.url, mediaId: asset.id });
    }
    onChange(next);
  }

  return (
    <Field label="Gallery images" htmlFor={inputId}>
      <div className="space-y-3">
        {slots.length === 0 ? (
          <p className="text-sm text-muted-foreground">No gallery images yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {slots.map((slot, index) => (
              <GalleryThumb
                key={`${slot.mediaId ?? slot.url ?? slot.file?.name ?? "slot"}-${index}`}
                slot={slot}
                index={index}
                total={slots.length}
                onRemove={() => onChange(slots.filter((_, i) => i !== index))}
                onMove={(direction) => {
                  const nextIndex = index + direction;
                  if (nextIndex < 0 || nextIndex >= slots.length) return;
                  const next = [...slots];
                  const [moved] = next.splice(index, 1);
                  if (!moved) return;
                  next.splice(nextIndex, 0, moved);
                  onChange(next);
                }}
              />
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex h-10 cursor-pointer items-center rounded-[var(--radius-sm)] border border-border bg-surface px-3 text-sm font-medium hover:bg-muted">
            Upload images
            <input
              id={inputId}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          <Button type="button" variant="secondary" size="sm" onClick={() => setPickerOpen(true)}>
            From Gallery
          </Button>
        </div>
      </div>
      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        mediaType="image"
        multiple
        title="Select gallery images"
        onSelect={addFromGallery}
      />
    </Field>
  );
}
