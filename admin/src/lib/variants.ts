/**
 * Client-side helpers mirroring backend/utils/variantUtils combination keys.
 * Keep in sync with normalizeVariantCombination / generateVariantCombinations.
 */

export type VariantAxis = { type: string; values: string[] };

export function normalizeVariantKey(combination: Record<string, string>): string | null {
  const keys = Object.keys(combination);
  if (keys.length === 0) return null;
  const parts = keys
    .sort()
    .map((key) => {
      const value = combination[key];
      if (value == null) return null;
      return `${String(key).toLowerCase().trim()}:${String(value).toLowerCase().trim()}`;
    })
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join("|") : null;
}

export function generateVariantCombinations(axes: VariantAxis[]): Record<string, string>[] {
  const valid = axes.filter((v) => v.type.trim() && v.values.some((val) => val.trim()));
  if (valid.length === 0) return [];

  const normalized = valid.map((v) => ({
    type: v.type.trim(),
    values: v.values
      .map((val) => {
        const raw = String(val).trim();
        return raw.includes("|") ? raw.split("|")[0].trim() : raw;
      })
      .filter(Boolean),
  }));

  if (normalized.some((v) => v.values.length === 0)) return [];

  let combos: Record<string, string>[] = [{}];
  for (const axis of normalized) {
    const next: Record<string, string>[] = [];
    for (const combo of combos) {
      for (const value of axis.values) {
        next.push({ ...combo, [axis.type]: value });
      }
    }
    combos = next;
  }
  return combos;
}

export function variantTitle(combination: Record<string, string>): string {
  return Object.keys(combination)
    .sort()
    .map((k) => `${k}: ${combination[k]}`)
    .join(" / ");
}
