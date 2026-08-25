"use client";

import Image from "next/image";
import { useState } from "react";
import { MediaPicker } from "@/components/media-picker";
import { Button, Field, Input } from "@/components/ui";
import { isRemoteSrc } from "@/lib/mappers/media";
import type { AdminMediaAsset } from "@/types/admin";

export type CmsMediaRef = {
  mediaId?: string;
  url?: string;
  alt?: string;
  caption?: string;
};

type CmsMediaFieldProps = {
  label?: string;
  value: CmsMediaRef;
  onChange: (value: CmsMediaRef) => void;
  allowCaption?: boolean;
  description?: string;
};

function normalizeRef(asset: AdminMediaAsset, previous: CmsMediaRef): CmsMediaRef {
  return {
    mediaId: asset.id,
    url: asset.url,
    alt: previous.alt?.trim() || asset.altText || asset.displayName || "",
    ...(previous.caption != null ? { caption: previous.caption } : {}),
  };
}

/**
 * Single-image MediaPicker field for CMS media refs ({ mediaId, url, alt, caption? }).
 */
export function CmsMediaField({
  label = "Image",
  value,
  onChange,
  allowCaption = false,
  description,
}: CmsMediaFieldProps) {
  const [open, setOpen] = useState(false);
  const url = String(value.url ?? "").trim();

  return (
    <div className="space-y-3">
      <Field label={label}>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
            {url ? "Change image" : "Choose from gallery"}
          </Button>
          {url ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                onChange({
                  mediaId: "",
                  url: "",
                  alt: "",
                  ...(allowCaption ? { caption: "" } : {}),
                })
              }
            >
              Clear
            </Button>
          ) : null}
        </div>
        {description ? (
          <p className="mt-1.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </Field>

      {url ? (
        <div className="relative aspect-[16/10] max-w-md overflow-hidden rounded-[var(--radius-sm)] border border-border bg-muted/30">
          <Image
            src={url}
            alt={value.alt || "Selected media"}
            fill
            className="object-cover"
            unoptimized={isRemoteSrc(url)}
            sizes="(max-width: 768px) 100vw, 28rem"
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No image selected.</p>
      )}

      <Field label="Alt text">
        <Input
          value={value.alt ?? ""}
          onChange={(e) => onChange({ ...value, alt: e.target.value })}
          placeholder="Describe the image for accessibility"
        />
      </Field>

      {allowCaption ? (
        <Field label="Caption (optional)">
          <Input
            value={value.caption ?? ""}
            onChange={(e) => onChange({ ...value, caption: e.target.value })}
          />
        </Field>
      ) : null}

      <MediaPicker
        open={open}
        onClose={() => setOpen(false)}
        mediaType="image"
        multiple={false}
        title="Select page image"
        onSelect={(assets) => {
          const asset = assets[0];
          if (!asset) return;
          onChange(normalizeRef(asset, value));
        }}
      />
    </div>
  );
}
