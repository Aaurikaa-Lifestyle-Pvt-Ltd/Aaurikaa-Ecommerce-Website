import type {
  Product,
  ProductBadge,
  ProductVariant,
} from "@/types/commerce";
import { idString, resolveMediaUrl } from "./media";
import {
  cartesianVariantOptions,
  mapProductBrandName,
  mapProductDetailSections,
  mapProductFaqs,
  mapProductPrices,
  mapProductSeo,
  mergeProductGallerySources,
  normalizeVariantKey,
  stripSellerFields,
} from "./helpers";

export {
  cartesianVariantOptions,
  mapProductPrices,
  mergeProductGallerySources,
  normalizeVariantKey,
  stripSellerFields,
} from "./helpers";

type BackendVariantAxis = {
  type?: string;
  values?: string[];
};

type BackendVariantPrice = {
  price?: number;
  salePrice?: number;
  regularPrice?: number;
};

type BackendFeature = {
  key?: string;
  value?: string;
  code?: string;
  values?: string[];
};

type BackendQanda = {
  question?: string;
  answer?: string;
};

type BackendUsageInstruction = {
  title?: string;
  instruction?: string;
};

type BackendManufacturerConditions = {
  summary?: string;
  details?: string;
  countryOfOrigin?: string;
  marketedBy?: string;
  grievanceRedressal?: string;
};

export type BackendProduct = {
  _id?: unknown;
  id?: unknown;
  slug?: string;
  name?: string;
  sku?: string;
  mainImage?: string;
  galleryImages?: string[];
  regularPrice?: number;
  salePrice?: number;
  stock?: number;
  shortDesc?: string;
  longDesc?: string;
  length?: number;
  width?: number;
  height?: number;
  weight?: number;
  isFeatured?: boolean;
  createdAt?: string;
  category?: { slug?: string; name?: string } | string | null;
  subcategory?: { slug?: string; name?: string } | string | null;
  childCategory?: { slug?: string; name?: string } | string | null;
  brand?: { name?: string; slug?: string } | string | null;
  features?: BackendFeature[];
  featuresContent?: string;
  usageSafetyContent?: string;
  usageInstructions?: BackendUsageInstruction[];
  manufacturerConditions?: BackendManufacturerConditions;
  occasions?: Array<{ name?: string; slug?: string }>;
  qandas?: BackendQanda[];
  metaTitle?: string;
  metaDescription?: string;
  variants?: BackendVariantAxis[];
  variantPricing?: Record<string, BackendVariantPrice>;
  variantStock?: Record<string, number>;
  variantSku?: Record<string, string>;
  video?: string;
  avgRating?: number;
  reviewCount?: number;
  taxIncluded?: boolean;
};

function mapBadge(raw: BackendProduct, inStock: boolean, onSale: boolean): ProductBadge | undefined {
  if (!inStock) return "sold-out";
  if (onSale) return "sale";
  if (raw.isFeatured) return "trending";
  return undefined;
}

function mapVariants(
  raw: BackendProduct,
  fallback: ReturnType<typeof mapProductPrices>,
): ProductVariant[] {
  const axes = Array.isArray(raw.variants) ? raw.variants : [];
  const combos = cartesianVariantOptions(axes);
  if (combos.length === 0) return [];

  return combos.map((options) => {
    const key = normalizeVariantKey(options) ?? "default";
    const pricing = raw.variantPricing?.[key];
    const mapped = mapProductPrices(
      pricing?.regularPrice ?? pricing?.price ?? fallback.price.amount,
      pricing?.salePrice,
    );
    const stockRaw = raw.variantStock?.[key];
    const stockCount =
      stockRaw == null || !Number.isFinite(Number(stockRaw))
        ? undefined
        : Math.max(0, Math.floor(Number(stockRaw)));
    const inStock =
      stockCount == null ? (Number(raw.stock) || 0) > 0 : stockCount > 0;
    const title = Object.values(options).join(" / ");
    return {
      id: key,
      title,
      options,
      price: mapped.price,
      compareAtPrice: mapped.compareAtPrice,
      inStock,
      ...(stockCount != null ? { stock: stockCount } : {}),
      sku: raw.variantSku?.[key],
    };
  });
}

function categorySlug(raw: BackendProduct): string | undefined {
  if (!raw.category) return undefined;
  if (typeof raw.category === "string") return raw.category;
  return raw.category.slug;
}

function refSlug(
  value: { slug?: string; name?: string } | string | null | undefined,
): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  const slug = String(value.slug ?? "").trim();
  return slug || undefined;
}

export function mapBackendProduct(raw: BackendProduct | null | undefined): Product | null {
  if (!raw) return null;

  const rawRec = raw as Record<string, unknown>;
  const rawSeller = rawRec.seller as Record<string, unknown> | undefined;
  const rawSellerShop = rawRec.sellerShop as Record<string, unknown> | undefined;
  const isSellerVerified = Boolean(
    rawSeller?.isVerified ||
      rawSeller?.isApproved ||
      rawSellerShop?.isVerified ||
      rawSellerShop?.isApproved ||
      rawRec.isSellerVerified,
  );
  const merchantTitle =
    String(
      rawSeller?.shopName ||
        rawSellerShop?.shopName ||
        rawSeller?.firstName ||
        "",
    ).trim() || undefined;
  const seller =
    isSellerVerified || merchantTitle
      ? {
          shopName: merchantTitle,
          isVerified: isSellerVerified,
        }
      : undefined;

  const cleaned = stripSellerFields(
    { ...(raw as Record<string, unknown>) },
  ) as BackendProduct;

  const id = idString(cleaned._id ?? cleaned.id);
  const slug = String(cleaned.slug ?? "").trim();
  if (!id || !slug) return null;

  const prices = mapProductPrices(cleaned.regularPrice, cleaned.salePrice);
  const variants = mapVariants(cleaned, prices);
  const parentStockRaw = Number(cleaned.stock);
  const parentStock = Number.isFinite(parentStockRaw)
    ? Math.max(0, Math.floor(parentStockRaw))
    : 0;
  const inStock =
    variants.length > 0 ? variants.some((v) => v.inStock) : parentStock > 0;
  const onSale = Boolean(prices.compareAtPrice);
  const alt = cleaned.name ?? "Product";
  const imageSrc = resolveMediaUrl(cleaned.mainImage);
  const seenResolved = new Set<string>();
  const gallery = mergeProductGallerySources(
    cleaned.mainImage,
    cleaned.galleryImages,
  )
    .map((src) => ({ src: resolveMediaUrl(src), alt }))
    .filter((img) => {
      if (!img.src) return false;
      if (seenResolved.has(img.src)) return false;
      seenResolved.add(img.src);
      return true;
    });
  const videoRaw = String(cleaned.video ?? "").trim();
  const resolvedVideo = videoRaw ? resolveMediaUrl(videoRaw) : "";
  const videoUrl =
    resolvedVideo && resolvedVideo !== "/images/placeholder.svg"
      ? resolvedVideo
      : undefined;

  const cat = categorySlug(cleaned);
  const subcategorySlug = refSlug(cleaned.subcategory);
  const childCategorySlug = refSlug(cleaned.childCategory);
  const brand = mapProductBrandName(cleaned.brand);
  const sku = String(cleaned.sku ?? "").trim() || undefined;
  const details = mapProductDetailSections({
    sku,
    description: cleaned.longDesc,
    length: cleaned.length,
    width: cleaned.width,
    height: cleaned.height,
    weight: cleaned.weight,
    featuresContent: cleaned.featuresContent,
    usageSafetyContent: cleaned.usageSafetyContent,
    usageInstructions: cleaned.usageInstructions,
    manufacturerConditions: cleaned.manufacturerConditions,
    occasions: cleaned.occasions,
    features: cleaned.features,
  });
  const faqs = mapProductFaqs(cleaned.qandas);
  const { seoTitle, seoDescription } = mapProductSeo({
    metaTitle: cleaned.metaTitle,
    metaDescription: cleaned.metaDescription,
  });

  const avgRatingRaw = Number(cleaned.avgRating);
  const reviewCountRaw = Number(cleaned.reviewCount);
  const avgRating =
    Number.isFinite(avgRatingRaw) && avgRatingRaw > 0 ? avgRatingRaw : undefined;
  const reviewCount =
    Number.isFinite(reviewCountRaw) && reviewCountRaw > 0
      ? Math.floor(reviewCountRaw)
      : undefined;

  return {
    id,
    slug,
    name: String(cleaned.name ?? "Untitled"),
    sku,
    image: { src: imageSrc, alt },
    gallery: gallery.length > 0 ? gallery : undefined,
    ...(videoUrl ? { video: videoUrl } : {}),
    price: prices.price,
    compareAtPrice: prices.compareAtPrice,
    badge: mapBadge(cleaned, inStock, onSale),
    inStock,
    stock: parentStock,
    brand,
    categoryIds: cat ? [cat] : undefined,
    subcategorySlug,
    childCategorySlug,
    variants: variants.length > 0 ? variants : undefined,
    shortDescription: cleaned.shortDesc,
    description: cleaned.longDesc,
    details,
    faqs,
    seoTitle,
    seoDescription,
    ...(avgRating != null ? { avgRating } : {}),
    ...(reviewCount != null ? { reviewCount } : {}),
    ...(seller ? { seller } : {}),
    ...(typeof cleaned.taxIncluded === "boolean"
      ? { taxIncluded: cleaned.taxIncluded }
      : {}),
  };
}

export function mapBackendProducts(raw: unknown): Product[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => mapBackendProduct(item as BackendProduct))
    .filter((item): item is Product => Boolean(item));
}
