import { hasMeaningfulRichText } from "../rich-text/rich-text-utils.ts";

export function mapProductPrices(
  regularPrice?: number,
  salePrice?: number,
): {
  price: { amount: number; currency: string };
  compareAtPrice?: { amount: number; currency: string };
} {
  const regular = Number(regularPrice) || 0;
  const sale = Number(salePrice) || 0;
  const money = (amount: number) => ({ amount: Number.isFinite(amount) ? amount : 0, currency: "INR" });
  if (sale > 0 && regular > 0 && sale < regular) {
    return { price: money(sale), compareAtPrice: money(regular) };
  }
  const amount = sale > 0 ? sale : regular;
  return { price: money(amount) };
}

export function normalizeVariantKey(options: Record<string, string>): string | null {
  const keys = Object.keys(options);
  if (keys.length === 0) return null;
  const parts = keys
    .sort()
    .map((key) => {
      const value = options[key];
      if (value == null) return null;
      return `${String(key).toLowerCase().trim()}:${String(value).toLowerCase().trim()}`;
    })
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join("|") : null;
}

export function combinationFromVariantKey(
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
 * Expand variant axes into combinations.
 * Color values may arrive as "label|hex" from the API; stock/pricing keys use the
 * label only (same as backend generateVariantCombinations / Admin variants.ts).
 */
export function cartesianVariantOptions(
  axes: Array<{ type?: string; values?: string[] }>,
): Record<string, string>[] {
  return axes.reduce<Record<string, string>[]>((acc, axis) => {
    const type = String(axis.type ?? "").trim();
    const values = (axis.values ?? [])
      .map((v) => {
        const raw = String(v).trim();
        if (!raw) return "";
        return raw.includes("|") ? raw.split("|")[0].trim() : raw;
      })
      .filter(Boolean);
    if (!type || values.length === 0) return acc;
    if (acc.length === 0) {
      return values.map((value) => ({ [type]: value }));
    }
    return acc.flatMap((combo) => values.map((value) => ({ ...combo, [type]: value })));
  }, []);
}

export function stripSellerFields<T extends Record<string, unknown>>(
  raw: T,
): Omit<T, "seller" | "sellerShop"> {
  const rest = { ...raw };
  delete rest.seller;
  delete rest.sellerShop;
  return rest as Omit<T, "seller" | "sellerShop">;
}

function nonEmptyText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

/** Narrative TipTap/plain string when it has visible text; empty TipTap docs excluded. */
function meaningfulRichText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!hasMeaningfulRichText(value)) return undefined;
  return value.trim() || undefined;
}

export function mapProductBrandName(
  brand: { name?: string; slug?: string } | string | null | undefined,
): string | undefined {
  if (!brand) return undefined;
  if (typeof brand === "string") {
    const name = brand.trim();
    return name || undefined;
  }
  return nonEmptyText(brand.name);
}

export function formatProductFeaturesList(
  features:
    | Array<{ key?: string; value?: string; code?: string; values?: string[] }>
    | null
    | undefined,
  options?: { excludeCodes?: string[] },
): string | undefined {
  if (!Array.isArray(features) || features.length === 0) return undefined;
  const exclude = new Set(
    (options?.excludeCodes ?? []).map((c) => c.trim()).filter(Boolean),
  );
  const lines = features
    .map((row) => {
      const code = String(row?.code ?? "").trim();
      if (code && exclude.has(code)) return null;
      const key = String(row?.key ?? "").trim();
      const multi = Array.isArray(row?.values)
        ? row.values.map((v) => String(v).trim()).filter(Boolean)
        : [];
      const values =
        multi.length > 0
          ? multi
          : [String(row?.value ?? "").trim()].filter(Boolean);
      if (!key || values.length === 0) return null;
      return `${key}: ${values.join(", ")}`;
    })
    .filter((line): line is string => Boolean(line));
  return lines.length > 0 ? lines.join("\n") : undefined;
}

const MATERIAL_FEATURE_CODE = "material.material";
const NET_QUANTITY_FEATURE_CODE = "physical-properties.quantity";

function featureValueByCode(
  features:
    | Array<{ key?: string; value?: string; code?: string; values?: string[] }>
    | null
    | undefined,
  code: string,
  fallbackKey?: string,
): string | undefined {
  if (!Array.isArray(features)) return undefined;
  const byCode = features.find((row) => String(row?.code ?? "").trim() === code);
  if (byCode) {
    const multi = Array.isArray(byCode.values)
      ? byCode.values.map((v) => String(v).trim()).filter(Boolean)
      : [];
    if (multi.length > 0) return multi.join(", ");
    const value = String(byCode.value ?? "").trim();
    if (value) return value;
  }
  if (fallbackKey) {
    const byKey = features.find(
      (row) =>
        !String(row?.code ?? "").trim() &&
        String(row?.key ?? "").trim().toLowerCase() === fallbackKey.toLowerCase(),
    );
    if (byKey) {
      const value = String(byKey.value ?? "").trim();
      if (value) return value;
    }
  }
  return undefined;
}

/** Positive finite only — backend often stores cleared dims/weight as 0. */
function positiveMeasure(value?: number): number | undefined {
  if (value == null) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

/** Admin stores weight in grams — display with an explicit unit. */
export function formatWeightGrams(value: number): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "";
  // Keep compact decimals (4.5 → "4.5 g", 12 → "12 g")
  const formatted = Number.isInteger(n) ? String(n) : String(n);
  return `${formatted} g`;
}

/**
 * Merge Admin main image + gallery for PDP display.
 * Prepends main (Admin separates main from gallery), preserves gallery order,
 * and drops duplicate URLs.
 */
export function mergeProductGallerySources(
  mainImage: string | undefined | null,
  galleryImages: Array<string | undefined | null> | undefined | null,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string | undefined | null) => {
    const src = String(raw ?? "").trim();
    if (!src || seen.has(src)) return;
    seen.add(src);
    out.push(src);
  };
  push(mainImage);
  for (const entry of galleryImages ?? []) push(entry);
  return out;
}

function formatDimensionLine(
  length?: number,
  width?: number,
  height?: number,
): string | undefined {
  const parts: string[] = [];
  const l = positiveMeasure(length);
  const w = positiveMeasure(width);
  const h = positiveMeasure(height);
  if (l != null) parts.push(`Length: ${l}`);
  if (w != null) parts.push(`Width: ${w}`);
  if (h != null) parts.push(`Height: ${h}`);
  return parts.length > 0 ? parts.join("\n") : undefined;
}

function formatAttributeLines(
  rows: Array<{ label: string; value?: string | null }>,
): string | undefined {
  const lines = rows
    .map((row) => {
      const value = String(row.value ?? "").trim();
      if (!value) return null;
      return `${row.label}: ${value}`;
    })
    .filter((line): line is string => Boolean(line));
  return lines.length > 0 ? lines.join("\n") : undefined;
}

export function mapProductDetailSections(input: {
  sku?: string;
  description?: string;
  length?: number;
  width?: number;
  height?: number;
  weight?: number;
  featuresContent?: string;
  usageSafetyContent?: string;
  usageInstructions?: Array<{ title?: string; instruction?: string }> | null;
  manufacturerConditions?: {
    summary?: string;
    details?: string;
    countryOfOrigin?: string;
    marketedBy?: string;
    grievanceRedressal?: string;
  } | null;
  occasions?: Array<{ name?: string; slug?: string }> | null;
  features?: Array<{ key?: string; value?: string; code?: string; values?: string[] }>;
}): Array<{ id: string; title: string; content?: string; richContents?: string[] }> | undefined {
  const sections: Array<{
    id: string;
    title: string;
    content?: string;
    richContents?: string[];
  }> = [];

  const material = featureValueByCode(input.features, MATERIAL_FEATURE_CODE, "Material");
  const netQuantity = featureValueByCode(
    input.features,
    NET_QUANTITY_FEATURE_CODE,
    "Net Quantity",
  );
  const occasionNames = Array.isArray(input.occasions)
    ? input.occasions
        .map((o) => String(o?.name ?? "").trim())
        .filter(Boolean)
        .join(", ")
    : "";
  const dimensions = formatDimensionLine(input.length, input.width, input.height);
  const weightMeasure = positiveMeasure(input.weight);
  const weight =
    weightMeasure != null ? formatWeightGrams(weightMeasure) : undefined;

  const detailAttrs = formatAttributeLines([
    { label: "SKU", value: input.sku },
    { label: "Occasion", value: occasionNames },
    { label: "Material", value: material },
    { label: "Net Weight", value: weight },
    { label: "Net Quantity", value: netQuantity },
  ]);
  const description = meaningfulRichText(input.description);
  const productDetailsPlain = [detailAttrs, dimensions].filter(Boolean).join("\n\n") || undefined;
  if (productDetailsPlain || description) {
    sections.push({
      id: "product-details",
      title: "Product Details",
      ...(productDetailsPlain ? { content: productDetailsPlain } : {}),
      ...(description ? { richContents: [description] } : {}),
    });
  }

  const careLabel = meaningfulRichText(input.usageSafetyContent);
  const careRows = Array.isArray(input.usageInstructions)
    ? input.usageInstructions
        .map((row) => {
          const title = String(row?.title ?? "").trim();
          const instruction = String(row?.instruction ?? "").trim();
          if (!title || !instruction) return null;
          return `${title}: ${instruction}`;
        })
        .filter((line): line is string => Boolean(line))
    : [];
  const carePlain = careRows.length > 0 ? careRows.join("\n") : undefined;
  if (careLabel || carePlain) {
    sections.push({
      id: "care",
      title: "Care",
      ...(carePlain ? { content: carePlain } : {}),
      ...(careLabel ? { richContents: [careLabel] } : {}),
    });
  }

  const mfr = input.manufacturerConditions;
  if (mfr && typeof mfr === "object") {
    const manufacturerPlain = formatAttributeLines([
      { label: "Country of Origin", value: mfr.countryOfOrigin },
      { label: "Marketed By", value: mfr.marketedBy },
      { label: "Grievance Redressal", value: mfr.grievanceRedressal },
    ]);
    const manufacturerDetails = meaningfulRichText(mfr.details);
    if (manufacturerPlain || manufacturerDetails) {
      sections.push({
        id: "manufacturer",
        title: "Manufacturer Details",
        ...(manufacturerPlain ? { content: manufacturerPlain } : {}),
        ...(manufacturerDetails ? { richContents: [manufacturerDetails] } : {}),
      });
    }
  }

  const featuresNarrative = meaningfulRichText(input.featuresContent);
  const featuresFromList = formatProductFeaturesList(input.features, {
    excludeCodes: [MATERIAL_FEATURE_CODE, NET_QUANTITY_FEATURE_CODE],
  });
  if (featuresNarrative || featuresFromList) {
    sections.push({
      id: "features",
      title: "Key Features",
      ...(featuresFromList ? { content: featuresFromList } : {}),
      ...(featuresNarrative ? { richContents: [featuresNarrative] } : {}),
    });
  }

  return sections.length > 0 ? sections : undefined;
}

export function mapProductFaqs(
  qandas: Array<{ question?: string; answer?: string }> | null | undefined,
): Array<{ question: string; answer: string }> | undefined {
  if (!Array.isArray(qandas) || qandas.length === 0) return undefined;
  const faqs = qandas
    .map((row) => {
      const question = String(row?.question ?? "").trim();
      const answer = String(row?.answer ?? "").trim();
      if (!question || !answer) return null;
      return { question, answer };
    })
    .filter((item): item is { question: string; answer: string } => Boolean(item));
  return faqs.length > 0 ? faqs : undefined;
}

export function mapProductSeo(input: {
  metaTitle?: string;
  metaDescription?: string;
}): { seoTitle?: string; seoDescription?: string } {
  return {
    seoTitle: nonEmptyText(input.metaTitle),
    seoDescription: nonEmptyText(input.metaDescription),
  };
}

function labelOnlyVariantValue(value: string): string {
  const raw = String(value).trim();
  return raw.includes("|") ? raw.split("|")[0].trim() : raw;
}

export function toCartAddPayload(input: {
  productId: string;
  quantity: number;
  options?: Record<string, string>;
}): { productId: string; quantity: number; variantCombination?: Record<string, string> } {
  const payload: {
    productId: string;
    quantity: number;
    variantCombination?: Record<string, string>;
  } = {
    productId: input.productId,
    quantity: Math.max(1, input.quantity),
  };
  if (input.options && Object.keys(input.options).length > 0) {
    const variantCombination: Record<string, string> = {};
    for (const [key, value] of Object.entries(input.options)) {
      const label = labelOnlyVariantValue(value);
      if (label) variantCombination[key] = label;
    }
    if (Object.keys(variantCombination).length > 0) {
      payload.variantCombination = variantCombination;
    }
  }
  return payload;
}
