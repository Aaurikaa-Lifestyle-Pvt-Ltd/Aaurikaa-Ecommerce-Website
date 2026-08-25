import type {
  AdminCategory,
  AdminCategoryHierarchyResult,
  AdminCategoryHierarchyRow,
  EntityStatus,
  TaxonomyTaxType,
} from "@/types/admin";
import { idString, resolveMediaUrl } from "./media";

function statusFromActive(isActive: unknown): EntityStatus {
  return isActive === false ? "Inactive" : "Active";
}

/** Map API taxRate; preserve explicit 0; treat null/undefined/NaN as unset. */
export function mapOptionalTaxRate(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return num;
}

const TAX_TYPES = new Set(["GST", "VAT", "NONE"]);

export function mapTaxonomyTaxType(value: unknown): TaxonomyTaxType | undefined {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!TAX_TYPES.has(raw)) return undefined;
  return raw as TaxonomyTaxType;
}

/** Preview URL slug from a display name (matches Category pre-save normalisation). */
export function previewTaxonomySlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function mapAdminCategory(raw: {
  _id?: unknown;
  name?: string;
  slug?: string;
  image?: string;
  productCount?: number;
  isActive?: boolean;
  title?: string;
  description?: string;
  taxRate?: unknown;
  taxType?: unknown;
} | null): AdminCategory | null {
  if (!raw) return null;
  const id = idString(raw._id);
  const name = String(raw.name ?? "").trim();
  if (!id || !name) return null;
  const slug = String(raw.slug ?? "").trim() || id;
  const taxRate = mapOptionalTaxRate(raw.taxRate);
  const taxType = mapTaxonomyTaxType(raw.taxType);
  return {
    id,
    name,
    slug,
    productCount: Number(raw.productCount) || 0,
    status: statusFromActive(raw.isActive),
    image: resolveMediaUrl(raw.image),
    title: String(raw.title ?? "").trim(),
    description: String(raw.description ?? "").trim(),
    ...(taxRate != null ? { taxRate } : {}),
    ...(taxType ? { taxType } : {}),
  };
}

export function mapAdminCategories(raw: unknown): AdminCategory[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => mapAdminCategory(item as Parameters<typeof mapAdminCategory>[0]))
    .filter((item): item is AdminCategory => Boolean(item));
}

type HierarchyRawRow = {
  catId?: unknown;
  category?: string;
  categorySlug?: string;
  image?: string;
  isActive?: boolean;
  categoryTax?: unknown;
  categoryTaxType?: unknown;
  subId?: unknown;
  subcategory?: string;
  subcategorySlug?: string;
  subImage?: string;
  subcategoryTax?: unknown;
  subcategoryTaxType?: unknown;
  childId?: unknown;
  child?: string;
  childSlug?: string;
  childImage?: string;
  childTax?: unknown;
  childTaxType?: unknown;
};

export function mapAdminCategoryHierarchyRow(raw: HierarchyRawRow | null): AdminCategoryHierarchyRow | null {
  if (!raw) return null;
  const catId = idString(raw.catId);
  const category = String(raw.category ?? "").trim();
  if (!catId || !category) return null;

  const subId = raw.subId != null ? idString(raw.subId) : "";
  const childId = raw.childId != null ? idString(raw.childId) : "";
  const subcategory = String(raw.subcategory ?? "—").trim() || "—";
  const child = String(raw.child ?? "—").trim() || "—";
  const categoryTaxRate = mapOptionalTaxRate(raw.categoryTax);
  const subcategoryTaxRate = mapOptionalTaxRate(raw.subcategoryTax);
  const childTaxRate = mapOptionalTaxRate(raw.childTax);
  const categoryTaxType = mapTaxonomyTaxType(raw.categoryTaxType) ?? "GST";
  const subcategoryTaxType = mapTaxonomyTaxType(raw.subcategoryTaxType);
  const childTaxType = mapTaxonomyTaxType(raw.childTaxType);
  const categorySlug = String(raw.categorySlug ?? "").trim();
  const subcategorySlug = String(raw.subcategorySlug ?? "").trim();
  const childSlug = String(raw.childSlug ?? "").trim();

  return {
    catId,
    category,
    ...(categorySlug ? { categorySlug } : {}),
    categoryImage: resolveMediaUrl(raw.image),
    status: statusFromActive(raw.isActive),
    ...(categoryTaxRate != null ? { categoryTaxRate } : {}),
    categoryTaxType,
    subId: subId || undefined,
    subcategory,
    ...(subId && subcategorySlug ? { subcategorySlug } : {}),
    subcategoryImage: subId ? resolveMediaUrl(raw.subImage) : undefined,
    ...(subId
      ? { subcategoryTaxRate: subcategoryTaxRate === undefined ? null : subcategoryTaxRate }
      : {}),
    ...(subId ? { subcategoryTaxType: subcategoryTaxType ?? "GST" } : {}),
    childId: childId || undefined,
    child,
    ...(childId && childSlug ? { childSlug } : {}),
    childImage: childId ? resolveMediaUrl(raw.childImage) : undefined,
    ...(childId
      ? { childTaxRate: childTaxRate === undefined ? null : childTaxRate }
      : {}),
    ...(childId ? { childTaxType: childTaxType ?? "GST" } : {}),
  };
}

export function mapAdminCategoryHierarchy(raw: {
  rows?: unknown;
  pagination?: { page?: number; limit?: number; total?: number; pages?: number };
} | null): AdminCategoryHierarchyResult {
  const rows = Array.isArray(raw?.rows)
    ? raw.rows
        .map((item) => mapAdminCategoryHierarchyRow(item as HierarchyRawRow))
        .filter((item): item is AdminCategoryHierarchyRow => Boolean(item))
    : [];

  const pagination = raw?.pagination ?? {};
  return {
    rows,
    pagination: {
      page: Number(pagination.page) || 1,
      limit: Number(pagination.limit) || 10,
      total: Number(pagination.total) || 0,
      pages: Math.max(1, Number(pagination.pages) || 1),
    },
  };
}

/** Format taxonomy tax for table: inherit vs explicit 0 vs rate. */
export function formatTaxonomyTaxLabel(rate: number | null | undefined, hasLevel: boolean): string {
  if (!hasLevel) return "—";
  if (rate === null || rate === undefined) return "Inherit";
  return `${rate}%`;
}
