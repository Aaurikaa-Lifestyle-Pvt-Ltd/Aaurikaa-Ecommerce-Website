import type { CartItem } from "@/types/cart";

export type GuestCartAddLine = {
  productId: string;
  quantity: number;
  options?: Record<string, string>;
};

function optionsFromVariantKey(
  variantKey?: string | null,
): Record<string, string> | undefined {
  if (!variantKey) return undefined;
  const options: Record<string, string> = {};
  for (const part of variantKey.split("|")) {
    const trimmed = part.trim();
    const idx = trimmed.indexOf(":");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (key && value) options[key] = value;
  }
  return Object.keys(options).length > 0 ? options : undefined;
}

/**
 * Lines (or quantity deltas) added while browsing as a guest after logout.
 * When `baseline` is null (never logged in this session), the full bag is merged.
 */
export function guestLinesAddedSince(
  baseline: CartItem[] | null,
  current: CartItem[],
): CartItem[] {
  if (!baseline) return current;
  const baseQty = new Map(baseline.map((line) => [line.id, line.quantity]));
  const deltas: CartItem[] = [];
  for (const line of current) {
    const previous = baseQty.get(line.id) ?? 0;
    const delta = line.quantity - previous;
    if (delta > 0) {
      deltas.push({ ...line, quantity: delta });
    }
  }
  return deltas;
}

/**
 * Maps guest localStorage bag lines into POST /api/shopper/cart/add payloads.
 * Best-effort: lines without a product id are skipped.
 */
export function guestLinesToCartAdds(lines: CartItem[]): GuestCartAddLine[] {
  const adds: GuestCartAddLine[] = [];
  for (const line of lines) {
    const productId = line.productId?.trim();
    if (!productId) continue;
    const quantity = Math.max(1, Math.floor(Number(line.quantity) || 1));
    const options =
      line.options && Object.keys(line.options).length > 0
        ? line.options
        : optionsFromVariantKey(line.variantId);
    adds.push({
      productId,
      quantity,
      ...(options && Object.keys(options).length > 0 ? { options } : {}),
    });
  }
  return adds;
}
