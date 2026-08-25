/**
 * Admin tax input helpers.
 * Distinguishes Inherit/unset from explicit 0%. Blank Override must not become 0.
 */

export type TaxModeInherit = "inherit" | "override";
export type ProductGstMode = "category" | "override";

export type TaxParseOk<T> = { ok: true; value: T };
export type TaxParseErr = { ok: false; error: string };
export type TaxParseResult<T> = TaxParseOk<T> | TaxParseErr;

/** Parse Override field: blank → error; "0" → 0; valid 0–100 → number. */
export function parseRequiredTaxOverride(raw: string): TaxParseResult<number> {
  const trimmed = String(raw ?? "").trim();
  if (trimmed === "") {
    return { ok: false, error: "Tax rate is required when a custom rate is selected." };
  }
  const num = Number(trimmed);
  if (!Number.isFinite(num)) {
    return { ok: false, error: "Enter a valid tax rate between 0 and 100." };
  }
  if (num < 0 || num > 100) {
    return { ok: false, error: "Tax rate must be between 0 and 100." };
  }
  return { ok: true, value: num };
}

/**
 * Sub/Child taxonomy write:
 * - inherit → null (unset; never 0)
 * - override + blank → error
 * - override + 0 → explicit 0
 */
export function resolveTaxonomyTaxWrite(
  mode: TaxModeInherit,
  overrideRaw: string,
): TaxParseResult<number | null> {
  if (mode === "inherit") {
    return { ok: true, value: null };
  }
  const parsed = parseRequiredTaxOverride(overrideRaw);
  if (!parsed.ok) return parsed;
  return { ok: true, value: parsed.value };
}

/**
 * Product GST write:
 * - category → 0 (existing fallback contract)
 * - override + blank → error
 * - override + number including 0 → that number (0 still means category fallback in gstEngine)
 */
export function resolveProductTaxWrite(
  mode: ProductGstMode,
  overrideRaw: string,
): TaxParseResult<number> {
  if (mode === "category") {
    return { ok: true, value: 0 };
  }
  return parseRequiredTaxOverride(overrideRaw);
}
