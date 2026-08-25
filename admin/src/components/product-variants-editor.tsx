"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { MediaPicker } from "@/components/media-picker";
import { isRemoteSrc } from "@/lib/mappers/media";
import {
  generateVariantCombinations,
  normalizeVariantKey,
  variantTitle,
  type VariantAxis,
} from "@/lib/variants";
import type { AdminMediaAsset } from "@/types/admin";

export type VariantEditorState = {
  axes: VariantAxis[];
  pricing: Record<string, { price?: number; salePrice?: number }>;
  stock: Record<string, number>;
  sku: Record<string, string>;
  media: Record<string, { mainImage?: string; galleryImages?: string[]; video?: string }>;
  mediaFiles: Record<
    string,
    { mainImage?: File | null; video?: File | null; galleryImages?: File[] }
  >;
};

type PickerTarget =
  | { key: string; slot: "mainImage" }
  | { key: string; slot: "video" }
  | { key: string; slot: "gallery" };

function VariantMediaPreview({
  file,
  url,
  kind = "image",
}: {
  file?: File | null;
  url?: string;
  kind?: "image" | "video";
}) {
  const [objectUrl, setObjectUrl] = useState("");
  useEffect(() => {
    if (!file) {
      setObjectUrl("");
      return;
    }
    const next = URL.createObjectURL(file);
    setObjectUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  const preview = file ? objectUrl : url || "";
  if (!preview) return null;
  if (kind === "video" || file?.type.startsWith("video/")) {
    return (
      <video
        src={preview}
        className="h-12 w-20 rounded bg-muted object-cover"
        controls
        preload="metadata"
      />
    );
  }
  return (
    <div className="relative h-12 w-12 overflow-hidden rounded bg-muted">
      <Image
        src={preview}
        alt=""
        fill
        className="object-cover"
        sizes="48px"
        unoptimized={isRemoteSrc(preview) || Boolean(file)}
      />
    </div>
  );
}

export function ProductVariantsEditor({
  value,
  onChange,
  baseSku,
}: {
  value: VariantEditorState;
  onChange: (next: VariantEditorState) => void;
  baseSku: string;
}) {
  const combinations = useMemo(
    () => generateVariantCombinations(value.axes),
    [value.axes],
  );
  const [picker, setPicker] = useState<PickerTarget | null>(null);

  function updateAxis(index: number, patch: Partial<VariantAxis>) {
    const axes = value.axes.map((axis, i) => (i === index ? { ...axis, ...patch } : axis));
    onChange({ ...value, axes });
  }

  function addAxis() {
    onChange({
      ...value,
      axes: [...value.axes, { type: "", values: [""] }],
    });
  }

  function removeAxis(index: number) {
    onChange({
      ...value,
      axes: value.axes.filter((_, i) => i !== index),
    });
  }

  function setComboField(
    key: string,
    field: "sku" | "stock" | "price" | "salePrice",
    raw: string,
  ) {
    if (field === "sku") {
      onChange({ ...value, sku: { ...value.sku, [key]: raw } });
      return;
    }
    if (field === "stock") {
      onChange({
        ...value,
        stock: { ...value.stock, [key]: Number(raw) || 0 },
      });
      return;
    }
    const current = value.pricing[key] ?? {};
    onChange({
      ...value,
      pricing: {
        ...value.pricing,
        [key]: {
          ...current,
          [field]: raw === "" ? undefined : Number(raw) || 0,
        },
      },
    });
  }

  function patchMedia(
    key: string,
    mediaPatch: Partial<{ mainImage?: string; galleryImages?: string[]; video?: string }>,
    filesPatch?: Partial<{ mainImage?: File | null; video?: File | null; galleryImages?: File[] }>,
  ) {
    onChange({
      ...value,
      media: {
        ...value.media,
        [key]: { ...(value.media[key] ?? {}), ...mediaPatch },
      },
      mediaFiles: {
        ...value.mediaFiles,
        [key]: { ...(value.mediaFiles[key] ?? {}), ...(filesPatch ?? {}) },
      },
    });
  }

  function removeGalleryUrl(key: string, index: number) {
    const current = value.media[key]?.galleryImages ?? [];
    patchMedia(key, {
      galleryImages: current.filter((_, i) => i !== index),
    });
  }

  function removeGalleryFile(key: string, index: number) {
    const current = value.mediaFiles[key]?.galleryImages ?? [];
    patchMedia(key, {}, {
      galleryImages: current.filter((_, i) => i !== index),
    });
  }

  function applyPickerSelection(assets: AdminMediaAsset[]) {
    if (!picker || assets.length === 0) return;
    const { key, slot } = picker;
    if (slot === "mainImage") {
      const asset = assets[0];
      if (!asset) return;
      patchMedia(key, { mainImage: asset.url }, { mainImage: null });
      return;
    }
    if (slot === "video") {
      const asset = assets[0];
      if (!asset) return;
      patchMedia(key, { video: asset.url }, { video: null });
      return;
    }
    const existing = new Set(value.media[key]?.galleryImages ?? []);
    const next = [...(value.media[key]?.galleryImages ?? [])];
    for (const asset of assets) {
      if (existing.has(asset.url)) continue;
      next.push(asset.url);
    }
    patchMedia(key, { galleryImages: next });
  }

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="space-y-3">
        {value.axes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No options yet. Add options such as Colour, Size, or Metal.
          </p>
        ) : (
          value.axes.map((axis, index) => (
            <div
              key={`axis-${index}`}
              className="grid gap-3 rounded-[var(--radius-sm)] border border-border p-3 sm:grid-cols-[1fr_2fr_auto]"
            >
              <Field label="Option name" htmlFor={`axis-type-${index}`}>
                <Input
                  id={`axis-type-${index}`}
                  value={axis.type}
                  placeholder="e.g. Colour"
                  onChange={(e) => updateAxis(index, { type: e.target.value })}
                />
              </Field>
              <Field label="Values (comma-separated)" htmlFor={`axis-values-${index}`}>
                <Input
                  id={`axis-values-${index}`}
                  value={axis.values.join(", ")}
                  placeholder="Gold, Silver"
                  onChange={(e) =>
                    updateAxis(index, {
                      values: e.target.value
                        .split(",")
                        .map((v) => v.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </Field>
              <div className="flex items-end">
                <Button type="button" variant="ghost" size="sm" onClick={() => removeAxis(index)}>
                  Remove
                </Button>
              </div>
            </div>
          ))
        )}
        <Button type="button" variant="secondary" size="sm" onClick={addAxis}>
          Add option
        </Button>
      </div>

      {combinations.length > 0 ? (
        <div className="space-y-4">
          {combinations.map((combo) => {
            const key = normalizeVariantKey(combo);
            if (!key) return null;
            const pricing = value.pricing[key] ?? {};
            const media = value.media[key];
            const files = value.mediaFiles[key];
            const galleryUrls = media?.galleryImages ?? [];
            const galleryFiles = files?.galleryImages ?? [];

            return (
              <div
                key={key}
                className="rounded-[var(--radius-sm)] border border-border p-3 sm:p-4"
              >
                <p className="font-medium text-foreground">{variantTitle(combo)}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="SKU" htmlFor={`sku-${key}`}>
                    <Input
                      id={`sku-${key}`}
                      value={value.sku[key] ?? ""}
                      placeholder={baseSku ? `${baseSku}-…` : "Variant SKU"}
                      onChange={(e) => setComboField(key, "sku", e.target.value)}
                    />
                  </Field>
                  <Field label="List price" htmlFor={`price-${key}`}>
                    <Input
                      id={`price-${key}`}
                      type="number"
                      value={pricing.price ?? ""}
                      onChange={(e) => setComboField(key, "price", e.target.value)}
                    />
                  </Field>
                  <Field label="Sale price" htmlFor={`sale-${key}`}>
                    <Input
                      id={`sale-${key}`}
                      type="number"
                      value={pricing.salePrice ?? ""}
                      onChange={(e) => setComboField(key, "salePrice", e.target.value)}
                    />
                  </Field>
                  <Field label="Stock" htmlFor={`stock-${key}`}>
                    <Input
                      id={`stock-${key}`}
                      type="number"
                      value={value.stock[key] ?? 0}
                      onChange={(e) => setComboField(key, "stock", e.target.value)}
                    />
                  </Field>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Main image
                    </p>
                    <VariantMediaPreview file={files?.mainImage} url={media?.mainImage} />
                    <div className="flex flex-wrap gap-1">
                      <label className="inline-flex h-8 cursor-pointer items-center rounded border border-border px-2 text-xs font-medium hover:bg-muted">
                        Upload
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          onChange={(e) => {
                            const nextFile = e.target.files?.[0] ?? null;
                            patchMedia(key, {}, { mainImage: nextFile });
                            e.target.value = "";
                          }}
                        />
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs"
                        onClick={() => setPicker({ key, slot: "mainImage" })}
                      >
                        Gallery
                      </Button>
                      {media?.mainImage || files?.mainImage ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs"
                          onClick={() =>
                            patchMedia(key, { mainImage: undefined }, { mainImage: null })
                          }
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Video
                    </p>
                    <VariantMediaPreview
                      file={files?.video}
                      url={media?.video}
                      kind="video"
                    />
                    <div className="flex flex-wrap gap-1">
                      <label className="inline-flex h-8 cursor-pointer items-center rounded border border-border px-2 text-xs font-medium hover:bg-muted">
                        Upload
                        <input
                          type="file"
                          accept="video/*"
                          className="sr-only"
                          onChange={(e) => {
                            const nextFile = e.target.files?.[0] ?? null;
                            patchMedia(key, {}, { video: nextFile });
                            e.target.value = "";
                          }}
                        />
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs"
                        onClick={() => setPicker({ key, slot: "video" })}
                      >
                        Gallery
                      </Button>
                      {media?.video || files?.video ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs"
                          onClick={() =>
                            patchMedia(key, { video: undefined }, { video: null })
                          }
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Gallery images
                    </p>
                    {galleryUrls.length === 0 && galleryFiles.length === 0 ? (
                      <p className="text-xs text-muted-foreground">None yet.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {galleryUrls.map((url, index) => (
                          <div key={`g-url-${key}-${index}`} className="relative">
                            <VariantMediaPreview url={url} />
                            <button
                              type="button"
                              className="absolute -right-1 -top-1 rounded bg-black/70 px-1 text-[10px] text-white"
                              onClick={() => removeGalleryUrl(key, index)}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        {galleryFiles.map((file, index) => (
                          <div key={`g-file-${key}-${index}`} className="relative">
                            <VariantMediaPreview file={file} />
                            <button
                              type="button"
                              className="absolute -right-1 -top-1 rounded bg-black/70 px-1 text-[10px] text-white"
                              onClick={() => removeGalleryFile(key, index)}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1">
                      <label className="inline-flex h-8 cursor-pointer items-center rounded border border-border px-2 text-xs font-medium hover:bg-muted">
                        Upload
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="sr-only"
                          onChange={(e) => {
                            const picked = Array.from(e.target.files ?? []);
                            if (picked.length === 0) return;
                            patchMedia(
                              key,
                              {},
                              {
                                galleryImages: [
                                  ...(value.mediaFiles[key]?.galleryImages ?? []),
                                  ...picked,
                                ],
                              },
                            );
                            e.target.value = "";
                          }}
                        />
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs"
                        onClick={() => setPicker({ key, slot: "gallery" })}
                      >
                        Gallery
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <MediaPicker
        open={Boolean(picker)}
        onClose={() => setPicker(null)}
        mediaType={picker?.slot === "video" ? "video" : "image"}
        multiple={picker?.slot === "gallery"}
        title={
          picker?.slot === "video"
            ? "Select variant video"
            : picker?.slot === "gallery"
              ? "Select variant gallery images"
              : "Select variant image"
        }
        onSelect={(assets) => {
          applyPickerSelection(assets);
          setPicker(null);
        }}
      />
    </div>
  );
}
