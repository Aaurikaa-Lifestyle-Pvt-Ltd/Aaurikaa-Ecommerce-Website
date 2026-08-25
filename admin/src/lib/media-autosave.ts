import type { ProductMediaSlot } from "./mappers/product-write.ts";

/**
 * Snapshot of media selection for autosave dirty-checking.
 * Local File uploads have no `url` yet — without this signature, JSON.stringify of the
 * autosave body is unchanged and useAutoSave skips the save entirely.
 */
export function buildMediaAutosaveSignature(
  mainImage?: ProductMediaSlot,
  gallerySlots: ProductMediaSlot[] = [],
  video?: ProductMediaSlot,
): string {
  const part = (slot: ProductMediaSlot | undefined, index: number): string => {
    if (!slot) return `${index}:`;
    if (slot.file) {
      return `${index}:file:${slot.file.name}:${slot.file.size}:${slot.file.lastModified}`;
    }
    return `${index}:url:${slot.url ?? ""}:id:${slot.mediaId ?? ""}`;
  };
  return [
    part(mainImage, 0),
    part(video, 1),
    ...gallerySlots.map((slot, i) => part(slot, i + 2)),
  ].join("|");
}
