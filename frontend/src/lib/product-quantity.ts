/**
 * UI-only quantity caps from catalogue stock fields already on the Product model.
 * Does not talk to inventory engines — backend remains authoritative at checkout.
 */

export function maxPurchasableQuantity(input: {
  hasVariants: boolean;
  selectedVariantStock?: number;
  productStock?: number;
}): number | undefined {
  if (input.hasVariants) {
    const n = Number(input.selectedVariantStock);
    if (!Number.isFinite(n) || n < 0) return undefined;
    return Math.floor(n);
  }
  const n = Number(input.productStock);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.floor(n);
}

/** Clamp a desired qty into [1, max] when max is known; otherwise [1, …]. */
export function clampPurchasableQuantity(
  quantity: number,
  max?: number,
): number {
  const next = Math.max(1, Math.floor(Number(quantity) || 1));
  if (max == null || !Number.isFinite(max)) return next;
  if (max < 1) return 1;
  return Math.min(next, Math.floor(max));
}
