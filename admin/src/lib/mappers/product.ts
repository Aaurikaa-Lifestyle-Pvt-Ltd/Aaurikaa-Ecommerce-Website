import type {
  AdminManufacturerConditions,
  AdminProduct,
  AdminProductFeature,
  AdminProductQanda,
  AdminProductUsageInstruction,
  AdminProductVariantAxis,
  ProductStatus,
} from "@/types/admin";
import { idString, resolveMediaUrl } from "./media";
import { generateVariantCombinations, normalizeVariantKey, variantTitle } from "../variants";

export type BackendAdminProduct = {
  _id?: unknown;
  name?: string;
  sku?: string;
  regularPrice?: number;
  salePrice?: number;
  stock?: number;
  status?: string;
  shortDesc?: string;
  longDesc?: string;
  mainImage?: string;
  mainImageId?: unknown;
  galleryImages?: string[];
  galleryImageIds?: unknown[];
  video?: string;
  videoId?: unknown;
  category?: { _id?: unknown; name?: string } | string;
  subcategory?: { _id?: unknown; name?: string } | string;
  childCategory?: { _id?: unknown; name?: string } | string;
  brand?: { _id?: unknown; name?: string } | string;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  primaryKeyword?: string;
  seo?: { primaryKeyword?: string };
  featuresContent?: string;
  usageSafetyContent?: string;
  usageInstructions?: Array<{ title?: string; instruction?: string }>;
  manufacturerConditions?: {
    summary?: string;
    details?: string;
    countryOfOrigin?: string;
    marketedBy?: string;
    grievanceRedressal?: string;
  };
  length?: number;
  width?: number;
  height?: number;
  weight?: number;
  features?: Array<{ key?: string; value?: string; code?: string; values?: string[] }>;
  qandas?: Array<{ question?: string; answer?: string }>;
  variants?: Array<{ type?: string; values?: string[] }>;
  variantPricing?: Record<string, { price?: number; salePrice?: number }>;
  variantStock?: Record<string, number>;
  variantSku?: Record<string, string>;
  variantMedia?: Record<
    string,
    { mainImage?: string; galleryImages?: string[]; video?: string }
  >;
  weightClass?: { _id?: unknown } | string;
  taxRate?: number;
  taxIncluded?: boolean | string;
  hsnCode?: string;
};

function refId(value: { _id?: unknown } | string | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  return idString(value._id);
}

export function mapProductStatus(status?: string): ProductStatus {
  if (status === "draft") return "Draft";
  if (status === "inactive") return "Inactive";
  if (status === "trash") return "Trash";
  if (status === "archived") return "Archived";
  // published (and unknown → treat as live catalogue)
  return "Published";
}

export function toBackendProductStatus(status: ProductStatus): string {
  if (status === "Draft") return "draft";
  if (status === "Inactive") return "inactive";
  if (status === "Trash") return "trash";
  if (status === "Archived") return "archived";
  // Published
  return "published";
}

function mapFeatures(raw: BackendAdminProduct["features"]): AdminProductFeature[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      const key = String(row?.key ?? "").trim();
      const value = String(row?.value ?? "").trim();
      if (!key || !value) return null;
      const feature: AdminProductFeature = { key, value };
      const code = String(row?.code ?? "").trim();
      if (code) feature.code = code;
      if (Array.isArray(row?.values) && row.values.length > 0) {
        feature.values = row.values.map((v) => String(v));
      }
      return feature;
    })
    .filter((item): item is AdminProductFeature => Boolean(item));
}

function mapVariantAxes(raw: BackendAdminProduct["variants"]): AdminProductVariantAxis[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((axis) => ({
      type: String(axis?.type ?? "").trim(),
      values: Array.isArray(axis?.values)
        ? axis.values.map((v) => String(v).trim()).filter(Boolean)
        : [],
    }))
    .filter((axis) => axis.type && axis.values.length > 0);
}

function mapQandas(raw: BackendAdminProduct["qandas"]): AdminProductQanda[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => ({
      question: String(row?.question ?? "").trim(),
      answer: String(row?.answer ?? "").trim(),
    }))
    .filter((row) => row.question || row.answer);
}

function mapUsageInstructions(
  raw: BackendAdminProduct["usageInstructions"],
): AdminProductUsageInstruction[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => ({
      title: String(row?.title ?? "").trim(),
      instruction: String(row?.instruction ?? "").trim(),
    }))
    .filter((row) => row.title || row.instruction);
}

function mapOptionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function mapManufacturerConditions(
  raw: BackendAdminProduct["manufacturerConditions"],
): AdminManufacturerConditions {
  return {
    summary: String(raw?.summary ?? "").trim(),
    details: String(raw?.details ?? "").trim(),
    countryOfOrigin: String(raw?.countryOfOrigin ?? "").trim(),
    marketedBy: String(raw?.marketedBy ?? "").trim(),
    grievanceRedressal: String(raw?.grievanceRedressal ?? "").trim(),
  };
}

function resolvePrimaryKeyword(raw: BackendAdminProduct): string {
  const nested = raw.seo?.primaryKeyword;
  if (nested != null && String(nested).trim()) return String(nested).trim();
  return String(raw.primaryKeyword ?? "").trim();
}

function brandName(raw: BackendAdminProduct["brand"]): string {
  if (!raw || typeof raw === "string") return "";
  return String(raw.name ?? "").trim();
}

export function mapAdminProduct(raw: BackendAdminProduct | null | undefined): AdminProduct | null {
  if (!raw) return null;
  const id = idString(raw._id);
  if (!id) return null;

  const regular = Number(raw.regularPrice) || 0;
  const sale = Number(raw.salePrice) || 0;
  // Listing / cards: effective selling price.
  const price = sale > 0 && sale < regular ? sale : regular || sale;
  // Strikethrough only when a real discount exists.
  const compareAtPrice = sale > 0 && sale < regular ? regular : undefined;
  // Form fields must 1:1 match backend regularPrice / salePrice (autosave reopen).

  const variantAxes = mapVariantAxes(raw.variants);
  const variantPricing = raw.variantPricing ?? {};
  const variantStock = raw.variantStock ?? {};
  const variantSku = raw.variantSku ?? {};
  const variantMedia = raw.variantMedia ?? {};

  const combinations = generateVariantCombinations(variantAxes);
  const variants =
    combinations.length > 0
      ? combinations.map((combo) => {
          const key = normalizeVariantKey(combo) ?? "";
          const pricing = variantPricing[key];
          return {
            id: key,
            title: variantTitle(combo),
            sku: variantSku[key] ?? "",
            stock: Number(variantStock[key] ?? raw.stock) || 0,
            price: Number(pricing?.salePrice || pricing?.price || price) || 0,
          };
        })
      : [];

  const galleryImages = Array.isArray(raw.galleryImages)
    ? raw.galleryImages.map((img) => resolveMediaUrl(img)).filter(Boolean)
    : [];
  const galleryImageIds = Array.isArray(raw.galleryImageIds)
    ? raw.galleryImageIds.map((gid) => idString(gid)).filter(Boolean)
    : [];

  return {
    id,
    name: String(raw.name ?? "Untitled"),
    sku: String(raw.sku ?? ""),
    price,
    regularPrice: regular,
    salePrice: sale,
    compareAtPrice,
    stock: Number(raw.stock) || 0,
    status: mapProductStatus(raw.status),
    categoryId: refId(raw.category),
    subcategoryId: refId(raw.subcategory) || undefined,
    childCategoryId: refId(raw.childCategory) || undefined,
    brandId: refId(raw.brand) || undefined,
    brandName: brandName(raw.brand) || undefined,
    image: resolveMediaUrl(raw.mainImage),
    imageAlt: String(raw.name ?? "Product"),
    mainImageId: idString(raw.mainImageId) || undefined,
    galleryImages,
    galleryImageIds,
    video: raw.video ? resolveMediaUrl(raw.video) : undefined,
    videoId: idString(raw.videoId) || undefined,
    shortDescription: String(raw.shortDesc ?? ""),
    description: String(raw.longDesc ?? ""),
    length: mapOptionalNumber(raw.length),
    width: mapOptionalNumber(raw.width),
    height: mapOptionalNumber(raw.height),
    weight: mapOptionalNumber(raw.weight),
    featuresContent: String(raw.featuresContent ?? ""),
    usageSafetyContent: String(raw.usageSafetyContent ?? ""),
    usageInstructions: mapUsageInstructions(raw.usageInstructions),
    manufacturerConditions: mapManufacturerConditions(raw.manufacturerConditions),
    features: mapFeatures(raw.features),
    qandas: mapQandas(raw.qandas),
    variantAxes,
    variantPricing,
    variantStock,
    variantSku,
    variantMedia,
    variants,
    seoTitle: String(raw.metaTitle ?? ""),
    seoDescription: String(raw.metaDescription ?? ""),
    metaKeywords: String(raw.metaKeywords ?? ""),
    primaryKeyword: resolvePrimaryKeyword(raw),
    weightClassId:
      typeof raw.weightClass === "string"
        ? raw.weightClass
        : idString(raw.weightClass?._id),
    taxRate: Number(raw.taxRate) || 0,
    taxIncluded: raw.taxIncluded === true || raw.taxIncluded === "true",
    hsnCode: String(raw.hsnCode ?? "").trim(),
  };
}

export function mapAdminProducts(raw: unknown): AdminProduct[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => mapAdminProduct(item as BackendAdminProduct))
    .filter((item): item is AdminProduct => Boolean(item));
}
