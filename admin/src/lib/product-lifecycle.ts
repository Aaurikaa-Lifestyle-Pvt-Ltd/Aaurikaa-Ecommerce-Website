import type { ProductStatus } from "../types/admin.ts";

export type ProductLifecycleAction = "save" | "publish" | "unpublish";

/** Operator-facing label (Admin ProductStatus already uses Published). */
export function productLifecycleLabel(status: ProductStatus): string {
  return status;
}

export function isPublishedProductStatus(status: ProductStatus): boolean {
  return status === "Published";
}

export function isDraftProductStatus(status: ProductStatus): boolean {
  return status === "Draft";
}

/**
 * Backend `status` string for product write.
 * Save never demotes published → draft; publish/unpublish are explicit.
 */
export function resolveLifecycleWriteStatus(
  current: ProductStatus,
  action: ProductLifecycleAction,
): "draft" | "published" {
  if (action === "publish") return "published";
  if (action === "unpublish") return "draft";
  if (current === "Published") return "published";
  return "draft";
}

/** Client-side gate before publish (backend also requires weightClass). */
export function requireWeightClassForPublish(weightClassId: string): string | null {
  if (!String(weightClassId || "").trim()) {
    return "Select a shipping slab before publishing. Checkout uses this slab.";
  }
  return null;
}
